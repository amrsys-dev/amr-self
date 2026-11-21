import { useEffect, useState } from "react";
import { api } from "@/lib/client.ts";

type Apps = Record<string, readonly string[]>;
const APP_NAME: Record<string, string> = { cut: "AMR Cut", safar: "AMR Safar" };
const PLAN_NAME: Record<string, string> = { free: "Бесплатно", pro: "Pro", business: "Бизнес" };

/** Only for AMR admins (env AMR_ADMINS): set a plan for a nick until payments exist. */
export function AdminPlans() {
  const [apps, setApps] = useState<Apps | null>(null);
  const [nick, setNick] = useState("");
  const [app, setApp] = useState("cut");
  const [plan, setPlan] = useState("pro");
  const [days, setDays] = useState("30");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ admin?: boolean; apps?: Apps }>("/api/admin/plan").then((r) => {
      if (r.ok && r.data.admin && r.data.apps) setApps(r.data.apps);
    });
  }, []);
  if (!apps) return null;

  const n = nick.trim().replace(/^@/, "").toLowerCase();
  async function look() {
    if (!n) return;
    const r = await api<{ plans?: Record<string, { plan: string; until?: number }>; error?: string }>(`/api/admin/plan?nick=${encodeURIComponent(n)}`);
    if (!r.ok) return setMsg(r.status === 404 ? "Такого ника нет" : "Ошибка");
    setMsg(Object.entries(r.data.plans ?? {}).map(([a, p]) => `${APP_NAME[a] ?? a}: ${PLAN_NAME[p.plan] ?? p.plan}${p.until ? ` до ${new Date(p.until).toLocaleDateString("ru-RU")}` : ""}`).join(" · "));
  }
  async function save() {
    if (!n) return setMsg("Введите ник");
    setBusy(true);
    const r = await api<{ plan?: { plan: string; until?: number } }>("/api/admin/plan", { method: "POST", body: JSON.stringify({ nick: n, app, plan, days: Number(days) || 0 }) });
    setBusy(false);
    if (!r.ok) return setMsg(r.status === 404 ? "Такого ника нет" : "Не сохранилось");
    const p = r.data.plan;
    setMsg(`Готово: @${n} - ${APP_NAME[app]}: ${PLAN_NAME[p?.plan ?? "free"]}${p?.until ? ` до ${new Date(p.until).toLocaleDateString("ru-RU")}` : ""}. Приложение увидит при следующем открытии с интернетом.`);
  }

  return (
    <div className="group">
      <div className="lab">Тарифы (администратор)</div>
      <div className="card adm-plans">
        <input className="in" placeholder="ник, например murad.amr" value={nick} onChange={(e) => setNick(e.target.value)} onBlur={() => void look()} autoCapitalize="none" spellCheck={false} />
        <div className="adm-row">
          <select className="in" value={app} onChange={(e) => { setApp(e.target.value); setPlan("pro"); }}>
            {Object.keys(apps).map((a) => <option key={a} value={a}>{APP_NAME[a] ?? a}</option>)}
          </select>
          <select className="in" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {(apps[app] ?? []).map((p) => <option key={p} value={p}>{PLAN_NAME[p] ?? p}</option>)}
          </select>
          <select className="in" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Срок">
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
            <option value="365">1 год</option>
            <option value="0">Бессрочно</option>
          </select>
        </div>
        <button className="btn p" type="button" disabled={busy} onClick={() => void save()}>Сохранить тариф</button>
        {msg ? <p className="hint" role="status">{msg}</p> : null}
      </div>
    </div>
  );
}
