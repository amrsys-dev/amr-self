/**
 * SELF signs in through AMR ID (id.amrsys.net), like Bazar and Safar.
 * GET /api/auth/amrid            → state cookie, then to the AMR ID consent page.
 * GET /api/auth/amrid?token&state → check the token, open a SELF session, back to "/".
 * The data key is not part of this: SELF asks for the password once to unlock the encrypted data.
 */
import { randomBytes } from "node:crypto";
import { CONNECT_APPS, verifyConnectToken } from "../connect.ts";
import { connectSecret } from "../env.server.ts";
import { getStores } from "../storage/index.ts";
import { nickKey, type UserRecord } from "../user.ts";
import { createSession } from "./session.ts";

export const ID_ORIGIN = "https://id.amrsys.net";
const STATE_COOKIE = "amrid_self_state";

function cookie(value: string, maxAge: number): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=${value}; Path=/api/auth/amrid; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function go(location: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: location, "Cache-Control": "private, no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers: h });
}

export async function handleAmridSelf(request: Request): Promise<Response> {
  const app = CONNECT_APPS.self!;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    const state = randomBytes(24).toString("base64url");
    const to = new URL("/connect", ID_ORIGIN);
    to.searchParams.set("app", app.id);
    to.searchParams.set("return", app.returnUrl);
    to.searchParams.set("state", state);
    return go(to.toString(), [cookie(state, 600)]);
  }
  const clear = cookie("", 0);
  const fail = () => go("/?amrid=failed", [clear]);
  const secret = connectSecret(app.id, app.secretEnv);
  if (!secret || secret.length < 32) return fail();
  const state = url.searchParams.get("state") ?? "";
  const saved = (request.headers.get("cookie") ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1) ?? "";
  if (!saved || saved !== state) return fail();
  const claim = verifyConnectToken(token, secret, app.id, state);
  if (!claim) return fail();
  const raw = await getStores().kv.get(nickKey(claim.nick));
  if (!raw) return fail();
  const user = JSON.parse(raw) as UserRecord;
  if ((user.dataId ?? user.nick) !== claim.sub) return fail();
  const { cookie: session } = await createSession(user.nick, "amrid");
  return go("/", [clear, session]);
}
