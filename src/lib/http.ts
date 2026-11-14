import { isTestMode, readDoConfig } from "./env.server.ts";
import { LOGIN_LIMIT, NICK_LIMIT, OTP_LIMIT, createKvRateLimiter, createMemoryRateLimiter, type AsyncRateLimiter } from "./rate-limit.ts";
import { getStores, readCloudflareConfig } from "./storage/index.ts";
import { createDoRateLimiter } from "./storage/durable-object.ts";

export type Limiters = { login: AsyncRateLimiter; otp: AsyncRateLimiter; nick: AsyncRateLimiter };

const g = globalThis as unknown as { __amridLim?: Limiters };

/** Memory limiter only in test mode; KV-backed (CF KV when those envs are set) otherwise. */
export function resetLimitsForTests(): void {
  delete g.__amridLim;
}

function useMemoryLimits(): boolean {
  if (readCloudflareConfig()) return false;
  if (isTestMode()) return true;
  if ((process.env.AMR_STORE ?? "").trim() === "memory") return true;
  return false;
}

export function getLimits(): Limiters {
  if (g.__amridLim) return g.__amridLim;
  if (useMemoryLimits()) {
    g.__amridLim = {
      login: createMemoryRateLimiter(LOGIN_LIMIT),
      otp: createMemoryRateLimiter(OTP_LIMIT),
      nick: createMemoryRateLimiter(NICK_LIMIT),
    };
    return g.__amridLim;
  }
  const doCfg = readDoConfig();
  if (doCfg) {
    g.__amridLim = {
      login: createDoRateLimiter(doCfg, LOGIN_LIMIT, "login"),
      otp: createDoRateLimiter(doCfg, OTP_LIMIT, "otp"),
      nick: createDoRateLimiter(doCfg, NICK_LIMIT, "nick"),
    };
    return g.__amridLim;
  }
  const kv = getStores().kv;
  g.__amridLim = {
    login: createKvRateLimiter(kv, LOGIN_LIMIT, "login"),
    otp: createKvRateLimiter(kv, OTP_LIMIT, "otp"),
    nick: createKvRateLimiter(kv, NICK_LIMIT, "nick"),
  };
  return g.__amridLim;
}

/** @deprecated use getLimits() — kept as a getter alias during the transition */
export const limits = {
  get login() {
    return getLimits().login;
  },
  get otp() {
    return getLimits().otp;
  },
  get nick() {
    return getLimits().nick;
  },
};

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  // TanStack Start emits inline hydration bootstrap (per-request, so hashes are unstable).
  // A per-request nonce would be tighter once CSP is no longer a static Vercel header.
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; upgrade-insecure-requests",
};

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

export function jsonWithCookie(data: unknown, cookie: string, status = 200): Response {
  return json(data, status, { "Set-Cookie": cookie });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
