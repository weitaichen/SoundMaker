"use client";

import type { Job, JobInput, ReferenceStyle, Track } from "./types";

const JOBS_KEY = "aimusic.jobs";
const CODE_KEY = "aimusic.accessCode";

// localStorage can throw (private mode, blocked storage); never let that break the page.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadJobIds(): string[] {
  try {
    const ids = JSON.parse(read(JOBS_KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function saveJobIds(ids: string[]) {
  write(JOBS_KEY, JSON.stringify(ids.slice(0, 50)));
}
export function loadAccessCode(): string {
  return read(CODE_KEY) ?? "";
}
export function saveAccessCode(code: string) {
  write(CODE_KEY, code);
}

export interface Health {
  configured: boolean;
  workerOnline: boolean;
  queued: number;
  references: ReferenceStyle[];
  accessCodeRequired: boolean;
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health", { cache: "no-store" });
  return res.json();
}

export async function fetchJobs(ids: string[]): Promise<Job[]> {
  if (ids.length === 0) return [];
  const res = await fetch(`/api/jobs?ids=${ids.join(",")}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function submitJob(input: JobInput, accessCode: string) {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-code": accessCode },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as Job;
}

export const isActive = (job: Job) =>
  job.status !== "done" && job.status !== "failed";

/** One playable item in the workspace / player queue. */
export interface PlayItem {
  key: string;
  job: Job;
  track: Track;
  version: number;
  title: string;
}

export function playItems(jobs: Job[]): PlayItem[] {
  return jobs.flatMap((job) =>
    (job.tracks ?? []).map((track, i) => ({
      key: `${job.id}:${i}`,
      job,
      track,
      version: i + 1,
      title: job.song?.title ?? "未命名歌曲",
    })),
  );
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Deterministic gradient cover from a string. */
export function coverStyle(seed: string): React.CSSProperties {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h >> 8) % 80) % 360;
  return {
    background: `radial-gradient(circle at 30% 25%, hsl(${a} 85% 62%), transparent 60%),
      radial-gradient(circle at 75% 80%, hsl(${b} 80% 50%), transparent 55%),
      linear-gradient(135deg, hsl(${a} 45% 18%), hsl(${b} 50% 12%))`,
  };
}
