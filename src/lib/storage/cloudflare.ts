import type { BlobStore, KvStore } from "./types.ts";

export type CloudflareConfig = {
  accountId: string;
  apiToken: string;
  kvNamespaceId: string;
  r2Bucket: string;
};

function kvUrl(cfg: CloudflareConfig, key: string): string {
  const enc = encodeURIComponent(key);
  return `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.kvNamespaceId}/values/${enc}`;
}

function r2Url(cfg: CloudflareConfig, key: string): string {
  const enc = key.split("/").map(encodeURIComponent).join("/");
  return `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.r2Bucket}/objects/${enc}`;
}

function auth(cfg: CloudflareConfig): HeadersInit {
  return { Authorization: `Bearer ${cfg.apiToken}` };
}

export function createCloudflareStores(cfg: CloudflareConfig): { kv: KvStore; blobs: BlobStore } {
  const kv: KvStore = {
    async get(key) {
      const res = await fetch(kvUrl(cfg, key), { headers: auth(cfg) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`cf kv get ${res.status}`);
      return await res.text();
    },
    async put(key, value) {
      const res = await fetch(kvUrl(cfg, key), {
        method: "PUT",
        headers: { ...auth(cfg), "Content-Type": "text/plain" },
        body: value,
      });
      if (!res.ok) throw new Error(`cf kv put ${res.status}`);
    },
    async delete(key) {
      const res = await fetch(kvUrl(cfg, key), { method: "DELETE", headers: auth(cfg) });
      if (!res.ok && res.status !== 404) throw new Error(`cf kv delete ${res.status}`);
    },
  };
  const blobs: BlobStore = {
    async get(key) {
      const res = await fetch(r2Url(cfg, key), { headers: auth(cfg) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`cf r2 get ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, data, contentType = "application/octet-stream") {
      const res = await fetch(r2Url(cfg, key), {
        method: "PUT",
        headers: { ...auth(cfg), "Content-Type": contentType },
        body: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      });
      if (!res.ok) throw new Error(`cf r2 put ${res.status}`);
    },
    async delete(key) {
      const res = await fetch(r2Url(cfg, key), { method: "DELETE", headers: auth(cfg) });
      if (!res.ok && res.status !== 404) throw new Error(`cf r2 delete ${res.status}`);
    },
  };
  return { kv, blobs };
}

export function readCloudflareConfig(): CloudflareConfig | null {
  const accountId = process.env.CF_ACCOUNT_ID?.trim();
  const apiToken = process.env.CF_API_TOKEN?.trim();
  const kvNamespaceId = process.env.CF_KV_NAMESPACE_ID?.trim();
  const r2Bucket = process.env.CF_R2_BUCKET?.trim();
  if (!accountId || !apiToken || !kvNamespaceId || !r2Bucket) return null;
  return { accountId, apiToken, kvNamespaceId, r2Bucket };
}
