import type { BlobStore, KvStore } from "./types.ts";

/** Process-local store. Shared across warm isolates via globalThis; data is ephemeral on serverless. */
export function createMemoryStores(): { kv: KvStore; blobs: BlobStore } {
  const g = globalThis as unknown as {
    __amridMem?: { kv: Map<string, string>; blobs: Map<string, Uint8Array> };
  };
  if (!g.__amridMem) g.__amridMem = { kv: new Map(), blobs: new Map() };
  const { kv, blobs } = g.__amridMem;
  return {
    kv: {
      async get(key) {
        return kv.get(key) ?? null;
      },
      async put(key, value) {
        kv.set(key, value);
      },
      async delete(key) {
        kv.delete(key);
      },
      async list(prefix) {
        return [...kv.keys()].filter((k) => k.startsWith(prefix)).sort();
      },
      async compareAndSet(key, expected, next) {
        const cur = kv.get(key) ?? null;
        if (cur !== expected) return false;
        kv.set(key, next);
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
