import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function error(message: string, status: number) {
  return json({ error: message }, status);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** True when the request carries `Authorization: Bearer <WORKER_SECRET>`. */
export function isWorker(req: Request): boolean {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && safeEqual(token, secret);
}

export function accessCodeRequired(): boolean {
  return Boolean(process.env.ACCESS_CODE);
}

export function hasAccess(req: Request): boolean {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  return safeEqual(req.headers.get("x-access-code") ?? "", code);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
