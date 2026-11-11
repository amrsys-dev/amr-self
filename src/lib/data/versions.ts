import { DATA_VERSIONS_KEPT, dataBlobKey, dataVersionBlobKey, dataVersionKey } from "../user.ts";
import type { BlobStore, KvStore } from "../storage/types.ts";

export { DATA_VERSIONS_KEPT };

export function droppedVersion(newVersion: number, kept = DATA_VERSIONS_KEPT): number | null {
  const old = newVersion - kept;
  return old >= 1 ? old : null;
}

export type PutDataResult =
  | { ok: true; version: number; dropped: number | null }
  | { ok: false; conflict: true; version: number; blob: Uint8Array | null };

export function ifMatchOk(currentVersion: number, ifMatch: string | null | undefined): boolean {
  if (currentVersion === 0) {
    return !ifMatch || ifMatch === "*" || ifMatch === "0" || ifMatch === '""';
  }
  const raw = (ifMatch ?? "").trim().replaceAll('"', "");
  return raw === String(currentVersion);
}

export async function readDataVersion(kv: KvStore, nick: string): Promise<number> {
  const raw = await kv.get(dataVersionKey(nick));
  const n = raw == null ? 0 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Atomic If-Match write: CAS the version key, then store the blob and a
 * retained historical copy. The CAS lives in the storage adapter.
 */
export async function putVersionedBlob(opts: {
  blobs: BlobStore;
  kv: KvStore;
  nick: string;
  bytes: Uint8Array;
  ifMatch: string | null | undefined;
  kept?: number;
}): Promise<PutDataResult> {
  const kept = opts.kept ?? DATA_VERSIONS_KEPT;
  const verKey = dataVersionKey(opts.nick);
  const raw = await opts.kv.get(verKey);
  const currentVersion = raw == null ? 0 : Number(raw);
  if (!ifMatchOk(currentVersion, opts.ifMatch)) {
    const blob = await opts.blobs.get(dataBlobKey(opts.nick));
    return { ok: false, conflict: true, version: currentVersion, blob };
  }
  const version = currentVersion + 1;
  const swapped = await opts.kv.compareAndSet(verKey, raw, String(version));
  if (!swapped) {
    const latest = await readDataVersion(opts.kv, opts.nick);
    const blob = await opts.blobs.get(dataBlobKey(opts.nick));
    return { ok: false, conflict: true, version: latest, blob };
  }
  await opts.blobs.put(dataBlobKey(opts.nick), opts.bytes, "application/octet-stream");
  await opts.blobs.put(dataVersionBlobKey(opts.nick, version), opts.bytes, "application/octet-stream");
  const dropped = droppedVersion(version, kept);
  if (dropped != null) await opts.blobs.delete(dataVersionBlobKey(opts.nick, dropped));
  return { ok: true, version, dropped };
}

export async function listRetainedVersionBlobs(blobs: BlobStore, nick: string, currentVersion: number, kept = DATA_VERSIONS_KEPT): Promise<number[]> {
  const start = Math.max(1, currentVersion - kept + 1);
  const found: number[] = [];
  for (let v = start; v <= currentVersion; v++) {
    if (await blobs.get(dataVersionBlobKey(nick, v))) found.push(v);
  }
  return found;
}

export async function deleteAllDataBlobs(blobs: BlobStore, nick: string): Promise<void> {
  const prefix = `user/${nick.replace(/^@/, "")}/`;
  const keys = await blobs.list(prefix);
  for (const key of keys) await blobs.delete(key);
}
