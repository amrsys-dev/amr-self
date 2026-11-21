import { createFileRoute } from "@tanstack/react-router";

/** GET /api/favicon?d=example.com - the site's icon as a small raster image (cached for a week). */
export const Route = createFileRoute("/api/favicon")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { safeHost, iconLinks, ICON_TYPES, MAX_ICON_BYTES } = await import("@/lib/favicon.ts");
        const host = safeHost(new URL(request.url).searchParams.get("d") ?? "");
        if (!host) return new Response(null, { status: 400 });

        const get = async (url: string, limit: number) => {
          for (let hop = 0, u = url; hop < 3; hop++) {
            const target = new URL(u);
            if (target.protocol !== "https:" || !safeHost(target.hostname)) return null;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 3000);
            try {
              const res = await fetch(target, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "AMR-ID-favicon/1.0" } });
              if (res.status >= 300 && res.status < 400) {
                const loc = res.headers.get("location");
                if (!loc) return null;
                u = new URL(loc, target).toString();
                continue;
              }
              if (!res.ok || !res.body) return null;
              const len = Number(res.headers.get("content-length") ?? 0);
              if (len > limit) return null;
              const reader = res.body.getReader();
              const chunks: Uint8Array[] = [];
              let size = 0;
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > limit) {
                  void reader.cancel();
                  return null;
                }
                chunks.push(value);
              }
              const buf = new Uint8Array(size);
              let o = 0;
              for (const c of chunks) {
                buf.set(c, o);
                o += c.byteLength;
              }
              return { type: (res.headers.get("content-type") ?? "").split(";")[0].trim(), body: buf, url: target.toString() };
            } catch {
              return null;
            } finally {
              clearTimeout(timer);
            }
          }
          return null;
        };

        const candidates: string[] = [];
        const page = await get(`https://${host}/`, 256 * 1024);
        if (page && /html/i.test(page.type)) candidates.push(...iconLinks(new TextDecoder().decode(page.body), page.url).slice(0, 3));
        candidates.push(`https://${host}/apple-touch-icon.png`, `https://${host}/favicon.ico`);

        for (const c of candidates) {
          const icon = await get(c, MAX_ICON_BYTES);
          if (icon && ICON_TYPES.test(icon.type) && icon.body.byteLength > 0) {
            return new Response(icon.body, {
              status: 200,
              headers: {
                "content-type": icon.type,
                "cache-control": "public, max-age=604800, s-maxage=604800",
                "x-content-type-options": "nosniff",
                "content-security-policy": "default-src 'none'; sandbox",
              },
            });
          }
        }
        return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } });
      },
    },
  },
});
