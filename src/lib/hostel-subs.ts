import { createHmac } from "node:crypto";

/**
 * 25.11.2026 «Мои подписки»: сроки подписок хостелов человека берём у Hostel.
 * Запрос подписан общим секретом AMR_ID_HOSTEL_SECRET с приставкой «amr-subs|v1» (не путается с токеном входа).
 * Hostel не ответил за 3 сек или ошибка - null, экран покажет запасной текст.
 */
export type HostelSub = { id: number; name: string; until: number | null; status: "active" | "expiring" | "expired" | "off" | "none" };

export function subsSig(secret: string, sub: string, nick: string, exp: number): string {
  return createHmac("sha256", secret).update(`amr-subs|v1|${sub}|${nick}|${exp}`).digest("base64url");
}

export async function hostelSubs(
  sub: string,
  nick: string,
  secret: string | undefined = process.env.AMR_ID_HOSTEL_SECRET,
  base = "https://hostel.amrsys.net",
  fetchFn: typeof fetch = fetch,
): Promise<HostelSub[] | null> {
  if (!secret || secret.length < 32) return null;
  const exp = Math.floor(Date.now() / 1000) + 60;
  const q = new URLSearchParams({ sub, nick, exp: String(exp), sig: subsSig(secret, sub, nick, exp) });
  try {
    const r = await fetchFn(`${base}/api/subs?${q}`, { signal: AbortSignal.timeout(3000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const d = (await r.json()) as { hostels?: unknown };
    if (!Array.isArray(d.hostels)) return null;
    return d.hostels
      .filter((h): h is HostelSub => !!h && typeof h === "object" && typeof (h as HostelSub).name === "string")
      .slice(0, 50)
      .map((h) => ({ id: Number(h.id), name: String(h.name).slice(0, 80), until: typeof h.until === "number" ? h.until : null, status: h.status }));
  } catch {
    return null;
  }
}
