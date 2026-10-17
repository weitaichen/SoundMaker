import { JOB_TTL_SECONDS, WORKER_SEEN_TTL_SECONDS, keys, redis } from "./redis";
import type { Job, JobInput, ReferenceStyle } from "./types";

/** A job stuck in an in-progress state longer than this is treated as lost. */
const STALE_AFTER_MS = 20 * 60 * 1000;
const IN_PROGRESS = new Set(["composing", "rendering", "uploading"]);

export function newJobId(): string {
  // Leading letter: Upstash JSON-parses values, so an all-digit or "1e5…" id
  // would come back from the queue as a number.
  return "s" + crypto.randomUUID().replace(/-/g, "").slice(0, 15);
}

export async function createJob(input: JobInput): Promise<Job> {
  const job: Job = {
    id: newJobId(),
    input,
    status: "queued",
    createdAt: Date.now(),
  };
  const r = redis();
  await r.set(keys.job(job.id), job, { ex: JOB_TTL_SECONDS });
  await r.lpush(keys.queue, job.id);
  return job;
}

function markStale(job: Job): Job {
  if (
    IN_PROGRESS.has(job.status) &&
    job.startedAt &&
    Date.now() - job.startedAt > STALE_AFTER_MS
  ) {
    return {
      ...job,
      status: "failed",
      error: "生成服務沒有回應（可能已關閉），請重新生成。",
    };
  }
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  const job = await redis().get<Job>(keys.job(id));
  return job ? markStale(job) : null;
}

/** Fetches several jobs at once and fills in queue positions for queued ones. */
export async function getJobs(ids: string[]): Promise<Job[]> {
  if (ids.length === 0) return [];
  const r = redis();
  const raw = await r.mget<(Job | null)[]>(...ids.map(keys.job));
  const jobs = raw.filter((j): j is Job => j !== null).map(markStale);

  if (jobs.some((j) => j.status === "queued")) {
    // LPUSH adds on the left and the worker RPOPs from the right, so the
    // number of jobs ahead is everything to the right of this one.
    const queue = await r.lrange<string>(keys.queue, 0, -1);
    for (const job of jobs) {
      const idx = queue.indexOf(job.id);
      if (job.status === "queued" && idx >= 0) {
        job.queueAhead = queue.length - 1 - idx;
      }
    }
  }
  return jobs;
}

export async function updateJob(
  id: string,
  patch: Partial<Job>,
): Promise<Job | null> {
  const r = redis();
  const job = await r.get<Job>(keys.job(id));
  if (!job) return null;
  const next: Job = { ...job, ...patch, id: job.id, input: job.input };
  await r.set(keys.job(id), next, { ex: JOB_TTL_SECONDS });
  return next;
}

/** Pops the oldest queued job and marks it as started. */
export async function claimNextJob(): Promise<Job | null> {
  const r = redis();
  // A popped id may point at an expired record; skip those.
  for (let i = 0; i < 5; i++) {
    const id = await r.rpop<string>(keys.queue);
    if (!id) return null;
    const job = await updateJob(id, {
      status: "composing",
      stageText: "Claude 正在構思歌曲…",
      startedAt: Date.now(),
    });
    if (job) return job;
  }
  return null;
}

export async function touchWorker(): Promise<void> {
  await redis().set(keys.workerSeen, Date.now(), {
    ex: WORKER_SEEN_TTL_SECONDS,
  });
}

export async function workerLastSeen(): Promise<number | null> {
  return redis().get<number>(keys.workerSeen);
}

export async function queueLength(): Promise<number> {
  return redis().llen(keys.queue);
}

/** The worker publishes its style-reference library so the site can list it. */
export async function saveReferences(list: ReferenceStyle[]): Promise<void> {
  const clean = list
    .filter((r) => typeof r?.id === "string" && typeof r?.name === "string")
    .slice(0, 30)
    .map((r) => ({ id: r.id.slice(0, 40), name: r.name.slice(0, 40) }));
  await redis().set(keys.workerRefs, clean);
}

export async function getReferences(): Promise<ReferenceStyle[]> {
  return (await redis().get<ReferenceStyle[]>(keys.workerRefs)) ?? [];
}
