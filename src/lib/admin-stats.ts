import { createHmac } from "node:crypto";

/**
 * 26.11.2026 общая админка AMR ID (Мурад): статистика всех приложений в одном месте.
 * Сервер AMR ID спрашивает приложения запросом, подписанным их общим секретом входа с приставкой
 * «amr-admin|v1» (не путается с токеном входа и с «Мои подписки»). Приложение не ответило за 4 сек - null.
 */
export function adminSig(secret: string, action: string, body: string, exp: number): string {
  return createHmac("sha256", secret).update(`amr-admin|v1|${action}|${body}|${exp}`).digest("base64url");
}

export const ADMIN_APPS = {
  safar: { base: "https://safar.amrsys.net", secretEnv: "AMR_ID_SAFAR_SECRET" },
  hostel: { base: "https://hostel.amrsys.net", secretEnv: "AMR_ID_HOSTEL_SECRET" },
} as const;
export type AdminApp = keyof typeof ADMIN_APPS;

export async function appStats(app: AdminApp, secret: string | undefined, fetchFn: typeof fetch = fetch): Promise<Record<string, unknown> | null> {
  if (!secret || secret.length < 32) return null;
  const exp = Math.floor(Date.now() / 1000) + 60;
  const q = new URLSearchParams({ action: "stats", exp: String(exp), sig: adminSig(secret, "stats", "", exp) });
  try {
    const r = await fetchFn(`${ADMIN_APPS[app].base}/api/amr-admin?${q}`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const d = (await r.json()) as unknown;
    return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function appCommand(app: AdminApp, secret: string | undefined, payload: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<{ status: number; data: unknown }> {
  if (!secret || secret.length < 32) return { status: 503, data: { error: "not_configured" } };
  const body = JSON.stringify(payload);
  const exp = Math.floor(Date.now() / 1000) + 60;
  try {
    const r = await fetchFn(`${ADMIN_APPS[app].base}/api/amr-admin`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", "x-amr-exp": String(exp), "x-amr-sig": adminSig(secret, String(payload.action), body, exp) },
      body,
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  } catch {
    return { status: 504, data: { error: "timeout" } };
  }
}
