/**
 * AMR cloud copy for app data (projects, products…), paid plans only.
 * The app sends one packed file; AMR ID keeps it as-is (it never reads it).
 * Every save has a number (rev). A save must name the rev it started from;
 * if someone saved in between, the app gets 409, takes the newer copy, merges and tries again.
 * The file goes to blob storage under a new name first, then the pointer moves (compare-and-set),
 * so a broken write never leaves a half file.
 */
import type { BlobStore, KvStore } from "./storage/types.ts";
import { PLAN_APPS, planOf, type PlanApp, type PlanRecord } from "./plans.ts";

export const CLOUD_MAX_BYTES = 3 * 1024 * 1024;
export type CloudMeta = { rev: number; at: number; size: number };

export const cloudMetaKey = (app: PlanApp, owner: string) => `cloud:${app}:${owner}`;
export const cloudBlobKey = (app: PlanApp, owner: string, rev: number) => `cloud/${app}/${owner}/${rev}.bin`;

/** Cloud is for every plan except free. */
export function cloudAllowed(plans: Record<string, PlanRecord> | undefined, app: PlanApp, nowMs = Date.now()): boolean {
  return Object.hasOwn(PLAN_APPS, app) && planOf(plans, app, nowMs).plan !== "free";
}

function parseMeta(raw: string | null): CloudMeta | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as CloudMeta;
    return Number.isInteger(m.rev) && m.rev > 0 ? m : null;
  } catch {
    return null;
  }
}

export async function cloudRead(kv: KvStore, blobs: BlobStore, app: PlanApp, owner: string): Promise<{ meta: CloudMeta; data: Uint8Array } | null> {
  const meta = parseMeta(await kv.get(cloudMetaKey(app, owner)));
  if (!meta) return null;
  const data = await blobs.get(cloudBlobKey(app, owner, meta.rev));
  return data ? { meta, data } : null;
}

export type CloudWrite = { ok: true; meta: CloudMeta } | { ok: false; reason: "conflict" | "too_big" | "empty"; rev?: number };

export async function cloudWrite(kv: KvStore, blobs: BlobStore, app: PlanApp, owner: string, base: number, data: Uint8Array, now = Date.now()): Promise<CloudWrite> {
  if (!data.length) return { ok: false, reason: "empty" };
  if (data.length > CLOUD_MAX_BYTES) return { ok: false, reason: "too_big" };
  const key = cloudMetaKey(app, owner);
  const curRaw = await kv.get(key);
  const cur = parseMeta(curRaw);
  const curRev = cur?.rev ?? 0;
  if (curRev !== base) return { ok: false, reason: "conflict", rev: curRev };
  const meta: CloudMeta = { rev: curRev + 1, at: now, size: data.length };
  await blobs.put(cloudBlobKey(app, owner, meta.rev), data, "application/octet-stream");
  const moved = await kv.compareAndSet(key, cur ? curRaw : null, JSON.stringify(meta));
  if (!moved) {
    await blobs.delete(cloudBlobKey(app, owner, meta.rev)).catch(() => {});
    const now2 = parseMeta(await kv.get(key));
    return { ok: false, reason: "conflict", rev: now2?.rev ?? 0 };
  }
  if (cur) await blobs.delete(cloudBlobKey(app, owner, cur.rev)).catch(() => {});
  return { ok: true, meta };
}
