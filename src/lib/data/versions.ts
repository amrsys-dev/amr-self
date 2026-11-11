import { DATA_VERSIONS_KEPT, dataBlobKey, dataVersionBlobKey } from "../user.ts";
import type { BlobStore } from "../storage/types.ts";

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

export async function putVersionedBlob(opts: {
  blobs: BlobStore;
  nick: string;
  bytes: Uint8Array;
  currentVersion: number;
  ifMatch: string | null | undefined;
  kept?: number;
}): Promise<PutDataResult> {
  const kept = opts.kept ?? DATA_VERSIONS_KEPT;
  if (!ifMatchOk(opts.currentVersion, opts.ifMatch)) {
    const blob = await opts.blobs.get(dataBlobKey(opts.nick));
    return { ok: false, conflict: true, version: opts.currentVersion, blob };
  }
  const version = opts.currentVersion + 1;
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
