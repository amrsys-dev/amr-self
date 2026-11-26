import { createFileRoute } from "@tanstack/react-router";

/** 26.11.2026 общая админка: подписка водителя Safar по нику AMR ID или Telegram id (только AMR_ADMINS). */
export const Route = createFileRoute("/api/admin/driver-sub")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireUser } = await import("@/lib/auth/session.ts");
        const { json, readJson } = await import("@/lib/http.ts");
        const { adminNicks } = await import("@/lib/plans.ts");
        const { env } = await import("@/lib/env.server.ts");
        const me = await requireUser(request);
        if (me instanceof Response) return me;
        if (!adminNicks(env("AMR_ADMINS")).includes(me.nick.toLowerCase())) return json({ error: "forbidden" }, 403);
        const body = await readJson<{ who?: unknown; days?: unknown }>(request);
        const who = String(body?.who ?? "").trim().slice(0, 64);
        const days = Number(body?.days);
        if (!who || !Number.isInteger(days) || days < 0 || days > 400) return json({ error: "bad_request" }, 400);
        const { appCommand } = await import("@/lib/admin-stats.ts");
        const r = await appCommand("safar", env("AMR_ID_SAFAR_SECRET"), { action: "sub", who, days });
        return json(r.data ?? { error: "server_error" }, r.status);
      },
    },
  },
});
