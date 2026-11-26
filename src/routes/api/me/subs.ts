import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/me/subs - «Мои подписки»: план человека в каждом приложении AMR (25.11.2026).
 * Только свои данные: читается запись этого аккаунта, ничего чужого.
 */
export const Route = createFileRoute("/api/me/subs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireUser } = await import("@/lib/auth/session.ts");
        const { json } = await import("@/lib/http.ts");
        const { PLAN_APPS, TRIAL_PLAN, planOf } = await import("@/lib/plans.ts");
        const user = await requireUser(request);
        if (user instanceof Response) return user;
        const apps = (Object.keys(PLAN_APPS) as (keyof typeof PLAN_APPS)[]).map((app) => {
          const p = planOf(user.plans, app);
          return { app, plan: p.plan, until: p.until ?? null, trial: !!p.trial, trialUsed: !!user.trials?.[app], trialAvailable: !!TRIAL_PLAN[app] && !user.trials?.[app] };
        });
        const { hostelSubs } = await import("@/lib/hostel-subs.ts");
        const { appCommand } = await import("@/lib/admin-stats.ts");
        const { env } = await import("@/lib/env.server.ts");
        // 27.11.2026: Safar - подписка водителя (машина, места, срок), а не старый тариф Pro
        const [hostels, sf] = await Promise.all([
          hostelSubs(user.dataId ?? user.nick, user.nick),
          appCommand("safar", env("AMR_ID_SAFAR_SECRET"), { action: "driver", nick: user.nick }),
        ]);
        const safar = sf.status === 200 && sf.data && typeof sf.data === "object" ? sf.data : null;
        return json({ nick: user.nick, apps, hostels, safar });
      },
    },
  },
});
