// Local test without the website:
//   npm run compose -- "壘球隊應援歌，隊名閃電" [--engine acestep|synth] [--duration 90]
//        [--reference auto|none|<id>] [--quality fast|best]
//   npm run compose -- --plan-only "..."            (only ask Claude, print the plan)
//   npm run compose -- --plan out/x.json --engine synth   (skip Claude, render a saved plan)
// Writes the plan and mp3 file(s) to worker/out/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { composeForAceStep, composeForSynth } from "./composer.ts";
import { pickEngine } from "./engines/index.ts";
import type { JobInput } from "./types.ts";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const engineName = flag("engine");
const duration = Number(flag("duration") ?? 90);
const reference = flag("reference") ?? "auto";
const quality = flag("quality") === "best" ? "best" : "fast";
const planFile = flag("plan");
const presetPlan = planFile ? JSON.parse(readFileSync(planFile, "utf8")) : undefined;
const planOnly = argv.includes("--plan-only");
const prompt = argv.filter((a) => !a.startsWith("--")).join(" ") || "一首壘球隊應援歌，隊名叫閃電";

const input: JobInput = {
  mode: "easy",
  prompt,
  lyrics: "",
  title: "",
  instrumental: false,
  vocalGender: "auto",
  language: "auto",
  duration,
  reference,
  quality,
};

const outDir = join(import.meta.dirname, "..", "out");
mkdirSync(outDir, { recursive: true });
const t0 = Date.now();

if (planOnly) {
  const plan =
    engineName === "synth" ? await composeForSynth(input) : await composeForAceStep(input);
  console.log(JSON.stringify(plan, null, 2));
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} else {
  const engine = await pickEngine(engineName);
  console.log(`engine: ${engine.name}`);
  const { song, audio } = await engine.run(
    { id: `local${Date.now()}`, input, status: "composing" },
    async (patch) => {
      if (patch.stageText) console.log(`… ${patch.stageText}`);
    },
    presetPlan,
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify(song, null, 2));
  audio.forEach((a, i) => {
    const file = join(outDir, `${stamp}-v${i + 1}.mp3`);
    writeFileSync(file, a.mp3);
    console.log(`saved ${file} (${(a.mp3.length / 1024).toFixed(0)} KB)`);
  });
  console.log(`${song.title} — done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
