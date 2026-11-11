import { compressAndEncrypt, decryptAndDecompress, type EncryptedBlob } from "../crypto.ts";
import { emptyUserData, type UserData } from "./schema.ts";
import { api } from "../client.ts";

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

export async function pullRemote(dataKey: Uint8Array): Promise<UserData> {
  const res = await api<{ blob: string | null }>("/api/me/data");
  if (!res.ok || !res.data.blob) return loadLocalData();
  const raw = Uint8Array.from(atob(res.data.blob), (c) => c.charCodeAt(0));
  // stored as iv||ct json? We store EncryptedBlob JSON as the blob bytes.
  const parsed = JSON.parse(new TextDecoder().decode(raw)) as EncryptedBlob;
  const data = (await decryptAndDecompress(dataKey, parsed)) as UserData;
  await idbSet("data", data);
  await idbSet("dirty", false);
  return data;
}

export async function pushRemote(dataKey: Uint8Array, data: UserData): Promise<void> {
  const encBlob = await compressAndEncrypt(dataKey, data);
  const bytes = new TextEncoder().encode(JSON.stringify(encBlob));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  await api("/api/me/data", { method: "PUT", body: JSON.stringify({ blob: btoa(bin) }) });
  await idbSet("dirty", false);
}

export function startSyncLoop(getKey: () => Uint8Array | null, intervalMs = 3 * 60_000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped || typeof navigator !== "undefined" && !navigator.onLine) return;
    const key = getKey();
    if (!key) return;
    const dirty = await idbGet<boolean>("dirty");
    const data = await loadLocalData();
    if (dirty) await pushRemote(key, data);
    else await pullRemote(key);
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
