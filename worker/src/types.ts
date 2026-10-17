// Mirrors web/lib/types.ts.

export type JobStatus =
  | "queued"
  | "composing"
  | "rendering"
  | "uploading"
  | "done"
  | "failed";

export interface JobInput {
  mode: "easy" | "custom";
  prompt: string;
  lyrics: string;
  title: string;
  instrumental: boolean;
  vocalGender: "auto" | "female" | "male" | "duet" | "choir";
  language: "auto" | "zh" | "yue" | "en" | "ja" | "ko";
  duration: number;
  /** "auto", "none", or a reference id from references/references.json. */
  reference?: string;
  quality?: "fast" | "best";
}

export interface SongPlan {
  title: string;
  /** ASCII name for the download filename. */
  slug?: string;
  summary: string;
  tags: string[];
  caption: string;
  lyrics: string;
  bpm: number;
  keyScale: string;
  timeSignature: string;
  vocalLanguage: string;
}

export interface Track {
  url: string;
  downloadUrl: string;
  duration?: number;
}

export interface Job {
  id: string;
  input: JobInput;
  status: JobStatus;
}

/** Audio produced by an engine, before upload. */
export interface RenderedAudio {
  mp3: Buffer;
  duration?: number;
}

export interface JobPatch {
  status?: JobStatus;
  stageText?: string;
  engine?: string;
  song?: SongPlan;
  tracks?: Track[];
  error?: string;
}

export interface Engine {
  name: string;
  /**
   * Writes the song with Claude, then renders one or more versions.
   * `presetPlan` skips the Claude step (used by the local CLI for testing).
   */
  run(
    job: Job,
    report: (patch: JobPatch) => Promise<void>,
    presetPlan?: unknown,
  ): Promise<{ song: SongPlan; audio: RenderedAudio[] }>;
}
