export type KvPutOpts = {
  /** Time to live in seconds. Expired keys must behave as missing. */
  expirationTtl?: number;
};

export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: KvPutOpts): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  /**
   * Compare-and-set. `expected === null` means the key must be absent.
   * Memory and file adapters are atomic in-process. The Cloudflare KV
   * adapter checks the current value plus a metadata version, then writes;
   * KV is eventually consistent, so concurrent writers can still race.
   * That is a platform limit, not a linearizable transaction.
   * Prefer the Durable Object adapter (CF_DO_URL) for nick claims, If-Match
   * version writes and rate limits when it is configured.
   */
  compareAndSet(key: string, expected: string | null, next: string, opts?: KvPutOpts): Promise<boolean>;
}

export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export type StoreKind = "memory" | "file" | "cloudflare" | "durable-object";

export type Stores = {
  kind: StoreKind;
  kv: KvStore;
  blobs: BlobStore;
};
