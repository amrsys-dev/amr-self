/**
 * AMR ID Durable Object: nick uniqueness, If-Match version CAS, in-memory rate limits.
 * Preview worker: amr-id-do-preview. Production only after «выкатывай».
 *
 * Create the stub with locationHint "weur". Rate-limit keys are never persisted.
 */
import { AmrIdCoordinator, isDurableDoKey } from "../../src/lib/storage/do-core.ts";
import type { DoRequest, DoResponse } from "../../src/lib/storage/durable-object.ts";

type Env = {
  CF_DO_SECRET: string;
  AMR_ID?: DurableObjectNamespace;
};

type Stored = { v: string; e?: number };

export async function handleDoRequest(store: AmrIdCoordinator, body: DoRequest): Promise<DoResponse> {
  switch (body.op) {
    case "get":
      return { ok: true, value: store.get(body.key) };
    case "put":
      store.put(body.key, body.value, body.opts);
      return { ok: true };
    case "delete":
      store.delete(body.key);
      return { ok: true };
    case "list":
      return { ok: true, keys: store.list(body.prefix) };
    case "cas":
      return { ok: true, cas: store.compareAndSet(body.key, body.expected, body.next, body.opts) };
    case "ratelimit":
      return { ok: true, rate: store.takeRateLimit(body.key, body.windowMs, body.max, body.now) };
    default:
      return { ok: false, error: "invalid" };
  }
}

function mutatedKey(body: DoRequest, result: DoResponse): string | "delete" | null {
  if (body.op === "put" && isDurableDoKey(body.key)) return body.key;
  if (body.op === "delete" && isDurableDoKey(body.key)) return body.key;
  if (body.op === "cas" && result.cas && isDurableDoKey(body.key)) return body.key;
  return null;
}

export class AmrIdDo {
  private readonly store = new AmrIdCoordinator();
  private ready = false;

  constructor(
    private readonly state: DurableObjectState,
    _env: Env,
  ) {}

  private async load(): Promise<void> {
    if (this.ready) return;
    await this.state.blockConcurrencyWhile(async () => {
      if (this.ready) return;
      const now = Date.now();
      const map = await this.state.storage.list<Stored | string>();
      for (const [key, raw] of map) {
        if (key === "snapshot" && typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw) as { k?: string; v?: string; e?: number }[];
            for (const row of parsed) {
              if (!row.k || row.v == null || !isDurableDoKey(row.k)) continue;
              const ttl = row.e != null ? Math.ceil((row.e - now) / 1000) : undefined;
              if (ttl != null && ttl <= 0) continue;
              this.store.put(row.k, row.v, ttl != null ? { expirationTtl: ttl } : undefined, now);
              await this.persistKey(row.k);
            }
          } catch {
            /* ignore a corrupt legacy snapshot */
          }
          await this.state.storage.delete("snapshot");
          continue;
        }
        if (!isDurableDoKey(key) || typeof raw === "string") continue;
        const ttl = raw.e != null ? Math.ceil((raw.e - now) / 1000) : undefined;
        if (ttl != null && ttl <= 0) {
          await this.state.storage.delete(key);
          continue;
        }
        this.store.put(key, raw.v, ttl != null ? { expirationTtl: ttl } : undefined, now);
      }
      this.ready = true;
    });
  }

  private async persistKey(key: string): Promise<void> {
    if (!isDurableDoKey(key)) return;
    const entry = this.store.inspect(key);
    if (!entry) {
      await this.state.storage.delete(key);
      return;
    }
    const record: Stored = entry.exp != null ? { v: entry.value, e: entry.exp } : { v: entry.value };
    const opts = entry.exp != null ? { expirationTtl: Math.max(1, Math.ceil((entry.exp - Date.now()) / 1000)) } : undefined;
    if (opts && opts.expirationTtl <= 0) {
      await this.state.storage.delete(key);
      return;
    }
    await this.state.storage.put(key, record, opts);
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();
    let body: DoRequest;
    try {
      body = (await request.json()) as DoRequest;
    } catch {
      return Response.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const result = await handleDoRequest(this.store, body);
    const key = mutatedKey(body, result);
    if (key) await this.persistKey(body.op === "delete" ? body.key : key);
    return Response.json(result);
  }
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

const localStore = new AmrIdCoordinator();

export async function dispatchCoordinator(env: Env, body: DoRequest): Promise<DoResponse> {
  if (!env.AMR_ID) return handleDoRequest(localStore, body);
  const id = env.AMR_ID.idFromName("amr-id-v1");
  const stub = env.AMR_ID.get(id, { locationHint: "weur" });
  const res = await stub.fetch(
    new Request("https://amr-id-do.internal/v1/do", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as DoResponse;
}

export async function routeDo(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.CF_DO_SECRET || token !== env.CF_DO_SECRET) return unauthorized();
  let body: DoRequest;
  try {
    body = (await request.json()) as DoRequest;
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  return Response.json(await dispatchCoordinator(env, body));
}
