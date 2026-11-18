/**
 * «Войти через AMR ID» для приложений AMR (сейчас: AMR Bazar).
 * Токен: base64url(JSON) + "." + base64url(HMAC-SHA256(<base64url-JSON-строка>, секрет приложения)).
 * Возврат — только на адрес из белого списка (защита от открытого редиректа).
 */
import { createHmac, randomBytes } from "node:crypto";

export type ConnectApp = { id: string; title: string; returnUrl: string; secretEnv: string };

export const CONNECT_APPS: Record<string, ConnectApp> = {
  bazar: {
    id: "bazar",
    title: "AMR Bazar",
    returnUrl: "https://bazar.amrsys.net/api/auth/amrid",
    secretEnv: "AMR_ID_BAZAR_SECRET",
  },
  safar: {
    id: "safar",
    title: "AMR Safar",
    returnUrl: "https://safar.amrsys.net/api/auth/amrid",
    secretEnv: "AMR_ID_SAFAR_SECRET",
  },
};

export const TOKEN_TTL_SEC = 300;
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type ConnectRequest = { app: ConnectApp; state: string };

/** null = запрос неверный (неизвестное приложение, чужой адрес возврата, плохой state). */
export function checkConnect(app: unknown, ret: unknown, state: unknown): ConnectRequest | null {
  if (typeof app !== "string" || typeof ret !== "string" || typeof state !== "string") return null;
  const a = Object.prototype.hasOwnProperty.call(CONNECT_APPS, app) ? CONNECT_APPS[app] : undefined;
  if (!a) return null;
  if (ret !== a.returnUrl) return null; // точное совпадение, без вариантов
  if (!STATE_RE.test(state)) return null;
  return { app: a, state };
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

export function connectRedirect(req: ConnectRequest, token: string): string {
  const u = new URL(req.app.returnUrl);
  u.searchParams.set("token", token);
  u.searchParams.set("state", req.state);
  return u.toString();
}

/** Отображаемое имя: ник без «.amr» (настоящее имя хранится зашифрованным и серверу не видно). */
export function displayNameOf(nick: string): string {
  return nick.replace(/^@/, "").replace(/\.amr$/i, "");
}
