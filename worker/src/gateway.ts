/**
 * Preview storage gateway: Durable Object coordination, bound KV write-through,
 * and bound R2 blobs. The Vercel app talks only to this worker with CF_DO_SECRET.
 * Writes happen only when the value actually changes. Rate limits stay in DO memory.
 */
import { isCoordinatedKey } from "../../src/lib/storage/coordinated.ts";
import type { DoRequest, DoResponse } from "../../src/lib/storage/durable-object.ts";
import { dispatchCoordinator } from "./do.ts";
import { CARD_THEMES, parseCardTheme, toPublicContacts, type Contact } from "../../src/lib/card/visibility.ts";
import { nickKey } from "../../src/lib/user.ts";
import { normalizeNick, parseNickFormat, publicCardPath } from "../../src/lib/nick.ts";
import { safeEqual } from "../../src/lib/secret-equal.ts";

export type GatewayEnv = {
  CF_DO_SECRET: string;
  AMR_ID?: DurableObjectNamespace;
  KV?: KVNamespace;
  R2?: R2Bucket;
};

const CARD_MAX_AGE_MS = 30_000;
const CARD_SWR_MS = 120_000;
export const PUBLIC_CARD_CACHE = "public, max-age=30, s-maxage=30, stale-while-revalidate=120";

function b64Encode(data: Uint8Array): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    out += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(out);
}

function b64Decode(raw: string): Uint8Array {
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function authorize(request: Request, env: GatewayEnv): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(env.CF_DO_SECRET) && safeEqual(token, env.CF_DO_SECRET);
}

async function callDo(env: GatewayEnv, body: DoRequest): Promise<DoResponse> {
  return dispatchCoordinator(env, body);
}

async function kvGetRaw(env: GatewayEnv, key: string): Promise<string | null> {
  if (!env.KV) return null;
  return (await env.KV.get(key)) ?? null;
}

async function kvPutRaw(env: GatewayEnv, key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
  if (!env.KV) return;
  if (opts?.expirationTtl != null) await env.KV.put(key, value, { expirationTtl: Math.max(60, Math.ceil(opts.expirationTtl)) });
  else await env.KV.put(key, value);
}

async function kvDeleteRaw(env: GatewayEnv, key: string): Promise<void> {
  if (!env.KV) return;
  await env.KV.delete(key);
}

async function kvListRaw(env: GatewayEnv, prefix: string): Promise<string[]> {
  if (!env.KV) return [];
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.KV.list({ prefix, cursor });
    for (const key of page.keys) names.push(key.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names.sort();
}

function tombstoneKey(key: string): string {
  return `tombstone:${key}`;
}

async function hasTombstone(env: GatewayEnv, key: string): Promise<boolean> {
  const tomb = await callDo(env, { op: "get", key: tombstoneKey(key) });
  return tomb.value != null;
}

async function setTombstone(env: GatewayEnv, key: string): Promise<void> {
  await callDo(env, { op: "put", key: tombstoneKey(key), value: "1", opts: { expirationTtl: 120 } });
}

async function hydrateCoordinated(env: GatewayEnv, key: string): Promise<string | null> {
  if (await hasTombstone(env, key)) return null;
  const fromDo = await callDo(env, { op: "get", key });
  if (fromDo.value != null) {
    const fromKv = await kvGetRaw(env, key);
    if (fromKv !== fromDo.value) await kvPutRaw(env, key, fromDo.value);
    return fromDo.value;
  }
  const fromKv = await kvGetRaw(env, key);
  if (fromKv == null) return null;
  if (await hasTombstone(env, key)) return null;
  await callDo(env, { op: "cas", key, expected: null, next: fromKv });
  return (await callDo(env, { op: "get", key })).value ?? fromKv;
}

const CARD_LANGS = ["", "en", "ru", "ar", "uz", "tj"];

function cardCacheRequest(nick: string, theme: string | null = null, lang: string | null = null): Request {
  const u = new URL(`https://amr-id-do-preview.cache/v1/card/${encodeURIComponent(nick.toLowerCase())}`);
  if (theme) u.searchParams.set("t", theme);
  if (lang) u.searchParams.set("lang", lang);
  return new Request(u);
}

async function purgeCardCache(nickFromKey: string, ctx?: ExecutionContext): Promise<void> {
  const nick = nickFromKey.startsWith("nick:") ? nickFromKey.slice(5) : nickFromKey;
  const keys = [cardCacheRequest(nick)];
  for (const theme of ["", ...CARD_THEMES]) {
    for (const lang of CARD_LANGS) {
      keys.push(cardCacheRequest(nick, theme || null, lang || null));
    }
  }
  const run = Promise.all(keys.map((k) => caches.default.delete(k)));
  if (ctx) ctx.waitUntil(run);
  else await run;
}

async function maybePurgeCard(key: string, ctx?: ExecutionContext): Promise<void> {
  if (key.startsWith("nick:")) await purgeCardCache(key, ctx);
}

export async function handleGateway(body: DoRequest, env: GatewayEnv, ctx?: ExecutionContext): Promise<DoResponse> {
  switch (body.op) {
    case "ratelimit":
      return callDo(env, body);
    case "get": {
      if (isCoordinatedKey(body.key)) return { ok: true, value: await hydrateCoordinated(env, body.key) };
      return { ok: true, value: await kvGetRaw(env, body.key) };
    }
    case "put": {
      if (isCoordinatedKey(body.key)) {
        const current = await hydrateCoordinated(env, body.key);
        if (current === body.value) return { ok: true };
        await callDo(env, body);
        await kvPutRaw(env, body.key, body.value, body.opts);
        await maybePurgeCard(body.key, ctx);
        return { ok: true };
      }
      const current = await kvGetRaw(env, body.key);
      if (current === body.value) return { ok: true };
      await kvPutRaw(env, body.key, body.value, body.opts);
      return { ok: true };
    }
    case "delete": {
      if (isCoordinatedKey(body.key)) {
        await setTombstone(env, body.key);
        await callDo(env, body);
      }
      await kvDeleteRaw(env, body.key);
      await maybePurgeCard(body.key, ctx);
      return { ok: true };
    }
    case "list": {
      const fromKv = await kvListRaw(env, body.prefix);
      if (!body.prefix.startsWith("nick") && !body.prefix.startsWith("reserved") && body.prefix !== "") {
        return { ok: true, keys: fromKv };
      }
      const fromDo = await callDo(env, body);
      const keys = [...new Set([...(fromDo.keys ?? []), ...fromKv])].sort();
      return { ok: true, keys };
    }
    case "cas": {
      if (isCoordinatedKey(body.key)) {
        const current = await hydrateCoordinated(env, body.key);
        if (current !== body.expected) return { ok: true, cas: false };
        const result = await callDo(env, body);
        if (result.cas) {
          await callDo(env, { op: "delete", key: tombstoneKey(body.key) });
          const fromKv = await kvGetRaw(env, body.key);
          if (fromKv !== body.next) await kvPutRaw(env, body.key, body.next, body.opts);
          await maybePurgeCard(body.key, ctx);
        }
        return result;
      }
      const current = await kvGetRaw(env, body.key);
      if (current !== body.expected) return { ok: true, cas: false };
      if (current === body.next) return { ok: true, cas: true };
      await kvPutRaw(env, body.key, body.next, body.opts);
      return { ok: true, cas: true };
    }
    case "blob-get": {
      if (!env.R2) return { ok: false, error: "r2_inactive" };
      const obj = await env.R2.get(body.key);
      if (!obj) return { ok: true, blob: null };
      return { ok: true, blob: b64Encode(new Uint8Array(await obj.arrayBuffer())) };
    }
    case "blob-put": {
      if (!env.R2) return { ok: false, error: "r2_inactive" };
      const next = b64Decode(body.data);
      const prev = await env.R2.get(body.key);
      if (prev && sameBytes(new Uint8Array(await prev.arrayBuffer()), next)) return { ok: true };
      await env.R2.put(body.key, next, { httpMetadata: { contentType: body.contentType ?? "application/octet-stream" } });
      return { ok: true };
    }
    case "blob-delete": {
      if (!env.R2) return { ok: false, error: "r2_inactive" };
      await env.R2.delete(body.key);
      return { ok: true };
    }
    case "blob-list": {
      if (!env.R2) return { ok: false, error: "r2_inactive" };
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await env.R2.list({ prefix: body.prefix, cursor });
        for (const obj of page.objects) names.push(obj.key);
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return { ok: true, keys: names.sort() };
    }
    default:
      return { ok: false, error: "invalid" };
  }
}

const LABELS: Record<string, string> = {
  ru: "указан владельцем",
  ar: "ذكره المالك",
  uz: "egasi ko‘rsatgan",
  tj: "соҳиб нишон додааст",
  en: "listed by the owner",
};

function listedByOwner(lang: string | null): string {
  const key = (lang ?? "en").slice(0, 2).toLowerCase();
  return LABELS[key] ?? LABELS.en;
}

async function buildPublicCard(env: GatewayEnv, nick: string, themeRaw: string | null, lang: string | null, origin: string): Promise<Response> {
  const raw = await hydrateCoordinated(env, nickKey(nick));
  if (!raw) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "private, no-store", "x-amr-cache": "miss" } },
    );
  }
  const user = JSON.parse(raw) as { nick: string; theme?: string; contacts?: Contact[] };
  const theme = parseCardTheme(themeRaw ?? user.theme);
  const payload = {
    nick: user.nick,
    theme,
    contacts: toPublicContacts(user.contacts ?? [], listedByOwner(lang)),
    url: origin ? `${origin.replace(/\/$/, "")}${publicCardPath(user.nick)}` : publicCardPath(user.nick),
  };
  return Response.json(payload, {
    status: 200,
    headers: {
      "cache-control": PUBLIC_CARD_CACHE,
      "x-amr-cached-at": String(Date.now()),
      "x-amr-cache": "miss",
    },
  });
}

function toApp(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("cache-control", "private, no-store");
  return new Response(res.body, { status: res.status, headers });
}

export async function handlePublicCardRequest(request: Request, env: GatewayEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const nickRaw = parts[2] ?? "";
  const nick = normalizeNick(decodeURIComponent(nickRaw), parseNickFormat());
  if (!nick) {
    return Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "private, no-store" } });
  }
  const themeRaw = url.searchParams.get("t");
  const langRaw = url.searchParams.get("lang");
  const origin = url.searchParams.get("origin") ?? "";
  const cacheReq = cardCacheRequest(nick, themeRaw, langRaw);
  const cached = await caches.default.match(cacheReq);
  if (cached) {
    const cachedAt = Number(cached.headers.get("x-amr-cached-at") ?? 0);
    const age = Date.now() - cachedAt;
    if (cachedAt && age < CARD_MAX_AGE_MS + CARD_SWR_MS) {
      const headers = new Headers(cached.headers);
      headers.set("x-amr-cache", age < CARD_MAX_AGE_MS ? "hit" : "swr");
      if (age >= CARD_MAX_AGE_MS) {
        ctx.waitUntil(
          buildPublicCard(env, nick, themeRaw, langRaw, origin).then((fresh) => {
            if (fresh.status === 200) return caches.default.put(cacheReq, fresh.clone());
            return caches.default.delete(cacheReq);
          }),
        );
      }
      return toApp(new Response(cached.body, { status: cached.status, headers }));
    }
  }
  const fresh = await buildPublicCard(env, nick, themeRaw, langRaw, origin);
  if (fresh.status === 200) {
    await caches.default.put(cacheReq, fresh.clone());
  }
  return toApp(fresh);
}

