/**
 * AMR standard for every app: two pills side by side.
 * Theme: one tap cycles light → dark → auto («A»). Language: flag + name, tap opens the list.
 */
import { useEffect, useRef, useState } from "react";
import { AUTO_LABEL, type Lang, type MsgKey } from "@/lib/i18n.ts";
import type { UiMode } from "./use-id-app.ts";
import { LANG_OPTIONS } from "./ui.tsx";

export function ThemeLangBar({ mode, chooseMode, lang, setLang, langAuto, t }: { mode: UiMode; chooseMode: (m: UiMode) => void; lang: Lang; setLang: (l: Lang | "auto") => void; langAuto?: boolean; t: (k: MsgKey) => string }) {
  const next: UiMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
  const label = mode === "light" ? t("mode_light") : mode === "dark" ? t("mode_dark") : t("mode_auto");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0]!;
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="tlbar">
      <button type="button" className="tlpill" onClick={() => chooseMode(next)} aria-label={`${t("ui_mode")}: ${label}`}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          {mode === "system" ? (
            <>
              <circle cx="10" cy="10" r="9" fill="#00d4ff" />
              <text x="10" y="10.5" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="800" fill="#0b0e11">A</text>
            </>
          ) : mode === "light" ? (
            <>
              <circle cx="10" cy="10" r="4" fill="#f5b400" />
              <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4" stroke="#f5b400" strokeWidth="1.8" strokeLinecap="round" />
            </>
          ) : (
            <path d="M16 12.5A7 7 0 1 1 7.5 4a5.5 5.5 0 0 0 8.5 8.5Z" fill="currentColor" />
          )}
        </svg>
        <span>{label}</span>
      </button>
      <div className="tlwrap" ref={box}>
        <button type="button" className="tlpill" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t("lang")}>
          <span className="tlflag" aria-hidden="true">{cur.flag}</span>
          <span>{langAuto ? `${AUTO_LABEL[lang]} · ${cur.name}` : cur.name}</span>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        {open ? (
          <div className="tlmenu" role="listbox" aria-label={t("lang")}>
            <button type="button" role="option" aria-selected={langAuto === true} className={langAuto ? "on" : ""} onClick={() => { setLang("auto"); setOpen(false); }}>
              <span className="tlflag" aria-hidden="true">🌐</span>
              <span>{AUTO_LABEL[lang]}</span>
            </button>
            {LANG_OPTIONS.map((o) => (
              <button key={o.code} type="button" role="option" aria-selected={!langAuto && o.code === lang} className={!langAuto && o.code === lang ? "on" : ""} onClick={() => { setLang(o.code); setOpen(false); }}>
                <span className="tlflag" aria-hidden="true">{o.flag}</span>
                <span>{o.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
