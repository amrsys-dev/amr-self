/**
 * Plans (тарифы) for every AMR app live in AMR ID.
 * An app gets a signed «entitlement»: {app, nick, plan, exp}. Signature = Ed25519,
 * the app keeps the public key inside, so it checks the plan without internet until `exp`.
 */
import { createPrivateKey, sign as edSign, verify as edVerify, createPublicKey } from "node:crypto";

export const PLAN_APPS = {
  cut: ["free", "pro", "business"],
  safar: ["free", "pro"],
  "3d": ["free", "pro"],
} as const satisfies Record<string, readonly string[]>;
export type PlanApp = keyof typeof PLAN_APPS;
export type PlanRecord = { plan: string; until?: number; trial?: boolean };

/**
 * AMR plan scheme for every app: free forever (limited by features, not by count) +
 * a one-time trial of the paid plan when the person first signs in with AMR ID.
 * One trial per account and per device; after it ends, everything stays, the free plan is back.
 */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: Partial<Record<keyof typeof PLAN_APPS, string>> = { cut: "pro", safar: "pro", "3d": "pro" };

/** Gives the trial if this account never had one (and has no paid plan). Returns the new plans or null. */
export function grantTrial(
  plans: Record<string, PlanRecord> | undefined,
  trials: Record<string, number> | undefined,
  app: keyof typeof PLAN_APPS,
  nowMs = Date.now(),
): { plans: Record<string, PlanRecord>; trials: Record<string, number> } | null {
  const tp = TRIAL_PLAN[app];
  if (!tp) return null;
  if (trials?.[app]) return null;
  const cur = plans?.[app];
  if (cur && cur.plan !== "free") return null; // had or has a real plan
  return {
    plans: { ...(plans ?? {}), [app]: { plan: tp, until: nowMs + TRIAL_DAYS * 86400_000, trial: true } },
    trials: { ...(trials ?? {}), [app]: nowMs },
  };
}

/** How long an app may trust a signed plan without asking again (offline work). */
export const ENTITLEMENT_TTL_SEC = 30 * 86400;

export function isPlanApp(v: unknown): v is PlanApp {
  return typeof v === "string" && Object.hasOwn(PLAN_APPS, v);
}

export function isPlanOf(app: PlanApp, plan: unknown): plan is string {
  return typeof plan === "string" && (PLAN_APPS[app] as readonly string[]).includes(plan);
}

/** Current plan of a user in an app; an expired paid plan falls back to "free". */
export function planOf(plans: Record<string, PlanRecord> | undefined, app: PlanApp, nowMs = Date.now()): { plan: string; until?: number; trial?: boolean } {
  const p = plans?.[app];
  if (!p || !isPlanOf(app, p.plan)) return { plan: "free" };
  if (p.until && p.until <= nowMs) return { plan: "free" };
  return { plan: p.plan, ...(p.until ? { until: p.until } : {}), ...(p.trial ? { trial: true } : {}) };
}

const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

function keyFromSeed(seedB64url: string) {
  const seed = Buffer.from(seedB64url, "base64url");
  if (seed.length !== 32) throw new Error("bad plan key");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
}

/** "<payload b64url>.<signature b64url>" */
export function signEntitlement(payload: { app: string; sub: string; nick: string; plan: string; until?: number; trial?: boolean; admin?: boolean; iat: number; exp: number }, seedB64url: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = edSign(null, Buffer.from(body, "utf8"), keyFromSeed(seedB64url)).toString("base64url");
  return `${body}.${sig}`;
}

/** For tests and tools: the public key (raw, base64url) of a seed. */
export function publicKeyOf(seedB64url: string): string {
  const jwk = createPublicKey(keyFromSeed(seedB64url)).export({ format: "jwk" }) as { x: string };
  return jwk.x;
}

export function verifyEntitlement(token: string, publicKeyB64url: string): Record<string, unknown> | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKeyB64url }, format: "jwk" });
  if (!edVerify(null, Buffer.from(body, "utf8"), pub, Buffer.from(sig, "base64url"))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Apps that may read the plan from the browser (same site, with the AMR ID cookie). */
export const PLAN_ORIGINS: Record<PlanApp, readonly string[]> = {
  cut: ["https://cut.amrsys.net", "https://cutting.amrsys.net"],
  safar: ["https://safar.amrsys.net"],
  "3d": ["https://3d.amrsys.net"],
};

export function adminNicks(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** 27.11.2026 (Мурад): владелец AMR (AMR_ADMINS) - высший тариф каждого приложения, без срока и без подписки. */
export function ownerPlan(app: PlanApp): { plan: string } {
  const list = PLAN_APPS[app] as readonly string[];
  return { plan: list[list.length - 1]! };
}
