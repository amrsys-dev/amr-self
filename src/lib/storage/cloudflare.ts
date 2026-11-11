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

function kvMetadataUrl(cfg: CloudflareConfig, key: string): string {
  const enc = encodeURIComponent(key);
  return `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.kvNamespaceId}/metadata/${enc}`;
}

function kvListUrl(cfg: CloudflareConfig, prefix: string, cursor?: string): string {
  const u = new URL(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.kvNamespaceId}/keys`);
  if (prefix) u.searchParams.set("prefix", prefix);
  if (cursor) u.searchParams.set("cursor", cursor);
  return u.toString();
}

function r2ListUrl(cfg: CloudflareConfig, prefix: string, cursor?: string): string {
  const u = new URL(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.r2Bucket}/objects`);
  if (prefix) u.searchParams.set("prefix", prefix);
  if (cursor) u.searchParams.set("cursor", cursor);
  return u.toString();
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
    async list(prefix) {
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await fetch(kvListUrl(cfg, prefix, cursor), { headers: auth(cfg) });
        if (!res.ok) throw new Error(`cf kv list ${res.status}`);
        const body = (await res.json()) as { result?: { name: string }[]; result_info?: { cursor?: string; count?: number } };
        for (const item of body.result ?? []) names.push(item.name);
        cursor = body.result_info?.cursor || undefined;
        if (!(body.result_info?.count)) cursor = undefined;
      } while (cursor);
      return names.sort();
    },
    async compareAndSet(key, expected, next) {
      // Cloudflare KV has no linearizable CAS. We read the value and a
      // metadata version, then write only if the value still matches.
      // Concurrent writes can still win the race under eventual consistency.
      const cur = await kv.get(key);
      if (cur !== expected) return false;
      let metaVersion = 0;
      const metaRes = await fetch(kvMetadataUrl(cfg, key), { headers: auth(cfg) });
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { result?: { version?: number } };
        if (typeof meta.result?.version === "number") metaVersion = meta.result.version;
      } else if (metaRes.status !== 404) {
        throw new Error(`cf kv metadata ${metaRes.status}`);
      }
      const url = `${kvUrl(cfg, key)}?metadata=${encodeURIComponent(JSON.stringify({ version: metaVersion + 1 }))}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { ...auth(cfg), "Content-Type": "text/plain" },
        body: next,
      });
      if (!res.ok) throw new Error(`cf kv cas put ${res.status}`);
      return true;
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
    async list(prefix) {
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await fetch(r2ListUrl(cfg, prefix, cursor), { headers: auth(cfg) });
        if (!res.ok) throw new Error(`cf r2 list ${res.status}`);
        const body = (await res.json()) as { result?: { objects?: { key: string }[]; truncated?: boolean; cursor?: string } | { key: string }[] };
        const result = body.result;
        const objects = Array.isArray(result) ? result : (result?.objects ?? []);
        for (const item of objects) if (item.key) names.push(item.key);
        const next = Array.isArray(result) ? undefined : result?.cursor;
        cursor = next && result && !Array.isArray(result) && result.truncated ? next : undefined;
      } while (cursor);
      return names.sort();
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
