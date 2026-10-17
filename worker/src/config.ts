function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function num(name: string, fallback: number): number {
  const v = Number(env(name));
  return Number.isFinite(v) && env(name) !== "" ? v : fallback;
}

export const config = {
  siteUrl: env("SITE_URL").replace(/\/$/, ""),
  workerSecret: env("WORKER_SECRET"),
  /** auto = ACE-Step when its API answers, otherwise the built-in synth. */
  engine: env("ENGINE", "auto") as "auto" | "acestep" | "synth",
  pollIntervalMs: num("POLL_INTERVAL_MS", 10_000),

  claudeBin: env("CLAUDE_BIN", "claude"),
  claudeModel: env("CLAUDE_MODEL"),
  claudeTimeoutMs: num("CLAUDE_TIMEOUT_MS", 240_000),

  acestepUrl: env("ACESTEP_URL", "http://127.0.0.1:8001").replace(/\/$/, ""),
  acestepApiKey: env("ACESTEP_API_KEY"),
  acestepBatch: num("ACESTEP_BATCH", 2),
  acestepSteps: num("ACESTEP_STEPS", 8),
  acestepThinking: env("ACESTEP_THINKING", "false") === "true",
  /** Optional style reference (absolute path to a wav/mp3, ~30 s used). */
  acestepReferenceAudio: env("ACESTEP_REFERENCE_AUDIO"),
  acestepTimeoutMs: num("ACESTEP_TIMEOUT_MS", 15 * 60_000),

  ffmpegBin: env("FFMPEG_BIN", "ffmpeg"),

  /** Testing only: skip Claude and use this saved plan for every job. */
  fixturePlan: env("FIXTURE_PLAN"),
};

export function assertConfig() {
  const missing = [];
  if (!config.siteUrl) missing.push("SITE_URL");
  if (!config.workerSecret) missing.push("WORKER_SECRET");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")} — copy worker/.env.example to worker/.env and fill it in.`,
    );
  }
}
