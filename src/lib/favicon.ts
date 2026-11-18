/**
 * Website icon for the «Сайт» contact. The server fetches it (the page's CSP allows only own images),
 * with strict limits: public https hosts only, no IP addresses, short timeout, small size, raster images only.
 */
const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;
const BLOCKED = /(?:^|\.)(?:localhost|local|internal|intranet|home|lan|corp|test|invalid|example)$/i;

export function safeHost(input: string): string | null {
  const h = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#:]/)[0] ?? "";
  if (!HOST_RE.test(h) || BLOCKED.test(h)) return null;
  if (/^\d+(?:\.\d+){3}$/.test(h)) return null;
  return h;
}

/** Icon links from a page head, best first (apple-touch-icon, then big icons, then any icon). */
export function iconLinks(html: string, base: string): string[] {
  const out: { href: string; score: number }[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!/\bicon\b/.test(rel)) continue;
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (!href || /\.svg(?:$|\?)/i.test(href) || href.startsWith("data:")) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    const size = Number(/\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    out.push({ href: url.toString(), score: (rel.includes("apple-touch") ? 1000 : 0) + Math.min(size, 512) });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.href);
}

export const ICON_TYPES = /^image\/(?:png|x-icon|vnd\.microsoft\.icon|jpeg|webp|gif)$/i;
export const MAX_ICON_BYTES = 96 * 1024;
