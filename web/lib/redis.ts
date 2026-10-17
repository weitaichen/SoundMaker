import { Redis } from "@upstash/redis";

/** The subset of Redis this app uses. */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  mget<T extends unknown[]>(...keys: string[]): Promise<T>;
  lpush(key: string, ...values: string[]): Promise<number>;
  rpop<T = string>(key: string): Promise<T | null>;
  lrange<T = string>(key: string, start: number, stop: number): Promise<T[]>;
  llen(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

// Upstash via the Vercel Marketplace injects KV_REST_API_* (and sometimes
// UPSTASH_REDIS_REST_*); accept either naming.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

/** Local `next dev` without Upstash: keep everything in memory. */
export const devMode = !url && process.env.NODE_ENV !== "production";

class MemoryStore implements Store {
  private data = new Map<string, { v: unknown; exp?: number }>();

  private read(key: string) {
    const e = this.data.get(key);
    if (e?.exp && e.exp < Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  private list(key: string): string[] {
    const e = this.read(key);
    if (!e) {
      const l: string[] = [];
      this.data.set(key, { v: l });
      return l;
    }
    return e.v as string[];
  }
  async get<T>(key: string) {
    const e = this.read(key);
    return e ? (structuredClone(e.v) as T) : null;
  }
  async set(key: string, value: unknown, opts?: { ex?: number }) {
    this.data.set(key, {
      v: structuredClone(value),
      exp: opts?.ex ? Date.now() + opts.ex * 1000 : undefined,
    });
    return "OK";
  }
  async mget<T extends unknown[]>(...keys: string[]) {
    return Promise.all(keys.map((k) => this.get(k))) as Promise<T>;
  }
  async lpush(key: string, ...values: string[]) {
    const l = this.list(key);
    l.unshift(...values.reverse());
    return l.length;
  }
  async rpop<T = string>(key: string) {
    return (this.list(key).pop() as T) ?? null;
  }
  async lrange<T = string>(key: string, start: number, stop: number) {
    return this.list(key).slice(start, stop === -1 ? undefined : stop + 1) as T[];
  }
  async llen(key: string) {
    return this.list(key).length;
  }
  async incr(key: string) {
    const n = Number(this.read(key)?.v ?? 0) + 1;
    this.data.set(key, { v: n, exp: this.read(key)?.exp });
    return n;
  }
  async expire(key: string, seconds: number) {
    const e = this.read(key);
    if (e) e.exp = Date.now() + seconds * 1000;
    return e ? 1 : 0;
  }
}

const g = globalThis as unknown as { __aimusicStore?: Store };

export function redis(): Store {
  if (g.__aimusicStore) return g.__aimusicStore;
  if (url && token) {
    g.__aimusicStore = new Redis({ url, token }) as unknown as Store;
  } else if (devMode) {
    g.__aimusicStore = new MemoryStore();
  } else {
    throw new Error(
      "Redis is not configured: set KV_REST_API_URL / KV_REST_API_TOKEN (Upstash).",
    );
  }
  return g.__aimusicStore;
}

export const keys = {
  job: (id: string) => `job:${id}`,
  queue: "queue",
  workerSeen: "worker:seen",
  workerRefs: "worker:references",
  rateLimit: (ip: string, hour: number) => `rl:${ip}:${hour}`,
};

/** Job records (not the audio files) expire after this long. */
export const JOB_TTL_SECONDS = 60 * 60 * 24 * 30;
/** The worker counts as online if it checked in within this window. */
export const WORKER_SEEN_TTL_SECONDS = 120;
