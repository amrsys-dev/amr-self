export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type StoreKind = "memory" | "file" | "cloudflare";

export type Stores = {
  kind: StoreKind;
  kv: KvStore;
  blobs: BlobStore;
};
