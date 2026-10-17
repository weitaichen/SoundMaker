// Shared job model. The worker (../worker/src/types.ts) mirrors these shapes.

export type JobStatus =
  | "queued"
  | "composing"
  | "rendering"
  | "uploading"
  | "done"
  | "failed";

export type VocalGender = "auto" | "female" | "male" | "duet" | "choir";
export type VocalLanguage = "auto" | "zh" | "yue" | "en" | "ja" | "ko";

export interface JobInput {
  mode: "easy" | "custom";
  /** Easy mode: free-form description. Custom mode: style description. */
  prompt: string;
  /** Custom mode only. Empty means "let Claude write them". */
  lyrics: string;
  /** Custom mode only. Empty means "let Claude name it". */
  title: string;
  instrumental: boolean;
  vocalGender: VocalGender;
  language: VocalLanguage;
  /** Target length in seconds. */
  duration: number;
  /** Style reference: "auto", "none", or a reference id published by the worker. */
  reference: string;
  /** "fast" = turbo only; "best" = plan with ACE-Step's LM first (slower). */
  quality: "fast" | "best";
}

/** A style reference song that lives on the worker PC. */
export interface ReferenceStyle {
  id: string;
  name: string;
}

export interface SongPlan {
  title: string;
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
  stageText?: string;
  engine?: string;
  song?: SongPlan;
  tracks?: Track[];
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Only set on responses for queued jobs: jobs ahead of this one. */
  queueAhead?: number;
}

export const DURATION_MIN = 30;
export const DURATION_MAX = 240;
