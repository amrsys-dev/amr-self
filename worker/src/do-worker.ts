/**
 * Preview worker for AMR ID: Durable Object coordinator plus bound KV and R2.
 * OTP relay is not part of this worker.
 */
import { authorize, handleGateway, handlePublicCardRequest, unauthorized, type GatewayEnv } from "./gateway.ts";
export { AmrIdDo } from "./do.ts";

export default {
  async fetch(request: Request, env: GatewayEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "amr-id-do",
        kv: Boolean(env.KV),
        r2: Boolean(env.R2),
      });
    }
    if (!authorize(request, env)) return unauthorized();
    if (request.method === "GET" && url.pathname.startsWith("/v1/card/")) {
      return handlePublicCardRequest(request, env, ctx);
    }
    if (url.pathname === "/v1/do" && request.method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ ok: false, error: "invalid" }, { status: 400 });
      }
      return Response.json(await handleGateway(body as import("../../src/lib/storage/durable-object.ts").DoRequest, env, ctx));
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  },
};
