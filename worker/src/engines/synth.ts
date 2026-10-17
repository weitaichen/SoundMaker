// Fallback engine: Claude writes every note, the built-in synth plays it.
// Instrumental only, but needs no GPU or model download.
import { toMp3 } from "../audio.ts";
import { composeForSynth, type SynthPlan } from "../composer.ts";
import type { Engine, SongPlan } from "../types.ts";
import { SR, renderSong } from "./synth-render.ts";

const LEAD_NAMES: Record<SynthPlan["lead"], string> = {
  brass: "brass lead",
  square: "chiptune square lead",
  saw: "supersaw lead",
  piano: "piano",
  pluck: "plucked string",
  flute: "flute",
};

/** Interleaves stereo float PCM to 16-bit and encodes it as MP3. */
function encodeMp3([L, R]: [Float32Array, Float32Array]): Promise<Buffer> {
  const pcm = Buffer.alloc(L.length * 4);
  for (let i = 0; i < L.length; i++) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
  }
  return toMp3(pcm, ["-f", "s16le", "-ar", String(SR), "-ac", "2"]);
}

function toSongPlan(plan: SynthPlan): SongPlan {
  const byName = new Map(plan.sections.map((s) => [s.name, s]));
  // For an instrumental, show the form and chord chart where lyrics would go.
  const chart = plan.form
    .map((name) => {
      const s = byName.get(name);
      return s ? `[${name}]\n${s.chords.join(" | ")}` : null;
    })
    .filter(Boolean)
    .join("\n\n");
  return {
    title: plan.title,
    slug: plan.slug,
    summary: plan.summary,
    tags: plan.tags,
    caption: `instrumental, ${LEAD_NAMES[plan.lead]}, ${plan.form.join(" → ")}`,
    lyrics: `[Instrumental]\n\n${chart}`,
    bpm: plan.bpm,
    keyScale: `${plan.key} ${plan.mode === "minor" ? "Minor" : "Major"}`,
    timeSignature: "4",
    vocalLanguage: "unknown",
  };
}

export const synthEngine: Engine = {
  name: "內建合成器",

  async run(job, report, presetPlan) {
    const plan = (presetPlan as SynthPlan | undefined) ?? (await composeForSynth(job.input));
    if (job.input.mode === "custom" && job.input.title) plan.title = job.input.title;
    const song = toSongPlan(plan);
    await report({ status: "rendering", stageText: "合成器演奏中…", song, engine: this.name });

    const pcm = renderSong(plan, job.input.duration);
    const mp3 = await encodeMp3(pcm);
    return { song, audio: [{ mp3, duration: pcm[0].length / SR }] };
  },
};
