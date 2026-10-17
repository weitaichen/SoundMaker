import { claimNextJob, saveReferences, touchWorker } from "@/lib/jobs";
import { error, isWorker, json } from "@/lib/http";
import type { ReferenceStyle } from "@/lib/types";

/**
 * The PC-side worker polls this endpoint.
 * Body: { heartbeat?: boolean, references?: ReferenceStyle[] }.
 * Heartbeats and the reference list are opt-in per call so idle polling stays cheap on Redis.
 */
export async function POST(req: Request) {
  if (!isWorker(req)) return error("Unauthorized", 401);
  const body = (await req.json().catch(() => ({}))) as {
    heartbeat?: boolean;
    references?: ReferenceStyle[];
  };

  if (Array.isArray(body.references)) await saveReferences(body.references);
  const job = await claimNextJob();
  if (job || body.heartbeat) await touchWorker();
  return json({ job });
}
