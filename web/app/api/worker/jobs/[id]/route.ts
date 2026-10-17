import { touchWorker, updateJob } from "@/lib/jobs";
import { error, isWorker, json } from "@/lib/http";
import type { Job, JobStatus } from "@/lib/types";

const STATUSES: JobStatus[] = [
  "composing",
  "rendering",
  "uploading",
  "done",
  "failed",
];
const FIELDS = ["stageText", "engine", "song", "tracks", "error"] as const;

/** Worker progress/result updates for one job. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isWorker(req)) return error("Unauthorized", 401);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Partial<Job> | null;
  if (!body) return error("Invalid JSON", 400);

  const patch: Partial<Job> = {};
  if (body.status) {
    if (!STATUSES.includes(body.status)) return error("Bad status", 400);
    patch.status = body.status;
    if (body.status === "done" || body.status === "failed") {
      patch.finishedAt = Date.now();
    }
  }
  for (const f of FIELDS) {
    if (body[f] !== undefined) Object.assign(patch, { [f]: body[f] });
  }

  const [job] = await Promise.all([updateJob(id, patch), touchWorker()]);
  if (!job) return error("Job not found", 404);
  return json({ ok: true });
}
