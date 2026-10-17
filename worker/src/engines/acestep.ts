// Claude writes caption + lyrics; the local ACE-Step 1.5 API sings and plays it.
// API reference: engines/ACE-Step-1.5/docs/en/API.md
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import * as OpenCC from "opencc-js";
import { toMp3 } from "../audio.ts";
import { composeForAceStep } from "../composer.ts";
import { config } from "../config.ts";
import { resolveReference } from "../references.ts";
import type { Engine, RenderedAudio, SongPlan } from "../types.ts";

const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });

function authHeaders(): Record<string, string> {
  return config.acestepApiKey ? { Authorization: `Bearer ${config.acestepApiKey}` } : {};
}

export async function aceStepHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${config.acestepUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function post<T>(path: string, body: Record<string, unknown> | FormData): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${config.acestepUrl}${path}`, {
    method: "POST",
    headers: isForm ? authHeaders() : { ...authHeaders(), "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: string;
    detail?: string;
  };
  if (!res.ok || data.data === undefined) {
    throw new Error(`ACE-Step ${path}: ${data.error ?? data.detail ?? `HTTP ${res.status}`}`);
  }
  return data.data;
}

/** The server only accepts reference audio as an upload, so switch to multipart then. */
async function taskBody(
  fields: Record<string, string | number | boolean>,
  referenceAudio?: string,
): Promise<Record<string, unknown> | FormData> {
  if (!referenceAudio) return fields;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  const bytes = await readFile(referenceAudio);
  form.append("reference_audio", new Blob([new Uint8Array(bytes)]), basename(referenceAudio));
  return form;
}

interface QueryItem {
  task_id: string;
  status: 0 | 1 | 2;
  result: string;
}
interface OutputItem {
  file: string;
  status: number;
  metas?: { duration?: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "A Minor" / "Am" / "Bb maj" → ACE-Step's "A minor" / "Bb major" form. */
export function normalizeKey(key: string): string {
  const m = key.trim().match(/^([A-Ga-g])([#b♯♭]?)\s*(major|minor|maj|min|m)?/i);
  if (!m) return "";
  const raw = m[3] ?? "";
  const minor = raw !== "" && raw !== "M" && !/^maj/i.test(raw);
  return `${m[1].toUpperCase()}${m[2]} ${minor ? "minor" : "major"}`;
}

export const aceStepEngine: Engine = {
  name: "ACE-Step 1.5",

  async run(job, report, presetPlan) {
    const song = (presetPlan as SongPlan | undefined) ?? (await composeForAceStep(job.input));
    const reference = resolveReference(job.input);
    const referencePath = reference?.path ?? (config.acestepReferenceAudio || undefined);
    const thinking = job.input.quality === "best" || config.acestepThinking;
    const engineLabel = [
      this.name,
      thinking ? "精緻模式" : "標準模式",
      reference ? `參考：${reference.name}` : null,
    ].filter(Boolean).join(" · ");
    await report({
      status: "rendering",
      stageText: thinking ? "AI 樂團先規劃結構，再錄製…" : "AI 樂團錄製中…",
      song,
      engine: engineLabel,
    });

    // The model was trained mostly on Simplified Chinese; the display copy stays Traditional.
    const lyrics = song.vocalLanguage === "zh" ? toSimplified(song.lyrics) : song.lyrics;

    const body = await taskBody(
      {
        prompt: song.caption,
        lyrics,
        audio_duration: job.input.duration,
        bpm: song.bpm,
        key_scale: normalizeKey(song.keyScale),
        time_signature: song.timeSignature,
        vocal_language: job.input.instrumental ? "unknown" : song.vocalLanguage,
        audio_format: "wav", // encoded to high-quality MP3 below
        inference_steps: config.acestepSteps,
        batch_size: config.acestepBatch,
        thinking,
        // With thinking on, ACE-Step's LM plans the audio; keep Claude's caption/language.
        use_cot_caption: false,
        use_cot_language: false,
        use_random_seed: true,
      },
      referencePath,
    );
    const task = await post<{ task_id: string }>("/release_task", body);

    const started = Date.now();
    let lastReport = Date.now();
    let outputs: OutputItem[] | null = null;
    while (!outputs) {
      if (Date.now() - started > config.acestepTimeoutMs) {
        throw new Error("ACE-Step 生成逾時");
      }
      await sleep(2000);
      const [item] = await post<QueryItem[]>("/query_result", {
        task_id_list: [task.task_id],
      });
      if (!item) continue;
      if (item.status === 2) {
        throw new Error(`ACE-Step 生成失敗：${item.result?.slice(0, 200) ?? ""}`);
      }
      if (item.status === 1) {
        outputs = JSON.parse(item.result) as OutputItem[];
        break;
      }
      // Keep the website's "worker online" heartbeat fresh during long renders.
      if (Date.now() - lastReport > 30_000) {
        lastReport = Date.now();
        const secs = Math.round((Date.now() - started) / 1000);
        await report({ stageText: `AI 樂團錄製中…（${secs} 秒）` });
      }
    }

    const audio: RenderedAudio[] = [];
    for (const out of outputs) {
      if (!out.file) continue;
      const res = await fetch(`${config.acestepUrl}${out.file}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`ACE-Step download failed: HTTP ${res.status}`);
      const wav = Buffer.from(await res.arrayBuffer());
      audio.push({
        mp3: await toMp3(wav, ["-f", "wav"]),
        duration: out.metas?.duration ?? job.input.duration,
      });
    }
    if (audio.length === 0) throw new Error("ACE-Step 沒有產生音檔");
    return { song, audio };
  },
};
