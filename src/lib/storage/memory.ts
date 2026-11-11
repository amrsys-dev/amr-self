import type { BlobStore, KvPutOpts, KvStore } from "./types.ts";

type KvEntry = { value: string; exp?: number };

function alive(entry: KvEntry | undefined, now: number): entry is KvEntry {
  if (!entry) return false;
  if (entry.exp != null && entry.exp <= now) return false;
  return true;
}

function ttlExp(opts: KvPutOpts | undefined, now: number): number | undefined {
  if (opts?.expirationTtl == null) return undefined;
  const ttl = Math.max(1, Math.ceil(opts.expirationTtl));
  return now + ttl * 1000;
}

/** Process-local store. Shared across warm isolates via globalThis; data is ephemeral on serverless. */
export function createMemoryStores(): { kv: KvStore; blobs: BlobStore } {
  const g = globalThis as unknown as {
    __amridMem?: { kv: Map<string, KvEntry>; blobs: Map<string, Uint8Array> };
  };
  if (!g.__amridMem) g.__amridMem = { kv: new Map(), blobs: new Map() };
  const { kv, blobs } = g.__amridMem;
  return {
    kv: {
      async get(key) {
        const now = Date.now();
        const entry = kv.get(key);
        if (!alive(entry, now)) {
          if (entry) kv.delete(key);
          return null;
        }
        return entry.value;
      },
      async put(key, value, opts) {
        const now = Date.now();
        const exp = ttlExp(opts, now);
        kv.set(key, exp != null ? { value, exp } : { value });
      },
      async delete(key) {
        kv.delete(key);
      },
      async list(prefix) {
        const now = Date.now();
        const names: string[] = [];
        for (const [k, entry] of kv) {
          if (!alive(entry, now)) {
            kv.delete(k);
            continue;
          }
          if (k.startsWith(prefix)) names.push(k);
        }
        return names.sort();
      },
      async compareAndSet(key, expected, next, opts) {
        const now = Date.now();
        const entry = kv.get(key);
        const cur = alive(entry, now) ? entry.value : null;
        if (!alive(entry, now) && entry) kv.delete(key);
        if (cur !== expected) return false;
        const exp = ttlExp(opts, now);
        kv.set(key, exp != null ? { value: next, exp } : { value: next });
        return true;
      },
    },
    blobs: {
      async get(key) {
        const v = blobs.get(key);
        return v ? new Uint8Array(v) : null;
      },
      async put(key, data) {
        blobs.set(key, new Uint8Array(data));
      },
      async delete(key) {
        blobs.delete(key);
      },
      async list(prefix) {
        return [...blobs.keys()].filter((k) => k.startsWith(prefix)).sort();
      },
    },
  };
}
