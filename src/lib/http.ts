import { LOGIN_LIMIT, OTP_LIMIT, createMemoryRateLimiter, type RateLimiter } from "./rate-limit.ts";

const g = globalThis as unknown as { __amridLim?: { login: RateLimiter; otp: RateLimiter } };
if (!g.__amridLim) {
  g.__amridLim = {
    login: createMemoryRateLimiter(LOGIN_LIMIT),
    otp: createMemoryRateLimiter(OTP_LIMIT),
  };
}

export const limits = g.__amridLim;

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function jsonWithCookie(data: unknown, cookie: string, status = 200): Response {
  return Response.json(data, { status, headers: { "Set-Cookie": cookie } });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
