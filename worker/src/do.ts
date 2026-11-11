/**
 * AMR ID Durable Object: nick uniqueness, If-Match version CAS, rate limits.
 * Not deployed in stage 1. The Vercel app selects it when CF_DO_URL + CF_DO_SECRET are set.
 *
 * Create the stub with locationHint "weur". R2 buckets should use jurisdiction "eu".
 */
import { AmrIdCoordinator } from "../../src/lib/storage/do-core.ts";
import type { DoRequest, DoResponse } from "../../src/lib/storage/durable-object.ts";

type Env = {
  CF_DO_SECRET: string;
  AMR_ID?: DurableObjectNamespace;
};

const store = new AmrIdCoordinator();

export async function handleDoRequest(body: DoRequest): Promise<DoResponse> {
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

export class AmrIdDo {
  constructor(
    private readonly state: DurableObjectState,
    _env: Env,
  ) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    // Persist a snapshot around each mutation. The in-memory coordinator is
    // rebuilt from DO storage when the isolate starts.
    const loaded = await this.state.blockConcurrencyWhile(async () => {
      const raw = await this.state.storage.get<string>("snapshot");
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw) as { k?: string; v?: string; e?: number }[];
          for (const row of parsed) {
            if (row.k && row.v != null) store.put(row.k, row.v, row.e != null ? { expirationTtl: Math.max(1, Math.ceil((row.e - Date.now()) / 1000)) } : undefined);
          }
        } catch {
          /* ignore */
        }
      }
    });
    void loaded;
    let body: DoRequest;
    try {
      body = (await request.json()) as DoRequest;
    } catch {
      return Response.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const result = await handleDoRequest(body);
    const keys = store.list("");
    const snap = keys.map((k) => ({ k, v: store.get(k) }));
    await this.state.storage.put("snapshot", JSON.stringify(snap));
    return Response.json(result);
  }
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function routeDo(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.CF_DO_SECRET || token !== env.CF_DO_SECRET) return unauthorized();
  if (!env.AMR_ID) {
    // Local / preview fallback: process-local coordinator (same process as this worker).
    let body: DoRequest;
    try {
      body = (await request.json()) as DoRequest;
    } catch {
      return Response.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    return Response.json(await handleDoRequest(body));
  }
  const id = env.AMR_ID.idFromName("amr-id-v1");
  const stub = env.AMR_ID.get(id, { locationHint: "weur" });
  return stub.fetch(request);
}
