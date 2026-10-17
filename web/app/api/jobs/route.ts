import { createJob, getJobs, queueLength } from "@/lib/jobs";
import { clientIp, error, hasAccess, json } from "@/lib/http";
import { keys, redis } from "@/lib/redis";
import {
  DURATION_MAX,
  DURATION_MIN,
  type JobInput,
  type VocalGender,
  type VocalLanguage,
} from "@/lib/types";

const GENDERS: VocalGender[] = ["auto", "female", "male", "duet", "choir"];
const LANGUAGES: VocalLanguage[] = ["auto", "zh", "yue", "en", "ja", "ko"];

const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 6);
const MAX_QUEUE = Number(process.env.MAX_QUEUE ?? 20);

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseInput(body: Record<string, unknown>): JobInput | string {
  const mode = body.mode === "custom" ? "custom" : "easy";
  const prompt = str(body.prompt, 600);
  const lyrics = mode === "custom" ? str(body.lyrics, 3000) : "";
  const title = mode === "custom" ? str(body.title, 50) : "";
  const instrumental = body.instrumental === true;

  if (mode === "easy" && !prompt) return "請描述你想要的歌曲。";
  if (mode === "custom" && !prompt && !lyrics) return "請至少填寫歌詞或曲風。";

  const duration = Math.round(Number(body.duration));
  if (!Number.isFinite(duration)) return "歌曲長度無效。";

  return {
    mode,
    prompt,
    lyrics,
    title,
    instrumental,
    vocalGender: GENDERS.includes(body.vocalGender as VocalGender)
      ? (body.vocalGender as VocalGender)
      : "auto",
    language: LANGUAGES.includes(body.language as VocalLanguage)
      ? (body.language as VocalLanguage)
      : "auto",
    duration: Math.min(DURATION_MAX, Math.max(DURATION_MIN, duration)),
    reference:
      typeof body.reference === "string" && /^[a-z0-9_-]{1,40}$/i.test(body.reference)
        ? body.reference
        : "auto",
    quality: body.quality === "best" ? "best" : "fast",
  };
}

export async function POST(req: Request) {
  if (!hasAccess(req)) return error("通行碼不正確。", 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const input = parseInput(body);
  if (typeof input === "string") return error(input, 400);

  const r = redis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rlKey = keys.rateLimit(clientIp(req), hour);
  const used = await r.incr(rlKey);
  if (used === 1) await r.expire(rlKey, 3600);
  if (used > RATE_LIMIT_PER_HOUR) {
    return error(`每小時最多生成 ${RATE_LIMIT_PER_HOUR} 首，請稍後再試。`, 429);
  }
  if ((await queueLength()) >= MAX_QUEUE) {
    return error("排隊的歌曲太多了，請稍後再試。", 429);
  }

  const job = await createJob(input);
  return json(job, 201);
}

/** GET /api/jobs?ids=a,b,c — the browser keeps its own list of job ids. */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9]{8,32}$/.test(s))
    .slice(0, 50);
  return json(await getJobs(ids));
}
