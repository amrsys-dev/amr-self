export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  /**
   * Compare-and-set. `expected === null` means the key must be absent.
   * Memory and file adapters are atomic in-process. The Cloudflare KV
   * adapter checks the current value plus a metadata version, then writes;
   * KV is eventually consistent, so concurrent writers can still race.
   * That is a platform limit, not a linearizable transaction.
   */
  compareAndSet(key: string, expected: string | null, next: string): Promise<boolean>;
}

export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export type StoreKind = "memory" | "file" | "cloudflare";

export type Stores = {
  kind: StoreKind;
  kv: KvStore;
  blobs: BlobStore;
};
