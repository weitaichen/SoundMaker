import { getReferences, queueLength, workerLastSeen } from "@/lib/jobs";
import { accessCodeRequired, json } from "@/lib/http";
import { WORKER_SEEN_TTL_SECONDS } from "@/lib/redis";

export async function GET() {
  try {
    const [seen, queued, references] = await Promise.all([
      workerLastSeen(),
      queueLength(),
      getReferences(),
    ]);
    const online =
      seen !== null && Date.now() - seen < WORKER_SEEN_TTL_SECONDS * 1000;
    return json({
      configured: true,
      workerOnline: online,
      queued,
      references,
      accessCodeRequired: accessCodeRequired(),
    });
  } catch {
    return json({
      configured: false,
      workerOnline: false,
      queued: 0,
      references: [],
      accessCodeRequired: accessCodeRequired(),
    });
  }
}
