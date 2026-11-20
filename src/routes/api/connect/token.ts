import { createFileRoute } from "@tanstack/react-router";

/** Выдать одноразовый токен «Войти через AMR ID» после согласия пользователя (только с этого сайта). */
export const Route = createFileRoute("/api/connect/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireUser } = await import("@/lib/auth/session.ts");
        const { json, readJson } = await import("@/lib/http.ts");
        const { connectSecret } = await import("@/lib/env.server.ts");
        const { checkConnect, signConnectToken, connectRedirect, displayNameOf } = await import("@/lib/connect.ts");
        const user = await requireUser(request);
        if (user instanceof Response) return user;
        const body = await readJson<{ app?: unknown; return?: unknown; state?: unknown }>(request);
        const req = checkConnect(body?.app, body?.return, body?.state);
        if (!req) return json({ error: "bad_request" }, 400);
        const secret = connectSecret(req.app.id, req.app.secretEnv);
        if (!secret || secret.length < 32) return json({ error: "not_configured" }, 503);
        const token = signConnectToken(
          { sub: user.dataId ?? user.nick, nick: user.nick, name: displayNameOf(user.nick), aud: req.app.id, state: req.state },
          secret,
        );
        return json({ redirect: connectRedirect(req, token) }, 200, { "Cache-Control": "no-store" });
      },
    },
  },
});
