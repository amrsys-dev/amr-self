import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/entitlement?app=cut - the signed plan of the signed-in user for an AMR app.
 * Read from the app's page with the AMR ID cookie (same site), so only listed origins get it.
 */
export const Route = createFileRoute("/api/entitlement")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { PLAN_ORIGINS, ENTITLEMENT_TTL_SEC, isPlanApp, planOf, signEntitlement } = await import("@/lib/plans.ts");
        const app = new URL(request.url).searchParams.get("app");
        const origin = request.headers.get("origin") ?? "";
        const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", Vary: "Origin" });
        if (isPlanApp(app) && PLAN_ORIGINS[app].includes(origin)) {
          headers.set("Access-Control-Allow-Origin", origin);
          headers.set("Access-Control-Allow-Credentials", "true");
        }
        const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
        if (!isPlanApp(app)) return out({ error: "bad_app" }, 400);
        const { readSession } = await import("@/lib/auth/session.ts");
        const { getStores } = await import("@/lib/storage/index.ts");
        const { nickKey } = await import("@/lib/user.ts");
        const { env } = await import("@/lib/env.server.ts");
        const s = await readSession(request);
        if (!s) return out({ error: "unauthorized" }, 401);
        const raw = await getStores().kv.get(nickKey(s.nick));
        if (!raw) return out({ error: "unauthorized" }, 401);
        const user = JSON.parse(raw) as import("@/lib/user.ts").UserRecord;
        const seed = env("AMR_PLAN_KEY");
        if (!seed) return out({ error: "not_configured" }, 503);
        const now = Math.floor(Date.now() / 1000);
        const p = planOf(user.plans, app);
        const exp = p.until ? Math.min(now + ENTITLEMENT_TTL_SEC, Math.floor(p.until / 1000)) : now + ENTITLEMENT_TTL_SEC;
        const token = signEntitlement({ app, sub: user.dataId ?? user.nick, nick: user.nick, plan: p.plan, ...(p.until ? { until: p.until } : {}), iat: now, exp }, seed);
        return out({ token });
      },
    },
  },
});
