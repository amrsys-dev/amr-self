import type { KvPutOpts, KvStore } from "./types.ts";

/** Keys whose uniqueness or If-Match version must be coordinated by the Durable Object. */
export function isCoordinatedKey(key: string): boolean {
  return key.startsWith("nick:") || key.startsWith("reserved:") || key.startsWith("google:") || key.endsWith("/data-version");
}

/**
 * Persistent KV with a Durable Object for nick uniqueness and If-Match CAS.
 * Rate limits stay on the DO (in-memory, TTL) and never pass through this store.
 * Unchanged values are not written again.
 */
export function createCoordinatedKvStore(doKv: KvStore, kv: KvStore): KvStore {
  async function hydrate(key: string): Promise<string | null> {
    const fromDo = await doKv.get(key);
    if (fromDo != null) return fromDo;
    const fromKv = await kv.get(key);
    if (fromKv == null) return null;
    const seeded = await doKv.compareAndSet(key, null, fromKv);
    if (seeded) return fromKv;
    return (await doKv.get(key)) ?? fromKv;
  }

  return {
    async get(key) {
      if (isCoordinatedKey(key)) return hydrate(key);
      return kv.get(key);
    },
    async put(key, value, opts) {
      if (isCoordinatedKey(key)) {
        const current = await hydrate(key);
        if (current === value) return;
        await doKv.put(key, value, opts);
      } else {
        const current = await kv.get(key);
        if (current === value) return;
      }
      await kv.put(key, value, opts);
    },
    async delete(key) {
      if (isCoordinatedKey(key)) await doKv.delete(key);
      await kv.delete(key);
    },
    async list(prefix) {
      return kv.list(prefix);
    },
    async compareAndSet(key, expected, next, opts) {
      if (isCoordinatedKey(key)) {
        await hydrate(key);
        const ok = await doKv.compareAndSet(key, expected, next, opts);
        if (ok) {
          const current = await kv.get(key);
          if (current !== next) await kv.put(key, next, opts);
        }
        return ok;
      }
      const current = await kv.get(key);
      if (current !== expected) return false;
      if (current === next) return true;
      return kv.compareAndSet(key, expected, next, opts);
    },
  };
}
