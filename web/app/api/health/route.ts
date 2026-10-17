import { setupStatus } from "@/lib/env";
import { getReferences, queueLength, workerLastSeen } from "@/lib/jobs";
import { accessCodeRequired, json } from "@/lib/http";
import { WORKER_SEEN_TTL_SECONDS, devMode } from "@/lib/redis";

export async function GET() {
  // Which env vars are present (true/false only), so setup problems are visible
  // without opening the Vercel dashboard.
  // (Local `next dev` runs on in-memory storage, so there is nothing to report.)
  const setup = devMode ? undefined : setupStatus();
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
      setup,
    });
  } catch (e) {
    return json({
      configured: false,
      workerOnline: false,
      queued: 0,
      references: [],
      accessCodeRequired: accessCodeRequired(),
      setup,
      // Env present but the connection failed (wrong token, deleted store…).
      redisError: setup?.redis
        ? String(e instanceof Error ? e.message : e)
            .replace(/https?:\/\/\S+/g, "<url>")
            .slice(0, 160)
        : undefined,
    });
  }
}
