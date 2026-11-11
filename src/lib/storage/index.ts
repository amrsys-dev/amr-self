import { createCloudflareStores, readCloudflareConfig } from "./cloudflare.ts";
import { createFileStores, defaultFileStorePath } from "./file.ts";
import { createMemoryStores } from "./memory.ts";
import type { Stores } from "./types.ts";

export type { BlobStore, KvStore, StoreKind, Stores } from "./types.ts";
export { createCloudflareStores, readCloudflareConfig } from "./cloudflare.ts";
export { createMemoryStores } from "./memory.ts";
export { createFileStores } from "./file.ts";

let cached: Stores | null = null;

export function resetStoresForTests(): void {
  cached = null;
  const g = globalThis as unknown as { __amridMem?: unknown };
  delete g.__amridMem;
}

function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

export function getStores(): Stores {
  if (cached) return cached;
  const cf = readCloudflareConfig();
  if (cf) {
    const { kv, blobs } = createCloudflareStores(cf);
    cached = { kind: "cloudflare", kv, blobs };
    return cached;
  }
  if (!onVercel()) {
    const { kv, blobs } = createFileStores(process.env.STORE_PATH?.trim() || defaultFileStorePath());
    cached = { kind: "file", kv, blobs };
    return cached;
  }
  const { kv, blobs } = createMemoryStores();
  cached = { kind: "memory", kv, blobs };
  return cached;
}
