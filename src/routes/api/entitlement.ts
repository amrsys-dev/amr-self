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
        let user = JSON.parse(raw) as import("@/lib/user.ts").UserRecord;
        const seed = env("AMR_PLAN_KEY");
        if (!seed) return out({ error: "not_configured" }, 503);
        // ?trial=1&dev=<device id>: first sign-in from the app -> one-time trial (one per account and per device)
        const q = new URL(request.url).searchParams;
        if (q.get("trial") === "1" && PLAN_ORIGINS[app].includes(origin)) {
          const { grantTrial } = await import("@/lib/plans.ts");
          const { createHash } = await import("node:crypto");
          const next = grantTrial(user.plans, user.trials, app);
          const dev = (q.get("dev") ?? "").slice(0, 80);
          const devKey = dev.length >= 16 ? `trial-dev:${app}:${createHash("sha256").update(dev).digest("hex").slice(0, 32)}` : "";
          const kv = getStores().kv;
          if (next && devKey && !(await kv.get(devKey))) {
            const fresh = { ...user, plans: next.plans, trials: next.trials };
            if (await kv.compareAndSet(nickKey(s.nick), raw, JSON.stringify(fresh))) {
              await kv.put(devKey, String(Date.now()));
              user = fresh;
            }
          }
        }
        const now = Math.floor(Date.now() / 1000);
        const { adminNicks, ownerPlan } = await import("@/lib/plans.ts");
        // владелец AMR: высший тариф без срока и пометка admin - приложение покажет кнопку «Администратор»
        const owner = adminNicks(env("AMR_ADMINS")).includes(user.nick.toLowerCase());
        const p: { plan: string; until?: number; trial?: boolean } = owner ? ownerPlan(app) : planOf(user.plans, app);
        const exp = p.until ? Math.min(now + ENTITLEMENT_TTL_SEC, Math.floor(p.until / 1000)) : now + ENTITLEMENT_TTL_SEC;
        const token = signEntitlement({ app, sub: user.dataId ?? user.nick, nick: user.nick, plan: p.plan, ...(p.until ? { until: p.until } : {}), ...(p.trial ? { trial: true } : {}), ...(owner ? { admin: true } : {}), iat: now, exp }, seed);
        return out({ token });
      },
    },
  },
});
