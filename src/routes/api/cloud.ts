import { createFileRoute } from "@tanstack/react-router";

/**
 * /api/cloud?app=cut - the cloud copy of an AMR app's data (paid plans).
 * GET  → the file (X-Cloud-Rev, X-Cloud-At) or 204 when there is none yet.
 * PUT  ?base=<rev> with the file → {rev, at}; 409 {rev} when another device saved first.
 * Only the app's own sites may call it, with the AMR ID sign-in of this browser.
 */
async function handle(request: Request, method: "GET" | "PUT"): Promise<Response> {
  const { PLAN_ORIGINS, isPlanApp } = await import("@/lib/plans.ts");
  const url = new URL(request.url);
  const app = url.searchParams.get("app");
  const origin = request.headers.get("origin") ?? "";
  const headers = new Headers({ "Cache-Control": "private, no-store", Vary: "Origin" });
  const allowed = isPlanApp(app) && PLAN_ORIGINS[app].includes(origin);
  if (allowed) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Expose-Headers", "X-Cloud-Rev, X-Cloud-At");
  }
  const json = (body: unknown, status = 200) => {
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(body), { status, headers });
  };
  if (!isPlanApp(app)) return json({ error: "bad_app" }, 400);
  if (method === "PUT" && !allowed) return json({ error: "forbidden" }, 403);
  const { readSession } = await import("@/lib/auth/session.ts");
  const { getStores } = await import("@/lib/storage/index.ts");
  const { nickKey } = await import("@/lib/user.ts");
  const { cloudAllowed, cloudRead, cloudWrite, CLOUD_MAX_BYTES } = await import("@/lib/cloud.ts");
  const s = await readSession(request);
  if (!s) return json({ error: "unauthorized" }, 401);
  const { kv, blobs } = getStores();
  const raw = await kv.get(nickKey(s.nick));
  if (!raw) return json({ error: "unauthorized" }, 401);
  const user = JSON.parse(raw) as import("@/lib/user.ts").UserRecord;
  // 27.11.2026: владелец AMR (AMR_ADMINS) - облако без подписки, как и высший тариф в /api/entitlement
  const { adminNicks } = await import("@/lib/plans.ts");
  const { env } = await import("@/lib/env.server.ts");
  const isOwner = adminNicks(env("AMR_ADMINS")).includes(user.nick.toLowerCase());
  if (!isOwner && !cloudAllowed(user.plans, app)) return json({ error: "plan" }, 402);
  const owner = user.dataId ?? user.nick;
  if (method === "GET") {
    const got = await cloudRead(kv, blobs, app, owner);
    if (!got) return new Response(null, { status: 204, headers });
    headers.set("Content-Type", "application/octet-stream");
    headers.set("X-Cloud-Rev", String(got.meta.rev));
    headers.set("X-Cloud-At", String(got.meta.at));
    return new Response(got.data as unknown as BodyInit, { status: 200, headers });
  }
  const base = Number(url.searchParams.get("base") ?? "-1");
  if (!Number.isInteger(base) || base < 0) return json({ error: "bad_base" }, 400);
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > CLOUD_MAX_BYTES) return json({ error: "too_big", max: CLOUD_MAX_BYTES }, 413);
  const data = new Uint8Array(await request.arrayBuffer());
  const r = await cloudWrite(kv, blobs, app, owner, base, data);
  if (r.ok) return json({ rev: r.meta.rev, at: r.meta.at });
  if (r.reason === "conflict") return json({ error: "conflict", rev: r.rev }, 409);
  if (r.reason === "too_big") return json({ error: "too_big", max: CLOUD_MAX_BYTES }, 413);
  return json({ error: r.reason }, 400);
}

export const Route = createFileRoute("/api/cloud")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request, "GET"),
      PUT: ({ request }) => handle(request, "PUT"),
      OPTIONS: async ({ request }) => {
        const { PLAN_ORIGINS, isPlanApp } = await import("@/lib/plans.ts");
        const app = new URL(request.url).searchParams.get("app");
        const origin = request.headers.get("origin") ?? "";
        const headers = new Headers({ Vary: "Origin" });
        if (isPlanApp(app) && PLAN_ORIGINS[app].includes(origin)) {
          headers.set("Access-Control-Allow-Origin", origin);
          headers.set("Access-Control-Allow-Credentials", "true");
          headers.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
          headers.set("Access-Control-Allow-Headers", "Content-Type");
          headers.set("Access-Control-Max-Age", "86400");
        }
        return new Response(null, { status: 204, headers });
      },
    },
  },
});
