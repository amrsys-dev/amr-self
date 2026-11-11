import type { DoConfig } from "../env.server.ts";
import type { RateLimitOpts, AsyncRateLimiter } from "../rate-limit.ts";
import { b64ToBytes, bytesToB64 } from "./bytes.ts";
import type { BlobStore, KvPutOpts, KvStore } from "./types.ts";

export type DoRequest =
  | { op: "get"; key: string }
  | { op: "put"; key: string; value: string; opts?: KvPutOpts }
  | { op: "delete"; key: string }
  | { op: "list"; prefix: string }
  | { op: "cas"; key: string; expected: string | null; next: string; opts?: KvPutOpts }
  | { op: "ratelimit"; key: string; windowMs: number; max: number; now?: number }
  | { op: "blob-get"; key: string }
  | { op: "blob-put"; key: string; data: string; contentType?: string }
  | { op: "blob-delete"; key: string }
  | { op: "blob-list"; prefix: string };

export type DoResponse = {
  ok: boolean;
  value?: string | null;
  keys?: string[];
  cas?: boolean;
  rate?: { ok: boolean; retryAfterMs: number; remaining: number };
  blob?: string | null;
  error?: string;
};

async function callDo(cfg: DoConfig, body: DoRequest): Promise<DoResponse> {
  const res = await fetch(`${cfg.url.replace(/\/$/, "")}/v1/do`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.secret}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`cf do ${res.status}`);
  return (await res.json()) as DoResponse;
}

/** KV adapter that talks to the AMR ID Durable Object (nick CAS, If-Match versions, rate limits). */
export function createDoKvStore(cfg: DoConfig): KvStore {
  return {
    async get(key) {
      const r = await callDo(cfg, { op: "get", key });
      return r.value ?? null;
    },
    async put(key, value, opts) {
      await callDo(cfg, { op: "put", key, value, opts });
    },
    async delete(key) {
      await callDo(cfg, { op: "delete", key });
    },
    async list(prefix) {
      const r = await callDo(cfg, { op: "list", prefix });
      return r.keys ?? [];
    },
    async compareAndSet(key, expected, next, opts) {
      const r = await callDo(cfg, { op: "cas", key, expected, next, opts });
      return Boolean(r.cas);
    },
  };
}

export function createDoRateLimiter(cfg: DoConfig, opts: RateLimitOpts, scope: string): AsyncRateLimiter {
  return {
    async take(key, now = Date.now()) {
      const r = await callDo(cfg, { op: "ratelimit", key: `${scope}:${key}`, windowMs: opts.windowMs, max: opts.max, now });
      return r.rate ?? { ok: false, retryAfterMs: opts.windowMs, remaining: 0 };
    },
  };
}

/** Blob adapter that stores encrypted files in the worker-bound R2 bucket. */
export function createDoBlobStore(cfg: DoConfig): BlobStore {
  return {
    async get(key) {
      const r = await callDo(cfg, { op: "blob-get", key });
      if (r.blob == null || r.blob === "") return null;
      return b64ToBytes(r.blob);
    },
    async put(key, data, contentType = "application/octet-stream") {
      await callDo(cfg, { op: "blob-put", key, data: bytesToB64(data), contentType });
    },
    async delete(key) {
      await callDo(cfg, { op: "blob-delete", key });
    },
    async list(prefix) {
      const r = await callDo(cfg, { op: "blob-list", prefix });
      return r.keys ?? [];
    },
  };
}
