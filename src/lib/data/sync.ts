import { compressAndEncrypt, decryptAndDecompress, type EncryptedBlob } from "../crypto.ts";
import { api } from "../client.ts";
import { mergeUserData } from "./merge.ts";
import { emptyUserData, type UserData } from "./schema.ts";

const DB = "amrid";
const STORE = "kv";

/** Only encrypted blobs (plus non-secret sync metadata) live in IndexedDB. */
type LocalRecord = {
  blob: EncryptedBlob;
  version: number;
  dirty: boolean;
  accountId: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      // Drop any leftover plaintext records from older schema versions.
      const tx = req.transaction;
      if (tx) {
        const store = tx.objectStore(STORE);
        store.delete("data");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function wipeLocalData(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function readRecord(): Promise<LocalRecord | undefined> {
  return idbGet<LocalRecord>("enc");
}

async function writeRecord(rec: LocalRecord): Promise<void> {
  await idbSet("enc", rec);
}

export async function loadLocalData(dataKey: Uint8Array, accountId: string): Promise<UserData> {
  const rec = await readRecord();
  if (!rec || rec.accountId !== accountId) return emptyUserData();
  return (await decryptAndDecompress(dataKey, rec.blob, { accountId, version: rec.version })) as UserData;
}

export async function saveLocalData(dataKey: Uint8Array, accountId: string, data: UserData): Promise<void> {
  const rec = await readRecord();
  const version = rec && rec.accountId === accountId ? rec.version : 0;
  const pendingVersion = Math.max(version, 0) + (rec?.dirty ? 0 : 1) || 1;
  const nextVersion = rec?.dirty ? Math.max(version, 1) : pendingVersion;
  const blob = await compressAndEncrypt(dataKey, data, { accountId, version: nextVersion });
  await writeRecord({ blob, version: nextVersion, dirty: true, accountId });
}

export async function loadLocalVersion(): Promise<number> {
  const rec = await readRecord();
  return rec?.dirty ? Math.max(0, rec.version - 1) : (rec?.version ?? 0);
}

function decodeBlob(b64: string): EncryptedBlob {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(raw)) as EncryptedBlob;
}

function encodeBlob(blob: EncryptedBlob): string {
  const bytes = new TextEncoder().encode(JSON.stringify(blob));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function pullRemote(dataKey: Uint8Array, accountId: string): Promise<UserData> {
  const res = await api<{ blob: string | null; version: number }>("/api/me/data");
  if (!res.ok || !res.data.blob) return loadLocalData(dataKey, accountId);
  const parsed = decodeBlob(res.data.blob);
  const data = (await decryptAndDecompress(dataKey, parsed, { accountId, version: res.data.version })) as UserData;
  await writeRecord({ blob: parsed, version: res.data.version, dirty: false, accountId });
  return data;
}

export async function pushRemote(dataKey: Uint8Array, accountId: string, data: UserData): Promise<void> {
  let base = await loadLocalVersion();
  for (let attempt = 0; attempt < 4; attempt++) {
    const nextVersion = base + 1;
    const encBlob = await compressAndEncrypt(dataKey, data, { accountId, version: nextVersion });
    const res = await api<{ ok?: boolean; version?: number; blob?: string | null; error?: string }>("/api/me/data", {
      method: "PUT",
      headers: { "If-Match": String(base), "Content-Type": "application/json" },
      body: JSON.stringify({ blob: encodeBlob(encBlob), version: base }),
    });
    if (res.ok) {
      await writeRecord({ blob: encBlob, version: res.data.version ?? nextVersion, dirty: false, accountId });
      return;
    }
    if (res.status !== 409 || res.data.blob == null || res.data.version == null) {
      throw new Error(res.data.error ?? "sync_failed");
    }
    const remote = (await decryptAndDecompress(dataKey, decodeBlob(res.data.blob), {
      accountId,
      version: res.data.version,
    })) as UserData;
    data = mergeUserData(data, remote);
    base = res.data.version;
    const mergedBlob = await compressAndEncrypt(dataKey, data, { accountId, version: base + 1 });
    await writeRecord({ blob: mergedBlob, version: base + 1, dirty: true, accountId });
  }
  throw new Error("sync_conflict");
}

export type SyncContext = { key: Uint8Array | null; accountId: string | null };

export function startSyncLoop(getCtx: () => SyncContext, intervalMs = 3 * 60_000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    const { key, accountId } = getCtx();
    if (!key || !accountId) return;
    const rec = await readRecord();
    if (rec?.dirty && rec.accountId === accountId) {
      const data = await decryptAndDecompress(key, rec.blob, { accountId, version: rec.version }) as UserData;
      await pushRemote(key, accountId, data);
    } else {
      await pullRemote(key, accountId);
    }
  };
  const id = setInterval(() => void tick(), intervalMs);
  const onOnline = () => void tick();
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  void tick();
  return () => {
    stopped = true;
    clearInterval(id);
    if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
  };
}
