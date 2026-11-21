import { createFileRoute } from "@tanstack/react-router";

/** AMR admins (env AMR_ADMINS) set a user's plan in an app until payments exist. */
async function admin(request: Request) {
  const { requireUser } = await import("@/lib/auth/session.ts");
  const { json } = await import("@/lib/http.ts");
  const { adminNicks } = await import("@/lib/plans.ts");
  const { env } = await import("@/lib/env.server.ts");
  const me = await requireUser(request);
  if (me instanceof Response) return me;
  if (!adminNicks(env("AMR_ADMINS")).includes(me.nick.toLowerCase())) return json({ error: "forbidden" }, 403);
  return me;
}

export const Route = createFileRoute("/api/admin/plan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await admin(request);
        if (me instanceof Response) return me;
        const { json } = await import("@/lib/http.ts");
        const { getStores } = await import("@/lib/storage/index.ts");
        const { nickKey } = await import("@/lib/user.ts");
        const { PLAN_APPS, planOf } = await import("@/lib/plans.ts");
        const nick = (new URL(request.url).searchParams.get("nick") ?? "").trim().toLowerCase().replace(/^@/, "");
        if (!nick) return json({ admin: true, apps: PLAN_APPS });
        const raw = await getStores().kv.get(nickKey(nick));
        if (!raw) return json({ error: "not_found" }, 404);
        const user = JSON.parse(raw) as import("@/lib/user.ts").UserRecord;
        const plans = Object.fromEntries((Object.keys(PLAN_APPS) as (keyof typeof PLAN_APPS)[]).map((a) => [a, planOf(user.plans, a)]));
        return json({ nick: user.nick, plans });
      },
      POST: async ({ request }) => {
        const me = await admin(request);
        if (me instanceof Response) return me;
        const { json, readJson } = await import("@/lib/http.ts");
        const { getStores } = await import("@/lib/storage/index.ts");
        const { nickKey } = await import("@/lib/user.ts");
        const { isPlanApp, isPlanOf } = await import("@/lib/plans.ts");
        const body = await readJson<{ nick?: unknown; app?: unknown; plan?: unknown; days?: unknown }>(request);
        const nick = String(body?.nick ?? "").trim().toLowerCase().replace(/^@/, "");
        const app = body?.app;
        if (!nick || !isPlanApp(app) || !isPlanOf(app, body?.plan)) return json({ error: "bad_request" }, 400);
        const days = Number(body?.days);
        const kv = getStores().kv;
        const raw = await kv.get(nickKey(nick));
        if (!raw) return json({ error: "not_found" }, 404);
        const user = JSON.parse(raw) as import("@/lib/user.ts").UserRecord;
        const plans = { ...(user.plans ?? {}) };
        if (body?.plan === "free") delete plans[app];
        else plans[app] = { plan: String(body?.plan), ...(Number.isFinite(days) && days > 0 ? { until: Date.now() + Math.min(days, 3660) * 86400000 } : {}) };
        user.plans = plans;
        await kv.put(nickKey(nick), JSON.stringify(user));
        return json({ ok: true, nick, app, plan: plans[app] ?? { plan: "free" } });
      },
    },
  },
});
