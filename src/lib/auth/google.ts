/**
 * «Войти через Google» (OpenID Connect, authorization code + PKCE + nonce).
 * Enabled only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. The callback address is fixed.
 */
import { createHash, createPublicKey, createVerify, randomBytes } from "node:crypto";

export const GOOGLE_CALLBACK = "https://self.amrsys.net/api/auth/google/callback";
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
/** Deleting with Google needs a sign-in at Google not older than this. */
export const GOOGLE_FRESH_SEC = 300;
export const GOOGLE_STATE_TTL_SEC = 600;

export type GooglePurpose = "login" | "link" | "delete";
export type GoogleState = { purpose: GooglePurpose; verifier: string; nonce: string; sessionId?: string; nick?: string; exp: number };
/** Only the stable Google id is kept (PDPL: no email, no name). */
export type GoogleClaims = { sub: string; authTime?: number };

export function googleConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleStateKey = (state: string) => `gstate:${state}`;
export const googleSubKey = (sub: string) => `google:${sub}`;

const b64u = (b: Buffer) => b.toString("base64url");

export function newGoogleRequest(purpose: GooglePurpose, clientId: string) {
  const state = b64u(randomBytes(24));
  const verifier = b64u(randomBytes(48));
  const nonce = b64u(randomBytes(24));
  const challenge = b64u(createHash("sha256").update(verifier).digest());
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", GOOGLE_CALLBACK);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (purpose === "delete") {
    // Force a fresh sign-in at Google; auth_time is checked on return.
    u.searchParams.set("prompt", "login");
    u.searchParams.set("max_age", "0");
  } else {
    u.searchParams.set("prompt", "select_account");
  }
  return { state, verifier, nonce, url: u.toString() };
}

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;
/** Google rotates keys: an unknown kid triggers one refetch, at most every 30 s. */
const JWKS_REFETCH_MIN_MS = 30_000;
export function resetGoogleKeysForTests() {
  jwksCache = null;
}
export function ageGoogleKeysForTests(ms: number) {
  if (jwksCache) jwksCache.at -= ms;
}
async function googleKeys(f: typeof fetch, force = false): Promise<Jwk[]> {
  if (jwksCache && !force && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  if (jwksCache && force && Date.now() - jwksCache.at < JWKS_REFETCH_MIN_MS) return jwksCache.keys;
  const r = await f(GOOGLE_JWKS);
  if (!r.ok) throw new Error("jwks");
  const d = (await r.json()) as { keys?: Jwk[] };
  jwksCache = { at: Date.now(), keys: d.keys ?? [] };
  return jwksCache.keys;
}

/** Full id_token check: RS256 signature by a Google key, iss, aud, exp/iat, nonce. Returns null when anything is off. */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { clientId: string; nonce: string; now?: number; fetchImpl?: typeof fetch },
): Promise<GoogleClaims | null> {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let p: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  const f = opts.fetchImpl ?? fetch;
  const pick = (keys: Jwk[]) => keys.find((k) => k.kid === header.kid && k.kty === "RSA");
  let jwk = pick(await googleKeys(f).catch(() => []));
  if (!jwk) jwk = pick(await googleKeys(f, true).catch(() => []));
  if (!jwk) return null;
  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
  const ok = createVerify("RSA-SHA256").update(`${parts[0]}.${parts[1]}`).verify(key, Buffer.from(parts[2], "base64url"));
  if (!ok) return null;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!GOOGLE_ISSUERS.includes(String(p.iss))) return null;
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(opts.clientId)) return null;
  if (typeof p.exp !== "number" || p.exp < now - 30) return null;
  if (typeof p.iat !== "number" || p.iat > now + 300) return null;
  if (p.nonce !== opts.nonce) return null;
  if (typeof p.sub !== "string" || !p.sub || p.sub.length > 255) return null;
  return {
    sub: p.sub,
    authTime: typeof p.auth_time === "number" ? p.auth_time : undefined,
  };
}

export async function exchangeGoogleCode(
  code: string,
  verifier: string,
  cfg: { clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const r = await fetchImpl(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: GOOGLE_CALLBACK,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });
  if (!r.ok) return null;
  const d = (await r.json()) as { id_token?: string };
  return typeof d.id_token === "string" ? d.id_token : null;
}
