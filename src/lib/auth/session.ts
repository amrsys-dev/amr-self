import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "../env.server.ts";
import { sessionKey, sessionsOfKey, type UserRecord } from "../user.ts";
import { getStores } from "../storage/index.ts";
import { json } from "../http.ts";

/** Only essential cookie: session id. No analytics or marketing cookies. */
const COOKIE = "amrid_session";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** How this session was signed in; deleting the account asks again with the same method. Old sessions: "password". */
export type SignInMethod = "password" | "telegram" | "google" | "amrid";
export type Session = { id: string; nick: string; exp: number; method?: SignInMethod; authAt?: number };

function sign(id: string): string {
  return createHmac("sha256", sessionSecret()).update(id).digest("base64url");
}

function cookieValue(id: string): string {
  return `${id}.${sign(id)}`;
}

function parseCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

export function readSessionId(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const part = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  if (!part) return null;
  return parseCookie(part.slice(COOKIE.length + 1));
}

export async function readSession(request: Request): Promise<Session | null> {
  const id = readSessionId(request);
  if (!id) return null;
  const raw = await getStores().kv.get(sessionKey(id));
  if (!raw) return null;
  const s = JSON.parse(raw) as Session;
  if (s.exp < Date.now()) {
    await getStores().kv.delete(sessionKey(id));
    return null;
  }
  return s;
}

export async function createSession(nick: string, method: SignInMethod = "password"): Promise<{ cookie: string; session: Session }> {
  const id = randomBytes(18).toString("base64url");
  const session: Session = { id, nick, exp: Date.now() + TTL_MS, method, authAt: Date.now() };
  const kv = getStores().kv;
  await kv.put(sessionKey(id), JSON.stringify(session));
  const listRaw = await kv.get(sessionsOfKey(nick));
  const ids = listRaw ? (JSON.parse(listRaw) as string[]) : [];
  if (!ids.includes(id)) ids.push(id);
  await kv.put(sessionsOfKey(nick), JSON.stringify(ids));
  return { cookie: serializeCookie(cookieValue(id), TTL_MS / 1000), session };
}

export async function destroySession(request: Request): Promise<string> {
  const id = readSessionId(request);
  if (id) {
    const kv = getStores().kv;
    const raw = await kv.get(sessionKey(id));
    await kv.delete(sessionKey(id));
    if (raw) {
      const s = JSON.parse(raw) as Session;
      const listRaw = await kv.get(sessionsOfKey(s.nick));
      const ids = (listRaw ? (JSON.parse(listRaw) as string[]) : []).filter((x) => x !== id);
      if (ids.length) await kv.put(sessionsOfKey(s.nick), JSON.stringify(ids));
      else await kv.delete(sessionsOfKey(s.nick));
    }
  }
  return serializeCookie("", 0);
}

/** Revoke every session for this account (password reset / account deletion). */
export async function revokeAllSessions(nick: string): Promise<void> {
  const kv = getStores().kv;
  const listRaw = await kv.get(sessionsOfKey(nick));
  const ids = listRaw ? (JSON.parse(listRaw) as string[]) : [];
  for (const id of ids) await kv.delete(sessionKey(id));
  await kv.delete(sessionsOfKey(nick));
}

function serializeCookie(value: string, maxAge: number): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (!value) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${secure}`;
}

export { COOKIE as SESSION_COOKIE };

/**
 * Changes (POST/PUT/PATCH/DELETE) must come from this site. The session cookie is
 * already SameSite=Lax; this also rejects cross-site requests by Origin / Sec-Fetch-Site.
 */
export function crossSiteRejected(request: Request): boolean {
  const m = request.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if ((request.headers.get("sec-fetch-site") ?? "") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function requireUser(request: Request): Promise<UserRecord | Response> {
  if (crossSiteRejected(request)) return json({ error: "forbidden" }, 403);
  const { nickKey } = await import("../user.ts");
  const s = await readSession(request);
  if (!s) return json({ error: "unauthorized" }, 401);
  const raw = await getStores().kv.get(nickKey(s.nick));
  if (!raw) return json({ error: "unauthorized" }, 401);
  return JSON.parse(raw) as UserRecord;
}
