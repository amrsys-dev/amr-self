/**
 * Preview Durable Object worker for AMR ID. OTP relay is not part of this worker.
 */
import { routeDo } from "./do.ts";
export { AmrIdDo } from "./do.ts";

type Env = {
  CF_DO_SECRET: string;
  AMR_ID?: DurableObjectNamespace;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "amr-id-do" });
    }
    if (url.pathname === "/v1/do") {
      return routeDo(request, env);
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  },
};
