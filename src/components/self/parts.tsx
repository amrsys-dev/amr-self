/** Small shared pieces for the SELF workspace: ids, dates, category icons and picker. */
import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n.ts";
import { categoryLabel } from "./extra-copy.ts";

export const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

export const todayKey = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

export const nowIso = () => new Date().toISOString();

const P: Record<string, ReactNode> = {
  food: <><path d="M5 9h14l-1.4 9.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></>,
  fuel: <><rect x="4" y="4" width="10" height="16" rx="2" /><path d="M4 10h10M14 8l3 2v7a1.5 1.5 0 0 0 3 0V9l-2-3" /></>,
  car: <><path d="M5 16V11l2-4.5h10L19 11v5" /><path d="M3 16h18v2.5H3z" /><circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" /></>,
  housing: <><path d="M3.5 11 12 4l8.5 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></>,
  utilities: <><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></>,
  telecom: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></>,
  health: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></>,
  sport: <><path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" /></>,
  shopping: <><path d="M6 7h12l1 13H5z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></>,
  family: <><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="8" r="2.5" /><path d="M3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0" /></>,
  transfer: <><path d="M4 8h14l-3-3M20 16H6l3 3" /></>,
  salary: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /></>,
  freelance: <><rect x="3" y="7.5" width="18" height="12" rx="2.5" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" /></>,
  advance: <><path d="M12 4v16M5 11l7-7 7 7" /></>,
  bonus: <><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></>,
  water: <><path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11.5" r="2.3" /><path d="M5.8 16.5a3.4 3.4 0 0 1 6.4 0M14 10h4.5M14 13.5h3" /></>,
  other: <><circle cx="6.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="17.5" cy="12" r="1.3" /></>,
};
const LEGACY: Record<string, string> = { transport: "fuel", workTools: "other" };

export function CategoryIcon({ c, size = 20 }: { c?: string; size?: number }) {
  const key = LEGACY[c ?? ""] ?? c ?? "other";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[key] ?? P.other}
    </svg>
  );
}

/** Grid of category chips with icons: faster to scan than a dropdown. */
export function CategoryPicker({ options, value, onChange, lang, label }: { options: readonly string[]; value: string; onChange: (v: string) => void; lang: Lang; label: string }) {
  return (
    <fieldset className="self-cats">
      <legend>{label}</legend>
      <div className="self-cats-grid">
        {options.map((c) => (
          <button key={c} type="button" className={value === c ? "on" : ""} aria-pressed={value === c} onClick={() => onChange(c)}>
            <CategoryIcon c={c} />
            <span>{categoryLabel(lang, c)}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
