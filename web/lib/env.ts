// Finds storage credentials even when Vercel added them with a custom prefix
// (common when connecting a store that another project already uses).

function entries(): [string, string][] {
  return Object.entries(process.env).filter((e): e is [string, string] => !!e[1]);
}

/** Upstash Redis REST url + token: KV_REST_API_*, UPSTASH_REDIS_REST_*, or any <PREFIX>_ variant. */
export function findRedisEnv(): { url: string; token: string } | null {
  const named = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ];
  for (const [u, t] of named) {
    if (process.env[u] && process.env[t]) return { url: process.env[u]!, token: process.env[t]! };
  }
  for (const [key, value] of entries()) {
    if (!/(REST_API_URL|REDIS_REST_URL)$/.test(key) || !/^https:\/\//.test(value)) continue;
    const token = process.env[key.replace(/URL$/, "TOKEN")];
    if (token) return { url: value, token };
  }
  return null;
}

/** Vercel Blob read-write token: BLOB_READ_WRITE_TOKEN or any <PREFIX>_READ_WRITE_TOKEN. */
export function findBlobToken(): string | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const hit = entries().find(
    ([key, value]) => key.endsWith("READ_WRITE_TOKEN") && value.startsWith("vercel_blob_rw_"),
  );
  return hit?.[1] ?? null;
}

/** Which pieces of server config are present (booleans only — never values). */
export function setupStatus() {
  return {
    redis: findRedisEnv() !== null,
    blob: findBlobToken() !== null,
    workerSecret: Boolean(process.env.WORKER_SECRET),
  };
}
