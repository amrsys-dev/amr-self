/**
 * «Войти через AMR ID» для приложений AMR (AMR Bazar, SELF, AMR Cut, AMR Safar, AMR Hostel).
 * Токен: base64url(JSON) + "." + base64url(HMAC-SHA256(<base64url-JSON-строка>, секрет приложения)).
 * Возврат - только на адрес из белого списка (защита от открытого редиректа).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** returnUrl - основной адрес; extraReturnUrls - ещё точные адреса (например, превью на своём домене). */
export type ConnectApp = { id: string; title: string; returnUrl: string; extraReturnUrls?: readonly string[]; secretEnv: string };

export const CONNECT_APPS: Record<string, ConnectApp> = {
  bazar: {
    id: "bazar",
    title: "AMR Bazar",
    returnUrl: "https://bazar.amrsys.net/api/auth/amrid",
    secretEnv: "AMR_ID_BAZAR_SECRET",
  },
  self: {
    id: "self",
    title: "SELF",
    returnUrl: "https://self.amrsys.net/api/auth/amrid",
    secretEnv: "", // derived from the session secret (same server), see connectSecret
  },
  cut: {
    id: "cut",
    title: "AMR Cut",
    returnUrl: "https://cut.amrsys.net/",
    secretEnv: "", // the app reads its signed plan from /api/entitlement
  },
  safar: {
    id: "safar",
    title: "AMR Safar",
    returnUrl: "https://safar.amrsys.net/api/auth/amrid",
    secretEnv: "AMR_ID_SAFAR_SECRET",
  },
  hostel: {
    id: "hostel",
    title: "AMR Hostel",
    returnUrl: "https://hostel.amrsys.net/api/auth/amrid",
    extraReturnUrls: ["https://hostel-preview.amrsys.net/api/auth/amrid"], // без *.vercel.app
    secretEnv: "AMR_ID_HOSTEL_SECRET",
  },
};

export const TOKEN_TTL_SEC = 300;
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type ConnectRequest = { app: ConnectApp; state: string; ret: string };

/** null = запрос неверный (неизвестное приложение, чужой адрес возврата, плохой state). */
export function checkConnect(app: unknown, ret: unknown, state: unknown): ConnectRequest | null {
  if (typeof app !== "string" || typeof ret !== "string" || typeof state !== "string") return null;
  const a = Object.prototype.hasOwnProperty.call(CONNECT_APPS, app) ? CONNECT_APPS[app] : undefined;
  if (!a) return null;
  if (ret !== a.returnUrl && !(a.extraReturnUrls ?? []).includes(ret)) return null; // точное совпадение, без вариантов
  if (!STATE_RE.test(state)) return null;
  return { app: a, state, ret };
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signConnectToken(
  input: { sub: string; nick: string; name: string; aud: string; state: string },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  jti = randomBytes(16).toString("base64url"),
): string {
  const payload = { sub: input.sub, nick: input.nick, name: input.name, aud: input.aud, iat: nowSec, exp: nowSec + TOKEN_TTL_SEC, jti, state: input.state };
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

/** Checks a token made by signConnectToken: signature, audience, expiry and state. null = reject. */
export function verifyConnectToken(
  token: string,
  secret: string,
  aud: string,
  state: string,
  nowSec = Math.floor(Date.now() / 1000),
): { sub: string; nick: string } | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || !STATE_RE.test(state)) return null;
  const want = createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (p.aud !== aud || p.state !== state || typeof p.exp !== "number" || p.exp < nowSec) return null;
    if (typeof p.sub !== "string" || typeof p.nick !== "string" || !p.nick) return null;
    return { sub: p.sub, nick: p.nick };
  } catch {
    return null;
  }
}

export function connectRedirect(req: ConnectRequest, token: string): string {
  const u = new URL(req.ret);
  u.searchParams.set("token", token);
  u.searchParams.set("state", req.state);
  return u.toString();
}

/** Отображаемое имя: ник без «.amr» (настоящее имя хранится зашифрованным и серверу не видно). */
export function displayNameOf(nick: string): string {
  return nick.replace(/^@/, "").replace(/\.amr$/i, "");
}
