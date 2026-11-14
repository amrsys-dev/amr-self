import { LANGS, type Lang, type MsgKey } from "@/lib/i18n.ts";

export function Brand() {
  return (
    <div className="brand">
      <span className="monopl">
        <img className="mono" src="/amr-mono.png" alt="" />
      </span>
      <span className="appname">SELF</span>
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

export function LangPicker({ lang, setLang, t }: { lang: Lang; setLang: (l: Lang) => void; t: (k: MsgKey) => string }) {
  const labels: Record<Lang, string> = { ru: "RU", ar: "AR", uz: "UZ", tj: "TJ", en: "EN" };
  return (
    <div className="group">
      <div className="lab">{t("lang")}</div>
      <div className="cit">
        {LANGS.map((l) => (
          <button key={l} type="button" className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
            {labels[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
