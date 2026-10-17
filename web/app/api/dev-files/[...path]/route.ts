// Local `next dev` only: stands in for Vercel Blob when BLOB_READ_WRITE_TOKEN
// is not set, so the whole flow can be tried on one machine.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { findBlobToken } from "@/lib/env";
import { error, isWorker, json } from "@/lib/http";

const ROOT = join(process.cwd(), ".dev-uploads");
const enabled = () => process.env.NODE_ENV !== "production" && !findBlobToken();

function resolvePath(parts: string[]): string | null {
  const full = resolve(ROOT, parts.join("/"));
  return full.startsWith(ROOT + sep) ? full : null;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function PUT(req: Request, { params }: Ctx) {
  if (!enabled()) return error("Not found", 404);
  if (!isWorker(req)) return error("Unauthorized", 401);
  const { path } = await params;
  const file = resolvePath(path);
  if (!file) return error("Bad path", 400);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await req.arrayBuffer()));
  const url = `${new URL(req.url).origin}/api/dev-files/${path.join("/")}`;
  return json({ url, downloadUrl: `${url}?download=1` });
}

export async function GET(req: Request, { params }: Ctx) {
  if (!enabled()) return error("Not found", 404);
  const { path } = await params;
  const file = resolvePath(path);
  if (!file) return error("Bad path", 400);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return error("Not found", 404);
  }
  const data = await readFile(file);
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
  };
  if (new URL(req.url).searchParams.has("download")) {
    headers["Content-Disposition"] = `attachment; filename="${path[path.length - 1]}"`;
  }
  // Byte ranges let the <audio> element seek.
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    return new Response(data.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}` },
    });
  }
  return new Response(data, { headers: { ...headers, "Content-Length": String(size) } });
}
