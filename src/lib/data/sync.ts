import { compressAndEncrypt, decryptAndDecompress, type EncryptedBlob } from "../crypto.ts";
import { api } from "../client.ts";
import { mergeUserData } from "./merge.ts";
import { emptyUserData, type UserData } from "./schema.ts";

const DB = "amrid";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
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

export async function loadLocalData(): Promise<UserData> {
  return (await idbGet<UserData>("data")) ?? emptyUserData();
}

export async function saveLocalData(data: UserData): Promise<void> {
  await idbSet("data", data);
  await idbSet("dirty", true);
}

export async function loadLocalVersion(): Promise<number> {
  return (await idbGet<number>("version")) ?? 0;
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
  if (!res.ok || !res.data.blob) return loadLocalData();
  const parsed = decodeBlob(res.data.blob);
  const data = (await decryptAndDecompress(dataKey, parsed, { accountId, version: res.data.version })) as UserData;
  await idbSet("data", data);
  await idbSet("version", res.data.version);
  await idbSet("dirty", false);
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
      await idbSet("version", res.data.version ?? nextVersion);
      await idbSet("dirty", false);
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
    await idbSet("data", data);
    base = res.data.version;
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
    const dirty = await idbGet<boolean>("dirty");
    const data = await loadLocalData();
    if (dirty) await pushRemote(key, accountId, data);
    else await pullRemote(key, accountId);
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
