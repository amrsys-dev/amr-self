import { readDoConfig } from "../env.server.ts";
import { createCloudflareStores, readCloudflareConfig } from "./cloudflare.ts";
import { createCoordinatedKvStore } from "./coordinated.ts";
import { createDoKvStore } from "./durable-object.ts";
import { createFileStores, defaultFileStorePath } from "./file.ts";
import { createMemoryStores } from "./memory.ts";
import type { BlobStore, Stores } from "./types.ts";

export type { BlobStore, KvStore, StoreKind, Stores } from "./types.ts";
export { createCloudflareStores, readCloudflareConfig } from "./cloudflare.ts";
export { createMemoryStores } from "./memory.ts";
export { createFileStores } from "./file.ts";

let cached: Stores | null = null;

export function resetStoresForTests(): void {
  cached = null;
  const g = globalThis as unknown as { __amridMem?: unknown; __amridLim?: unknown };
  delete g.__amridMem;
  delete g.__amridLim;
}

function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

function localBlobs(): BlobStore {
  if (onVercel()) return createMemoryStores().blobs;
  return createFileStores(process.env.STORE_PATH?.trim() || defaultFileStorePath()).blobs;
}

export function getStores(): Stores {
  if (cached) return cached;
  if ((process.env.AMR_STORE ?? "").trim() === "memory") {
    const { kv, blobs } = createMemoryStores();
    cached = { kind: "memory", kv, blobs };
    return cached;
  }
  const doCfg = readDoConfig();
  const cf = readCloudflareConfig();
  const cfStores = cf ? createCloudflareStores(cf) : null;
  if (doCfg && cfStores) {
    cached = {
      kind: "durable-object",
      kv: createCoordinatedKvStore(createDoKvStore(doCfg), cfStores.kv),
      blobs: cfStores.blobs ?? localBlobs(),
    };
    return cached;
  }
  if (doCfg) {
    cached = {
      kind: "durable-object",
      kv: createDoKvStore(doCfg),
      blobs: localBlobs(),
    };
    return cached;
  }
  if (cfStores) {
    cached = { kind: "cloudflare", kv: cfStores.kv, blobs: cfStores.blobs ?? localBlobs() };
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
