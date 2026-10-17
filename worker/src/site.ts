// Client for the website's /api/worker/* endpoints.
import { put } from "@vercel/blob/client";
import { config } from "./config.ts";
import type { Job, JobPatch, Track } from "./types.ts";

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.siteUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.workerSecret}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function claim(
  heartbeat: boolean,
  references?: { id: string; name: string }[],
): Promise<Job | null> {
  const { job } = await call<{ job: Job | null }>("/api/worker/claim", {
    heartbeat,
    references,
  });
  return job;
}

export async function update(id: string, patch: JobPatch): Promise<void> {
  await call(`/api/worker/jobs/${id}`, patch);
}

/** Uploads one mp3 to Vercel Blob using a token the website issues per file. */
export async function uploadMp3(
  jobId: string,
  filename: string,
  mp3: Buffer,
): Promise<Track> {
  const { pathname, token, devUploadPath } = await call<{
    pathname: string;
    token: string;
    devUploadPath?: string;
  }>(`/api/worker/jobs/${jobId}/upload-token`, { filename });

  if (devUploadPath) {
    // Website running locally without Blob (see web/app/api/dev-files).
    const res = await fetch(`${config.siteUrl}${devUploadPath}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${config.workerSecret}` },
      body: new Uint8Array(mp3),
    });
    if (!res.ok) throw new Error(`dev upload failed: HTTP ${res.status}`);
    return res.json() as Promise<Track>;
  }

  const blob = await put(pathname, mp3, {
    access: "public",
    token,
    contentType: "audio/mpeg",
  });
  return { url: blob.url, downloadUrl: blob.downloadUrl };
}
