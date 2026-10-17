import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { getJob } from "@/lib/jobs";
import { error, isWorker, json } from "@/lib/http";

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Issues a short-lived Blob client token scoped to one file of one job, so the
 * worker can upload straight to Vercel Blob without holding the store token.
 * Body: { filename: string } (ascii, e.g. "softball-cheer-v1.mp3").
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isWorker(req)) return error("Unauthorized", 401);
  const { id } = await params;
  if (!(await getJob(id))) return error("Job not found", 404);

  const body = (await req.json().catch(() => ({}))) as { filename?: string };
  const filename = (body.filename ?? "song.mp3")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80);
  if (!filename.endsWith(".mp3")) return error("Only .mp3 uploads", 400);

  const pathname = `songs/${id}/${filename}`;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (process.env.NODE_ENV === "production") {
      return error("BLOB_READ_WRITE_TOKEN is not set (connect a Vercel Blob store).", 500);
    }
    // Local dev without Blob: the worker PUTs the file to this app instead.
    return json({ pathname, token: "", devUploadPath: `/api/dev-files/${pathname}` });
  }
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: ["audio/mpeg"],
    maximumSizeInBytes: MAX_BYTES,
    validUntil: Date.now() + 10 * 60 * 1000,
    addRandomSuffix: true,
  });
  return json({ pathname, token });
}
