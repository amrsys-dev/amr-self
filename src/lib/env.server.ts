export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function vercelEnv(): string {
  return env("VERCEL_ENV") ?? (env("NODE_ENV") === "production" ? "production" : "development");
}

/** Test OTP is never available in production, even if OTP_MODE=test is set by mistake. */
export function isTestMode(): boolean {
  if (vercelEnv() === "production") return false;
  if (env("OTP_MODE") === "off") return false;
  if (env("OTP_MODE") === "test") return true;
  return !env("TG_OTP_BOT_TOKEN") && !env("RESEND_API_KEY") && !env("OTP_RELAY_URL");
}

export function sessionSecret(): string {
  const s = env("SESSION_SECRET");
  if (s && s.length >= 16) return s;
  if (vercelEnv() === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return "amrid-dev-session-secret-not-for-prod";
}

export function publicCardOrigin(request: Request): string {
  const fromEnv = env("PUBLIC_CARD_ORIGIN");
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (!host) return "";
  return `${proto}://${host}`;
}

/** Login / 2FA / contact-verification codes go only to Telegram until a domain is approved. */
export function emailOtpEnabled(): boolean {
  const v = (env("AMR_OTP_EMAIL") ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** One-time recovery codes issued at signup. Default 10; also supports 1. */
export function recoveryCodesCount(): number {
  const raw = env("AMR_RECOVERY_CODES");
  const n = raw == null ? 10 : Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 10) return n;
  return 10;
}

export type DoConfig = { url: string; secret: string };

export function readDoConfig(): DoConfig | null {
  const url = env("CF_DO_URL");
  const secret = env("CF_DO_SECRET");
  if (!url || !secret) return null;
  return { url: url.replace(/\/$/, ""), secret };
}

