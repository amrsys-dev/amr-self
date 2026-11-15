/**
 * Service icons for contacts: a rounded tile in the service's colour with a simple
 * white glyph (our own drawings, not the companies' logos). The same paths are
 * used for the shared card image (canvas Path2D).
 */
import type { ContactKind } from "@/lib/card/visibility.ts";
import type { MsgKey } from "@/lib/i18n.ts";

export type ServiceStyle = { bg: string; fg: string; paths: { d: string; fill?: boolean }[] };

export const SERVICE: Record<ContactKind, ServiceStyle> = {
  telegram: { bg: "#229ED9", fg: "#FFFFFF", paths: [{ d: "M20.5 4.5 3.5 11.2l5.8 2.1M20.5 4.5l-3.6 14.8-6-4.4M20.5 4.5 9.3 13.3v5.2l2.6-3.1" }] },
  whatsapp: {
    bg: "#25D366",
    fg: "#FFFFFF",
    paths: [
      { d: "M12 3.6a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.2-1.1A8.4 8.4 0 1 0 12 3.6Z" },
      { d: "M9.4 8.3c.2 3 3.1 6 6.2 6.3l.9-1.4-1.7-.9-.8.7c-1-.5-2-1.5-2.5-2.5l.7-.8-.9-1.7z", fill: true },
    ],
  },
  signal: { bg: "#3A76F0", fg: "#FFFFFF", paths: [{ d: "M12 4a8 8 0 0 0-6.9 12L4 20l4-1.1A8 8 0 1 0 12 4Z" }] },
  discord: { bg: "#5865F2", fg: "#FFFFFF", paths: [{ d: "M4.5 14.5V12a7.5 7.5 0 0 1 15 0v2.5M4.5 14h3v5h-2a1 1 0 0 1-1-1zM19.5 14h-3v5h2a1 1 0 0 0 1-1z" }] },
  steam: { bg: "#1B2838", fg: "#FFFFFF", paths: [{ d: "M7.2 8.5h9.6a4 4 0 0 1 3.8 5.2l-.8 2.6a2 2 0 0 1-3.4.7L14.6 15H9.4l-1.8 2a2 2 0 0 1-3.4-.7l-.8-2.6a4 4 0 0 1 3.8-5.2ZM8.5 10.5v3M7 12h3M15.5 11.5h.01M17.5 13h.01" }] },
  snapchat: { bg: "#FFFC00", fg: "#111111", paths: [{ d: "M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" }] },
  youtube: {
    bg: "#FF0033",
    fg: "#FFFFFF",
    paths: [
      { d: "M3.5 8c0-1.7 1.3-3 3-3h11c1.7 0 3 1.3 3 3v8c0 1.7-1.3 3-3 3h-11c-1.7 0-3-1.3-3-3z" },
      { d: "M10 9v6l5.2-3z", fill: true },
    ],
  },
  email: { bg: "#0A84FF", fg: "#FFFFFF", paths: [{ d: "M3.5 6h17v12h-17zM4 6.5l8 6.5 8-6.5" }] },
  other: { bg: "#8E8E93", fg: "#FFFFFF", paths: [{ d: "M10 14l4-4M9 16.5l-1.5 1.5a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M15 7.5 16.5 6a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" }] },
};

export function serviceName(kind: ContactKind, t: (k: MsgKey) => string): string {
  if (kind === "telegram") return t("telegram");
  if (kind === "whatsapp") return t("wa");
  if (kind === "email") return t("email");
  if (kind === "other") return t("other_service");
  if (kind === "youtube") return "YouTube";
  return t(kind as MsgKey);
}

export function ServiceIcon({ kind, size = 40 }: { kind: ContactKind; size?: number }) {
  const s = SERVICE[kind] ?? SERVICE.other;
  return (
    <span className="svc-ico" style={{ background: s.bg, color: s.fg, width: size, height: size, borderRadius: size * 0.27 }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {s.paths.map((p, i) => <path key={i} d={p.d} fill={p.fill ? "currentColor" : "none"} stroke={p.fill ? "none" : "currentColor"} />)}
      </svg>
    </span>
  );
}
