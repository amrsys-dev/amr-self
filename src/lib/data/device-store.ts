/**
 * Device-side storage that does not need a password on every launch.
 *
 * A random AES-GCM key is created once per device and kept in IndexedDB as a
 * non-extractable CryptoKey: scripts can use it but cannot read its bytes.
 * It encrypts two things at rest:
 *   - the account data key, so a signed-in user is not asked for the password
 *     every time the app opens;
 *   - guest data, so the assistant works with no account at all.
 *
 * Trade-off: anyone who can open the unlocked phone and the app can read the
 * data, as with any notes or banking-free budget app. Signing out wipes it.
 */
import { emptyUserData, type UserData } from "./schema.ts";

const DB = "amrself-device";
const STORE = "kv";
const DEVICE_KEY = "device-key";
const GUEST = "guest-data";
const DATA_KEY_PREFIX = "data-key:";

export type Sealed = { iv: Uint8Array; ct: Uint8Array };

export async function newDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, bytes: Uint8Array, aad: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    bytes as BufferSource,
  );
  return { iv, ct: new Uint8Array(ct) };
}

export async function unseal(key: CryptoKey, sealed: Sealed, aad: string): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.iv as BufferSource, additionalData: new TextEncoder().encode(aad) },
    key,
    sealed.ct as BufferSource,
  );
  return new Uint8Array(pt);
}

/* ---------------- IndexedDB plumbing ---------------- */

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function del(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deviceKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>(DEVICE_KEY);
  if (existing) return existing;
  const key = await newDeviceKey();
  await put(DEVICE_KEY, key);
  return key;
}

/* ---------------- Persistent storage ---------------- */

/**
 * Ask the browser not to evict our data under storage pressure.
 * Installed PWAs are usually granted this silently. Returns true if granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/* ---------------- Remembered account data key ---------------- */

export async function rememberDataKey(accountId: string, dataKey: Uint8Array): Promise<void> {
  if (!hasIdb()) return;
  const sealed = await seal(await deviceKey(), dataKey, DATA_KEY_PREFIX + accountId);
  await put(DATA_KEY_PREFIX + accountId, sealed);
}

export async function recallDataKey(accountId: string): Promise<Uint8Array | null> {
  if (!hasIdb()) return null;
  try {
    const sealed = await get<Sealed>(DATA_KEY_PREFIX + accountId);
    if (!sealed) return null;
    return await unseal(await deviceKey(), sealed, DATA_KEY_PREFIX + accountId);
  } catch {
    return null;
  }
}

/* ---------------- Guest data (no account) ---------------- */

export async function loadGuestData(): Promise<UserData> {
  if (!hasIdb()) return emptyUserData();
  try {
    const sealed = await get<Sealed>(GUEST);
    if (!sealed) return emptyUserData();
    const bytes = await unseal(await deviceKey(), sealed, GUEST);
    return JSON.parse(new TextDecoder().decode(bytes)) as UserData;
  } catch {
    return emptyUserData();
  }
}

export async function saveGuestData(data: UserData): Promise<void> {
  if (!hasIdb()) return;
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  await put(GUEST, await seal(await deviceKey(), bytes, GUEST));
}

export async function clearGuestData(): Promise<void> {
  if (!hasIdb()) return;
  await del(GUEST);
}

/** Sign-out / delete: drop the device key and everything sealed with it. */
export async function wipeDeviceStore(): Promise<void> {
  if (!hasIdb()) return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
