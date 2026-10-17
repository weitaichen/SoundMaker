// The PC-side service: polls the website for song requests, has Claude write
// them, renders audio locally, and uploads the MP3s to Vercel Blob.
import { readFileSync } from "node:fs";
import { PublicError } from "./claude.ts";
import { assertConfig, config } from "./config.ts";
import { pickEngine } from "./engines/index.ts";
import { aceStepHealthy } from "./engines/acestep.ts";
import { listReferences } from "./references.ts";
import { claim, update, uploadMp3 } from "./site.ts";
import type { Job, Track } from "./types.ts";

const HEARTBEAT_EVERY_MS = 45_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...args: unknown[]) =>
  console.log(new Date().toLocaleTimeString("zh-TW", { hour12: false }), ...args);

function slugify(text: string): string {
  const ascii = text
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii.slice(0, 40) || "song";
}

async function processJob(job: Job) {
  const t0 = Date.now();
  log(`▶ ${job.id} 「${(job.input.prompt || job.input.lyrics).slice(0, 40)}」 ${job.input.duration}s`);
  try {
    const engine = await pickEngine();
    await update(job.id, { engine: engine.name, stageText: "Claude 正在作詞作曲…" });

    const fixture = config.fixturePlan
      ? JSON.parse(readFileSync(config.fixturePlan, "utf8"))
      : undefined;
    const { song, audio } = await engine.run(job, (patch) => update(job.id, patch), fixture);
    log(`  ♪ ${song.title} — ${audio.length} 個版本，上傳中`);
    await update(job.id, { status: "uploading", stageText: "上傳中…" });

    const base = `${slugify(song.slug || song.title)}-${job.id.slice(0, 6)}`;
    const tracks: Track[] = [];
    for (const [i, a] of audio.entries()) {
      const name = audio.length > 1 ? `${base}-v${i + 1}.mp3` : `${base}.mp3`;
      const track = await uploadMp3(job.id, name, a.mp3);
      tracks.push({ ...track, duration: a.duration });
    }

    await update(job.id, { status: "done", stageText: "完成", tracks });
    log(`✔ ${job.id} 完成（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`✖ ${job.id} 失敗：${message}`);
    const shown = e instanceof PublicError ? e.publicMessage : `生成失敗：${message.slice(0, 200)}`;
    await update(job.id, { status: "failed", error: shown }).catch(() => {});
  }
}

async function main() {
  assertConfig();
  const ace = await aceStepHealthy();
  log(`曲匠 AI worker 啟動 → ${config.siteUrl}`);
  log(`引擎設定：${config.engine}（ACE-Step ${ace ? "在線" : "未啟動"} @ ${config.acestepUrl}）`);
  if (config.fixturePlan) log(`⚠ 測試模式：不呼叫 Claude，固定使用 ${config.fixturePlan}`);
  if (config.engine === "auto" && !ace) {
    log("  ACE-Step 沒開時會用內建合成器（純音樂）。要有人聲請先執行 start-acestep.bat");
  }

  let lastBeat = 0;
  let lastRefs = 0;
  let lastError = "";
  for (;;) {
    try {
      const heartbeat = Date.now() - lastBeat > HEARTBEAT_EVERY_MS;
      // Publish the local reference library at startup and every 10 minutes.
      const sendRefs = Date.now() - lastRefs > 10 * 60_000;
      const job = await claim(heartbeat, sendRefs ? listReferences() : undefined);
      if (heartbeat) lastBeat = Date.now();
      if (sendRefs) lastRefs = Date.now();
      if (lastError) {
        log("已重新連上網站");
        lastError = "";
      }
      if (job) {
        await processJob(job);
        continue; // check for the next job right away
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== lastError) log(`連線網站失敗：${message}`);
      lastError = message;
    }
    await sleep(config.pollIntervalMs);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
