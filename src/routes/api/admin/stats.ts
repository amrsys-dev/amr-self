import { createFileRoute } from "@tanstack/react-router";

/** 26.11.2026 общая админка: число пользователей AMR ID и статистика приложений (только AMR_ADMINS). */
export const Route = createFileRoute("/api/admin/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireUser } = await import("@/lib/auth/session.ts");
        const { json } = await import("@/lib/http.ts");
        const { adminNicks } = await import("@/lib/plans.ts");
        const { env } = await import("@/lib/env.server.ts");
        const me = await requireUser(request);
        if (me instanceof Response) return me;
        if (!adminNicks(env("AMR_ADMINS")).includes(me.nick.toLowerCase())) return json({ error: "forbidden" }, 403);
        const { getStores } = await import("@/lib/storage/index.ts");
        const { appStats } = await import("@/lib/admin-stats.ts");
        const kv = getStores().kv;
        const [nicks, sessions, safar, hostel] = await Promise.all([
          kv.list("nick:").catch(() => null),
          kv.list("session:").catch(() => null),
          appStats("safar", env("AMR_ID_SAFAR_SECRET")),
          appStats("hostel", env("AMR_ID_HOSTEL_SECRET")),
        ]);
        // подписки по приложениям: читаем записи аккаунтов (не больше 300)
        let plans: Record<string, { pro: number; trial: number; business: number }> | null = null;
        try {
          const { countPlans } = await import("@/lib/admin-stats.ts");
          const { PLAN_APPS } = await import("@/lib/plans.ts");
          const raws = await Promise.all((nicks ?? []).slice(0, 300).map((k) => kv.get(k).catch(() => null)));
          const users = raws.map((r) => {
            try {
              return r ? (JSON.parse(r) as { plans?: Record<string, { plan: string; until?: number; trial?: boolean }> }) : null;
            } catch {
              return null;
            }
          });
          plans = countPlans(users, Object.keys(PLAN_APPS));
        } catch {
          plans = null;
        }
        return json({ amrid: { users: nicks ? nicks.length : null, sessions: sessions ? sessions.length : null }, plans, safar, hostel });
      },
    },
  },
});
