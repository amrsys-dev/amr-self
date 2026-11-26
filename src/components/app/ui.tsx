import { useBackLayer } from "@/lib/back-stack.ts";
import { Monogram } from "../monogram.tsx";
import { AUTO_LABEL, type Lang, type MsgKey } from "@/lib/i18n.ts";

export function Brand() {
  return (
    <div className="brand">
      <span className="monopl">
        <Monogram className="mono" />
      </span>
    </div>
  );
}

export function TestBanner({ code, t }: { code?: string; t: (k: MsgKey) => string }) {
  if (!code) return null;
  return (
    <div className="test-banner" role="status">
      <b>{t("test_banner")}</b>
      {t("test_otp")}
      <div className="code">{code}</div>
    </div>
  );
}

export function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const v = value.replace(/\D/g, "").slice(0, 6);
  return (
    <div className="otp-boxes">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="otp-box">
          {v[i] ?? ""}
        </span>
      ))}
      <input
        className="otp-hidden"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={v}
        maxLength={6}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-label="otp"
      />
    </div>
  );
}

export function Header({ title, onBack, tool }: { title?: string; onBack?: () => void; tool?: React.ReactNode }) {
  useBackLayer(Boolean(onBack), () => onBack?.());
  return (
    <div className="hd">
      {onBack ? (
        <button className="back" type="button" onClick={onBack} aria-label="back">
          ‹
        </button>
      ) : (
        <Brand />
      )}
      {title ? <div className="ttl">{title}</div> : null}
      {tool ?? <div className="sp" />}
    </div>
  );
}

export const LANG_OPTIONS: { code: Lang; flag: string; name: string }[] = [
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "ar", flag: "🇸🇦", name: "العربية" },
  { code: "ru", flag: "🇷🇺", name: "Русский" },
  { code: "uz", flag: "🇺🇿", name: "O‘zbekcha" },
  { code: "tj", flag: "🇹🇯", name: "Тоҷикӣ" },
];

/** Compact language dropdown with flags. */
export function LangPicker({ lang, setLang, langAuto, t }: { lang: Lang; setLang: (l: Lang | "auto") => void; langAuto?: boolean; t: (k: MsgKey) => string }) {
  const cur = LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0]!;
  return (
    <label className="lang-pill">
      <span aria-hidden="true">{cur.flag}</span>
      <b>{cur.code.toUpperCase()}</b>
      <span className="set-chev" aria-hidden="true">⌄</span>
      <select className="set-pick" aria-label={t("lang")} value={langAuto ? "auto" : lang} onChange={(e) => setLang(e.target.value as Lang | "auto")}>
        <option value="auto">🌐 {AUTO_LABEL[lang]}</option>
        {LANG_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.flag} {o.name}</option>)}
      </select>
    </label>
  );
}
