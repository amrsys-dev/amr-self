import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "../env.server.ts";
import { sessionKey, type UserRecord } from "../user.ts";
import { getStores } from "../storage/index.ts";

const COOKIE = "amrid_session";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type Session = { id: string; nick: string; exp: number };

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

export async function createSession(nick: string): Promise<{ cookie: string; session: Session }> {
  const id = randomBytes(18).toString("base64url");
  const session: Session = { id, nick, exp: Date.now() + TTL_MS };
  await getStores().kv.put(sessionKey(id), JSON.stringify(session));
  return { cookie: serializeCookie(cookieValue(id), TTL_MS / 1000), session };
}

export async function destroySession(request: Request): Promise<string> {
  const id = readSessionId(request);
  if (id) await getStores().kv.delete(sessionKey(id));
  return serializeCookie("", 0);
}

function serializeCookie(value: string, maxAge: number): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (!value) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${secure}`;
}

export { COOKIE as SESSION_COOKIE };

export async function requireUser(request: Request): Promise<UserRecord | Response> {
  const { nickKey } = await import("../user.ts");
  const s = await readSession(request);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  const raw = await getStores().kv.get(nickKey(s.nick));
  if (!raw) return Response.json({ error: "unauthorized" }, { status: 401 });
  return JSON.parse(raw) as UserRecord;
}
