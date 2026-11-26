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
        return json({ amrid: { users: nicks ? nicks.length : null, sessions: sessions ? sessions.length : null }, safar, hostel });
      },
    },
  },
});
