import { useEffect, useState } from "react";
import { Header } from "./ui.tsx";
import type { App } from "./use-id-app.ts";
import { AdminPlans } from "./admin-plans.tsx";
import { api } from "@/lib/client.ts";

/**
 * 26.11.2026 (Мурад): одна админка для всех приложений AMR - в AMR ID, только для AMR_ADMINS.
 * Статистика (пользователи, посещаемость, водители, хостелы), тарифы, подписка водителя Safar.
 * Только для администратора, поэтому тексты по-русски.
 */
type Stats = {
  amrid: { users: number | null; sessions: number | null };
  safar: {
    users: number | null; new7: number | null; drivers: number | null;
    visits: { today: number | null; week: number | null; days: { d: string; n: number }[] };
    taxi: { drivers: number; subs: number; trips: number; bookings: number; leads: number } | null;
  } | null;
  hostel: { hostels: number; active: number; owners: number; seats: number; busy: number; bookings7: number; bookingsOpen: number } | null;
};

const v = (n: number | null | undefined) => (n == null ? "-" : String(n));

/** Кнопка «Админка» в профиле - видна только администратору. */
export function AdminEntry({ app }: { app: App }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void api<{ admin?: boolean }>("/api/admin/plan").then((r) => setAdmin(Boolean(r.ok && r.data.admin)));
  }, []);
  if (!admin) return null;
  return (
    <div className="group">
      <div className="card pad0 set-list">
        <button type="button" className="set-row" onClick={() => app.setScreen("admin")}>
          <span className="set-label"><b>Админка AMR</b><small>Все приложения: пользователи, посещаемость, тарифы, подписки</small></span>
          <span className="set-chev" aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}

export function AdminScreen({ app }: { app: App }) {
  const { screen, setScreen, session } = app;
  const [st, setSt] = useState<Stats | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (screen !== "admin" || !session) return;
    setBad(false);
    void api<Stats>("/api/admin/stats").then((r) => (r.ok && r.data ? setSt(r.data) : setBad(true)));
  }, [screen, session]);
  if (screen !== "admin") return null;
  const days = st?.safar?.visits.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <>
      <Header title="Админка AMR" onBack={() => setScreen("profile")} />
      <div className="page adm">
        {bad && <p className="err">Нет доступа или нет связи</p>}
        {!st && !bad && <p className="hint">Загружаю…</p>}
        {st && (
          <>
            <div className="group">
              <div className="lab">AMR ID</div>
              <div className="card adm-grid">
                <Num n={st.amrid.users} l="аккаунтов" />
                <Num n={st.amrid.sessions} l="активных входов" />
              </div>
            </div>
            <div className="group">
              <div className="lab">Safar</div>
              {st.safar ? (
                <div className="card">
                  <div className="adm-grid">
                    <Num n={st.safar.visits.today} l="зашли сегодня" />
                    <Num n={st.safar.visits.week} l="за 7 дней" />
                    <Num n={st.safar.users} l="в Telegram" />
                    <Num n={st.safar.new7} l="новых за 7 дней" />
                    <Num n={st.safar.drivers} l="анкет водителей" />
                    <Num n={st.safar.taxi?.subs} l="подписок водителей" />
                    <Num n={st.safar.taxi?.trips} l="открытых рейсов" />
                    <Num n={st.safar.taxi?.bookings} l="броней за сутки" />
                    <Num n={st.safar.taxi?.leads} l="заявок за сутки" />
                  </div>
                  {days.length > 0 && (
                    <div className="adm-bars" aria-label="Посещаемость по дням">
                      {days.map((d) => (
                        <span key={d.d} className="adm-bar">
                          <i style={{ height: `${Math.round((d.n / max) * 100)}%` }} />
                          <b>{d.n}</b>
                          <small>{d.d}</small>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="hint">Посещаемость считается с 26.11.2026: одно устройство - один раз в день.</p>
                </div>
              ) : (
                <p className="hint">Safar не ответил</p>
              )}
            </div>
            <div className="group">
              <div className="lab">Hostel</div>
              {st.hostel ? (
                <div className="card adm-grid">
                  <Num n={st.hostel.hostels} l="хостелов" />
                  <Num n={st.hostel.active} l="с подпиской" />
                  <Num n={st.hostel.seats} l="мест" />
                  <Num n={st.hostel.busy} l="занято" />
                  <Num n={st.hostel.bookings7} l="броней за 7 дней" />
                  <Num n={st.hostel.bookingsOpen} l="ждут ответа" />
                </div>
              ) : (
                <p className="hint">Hostel не ответил</p>
              )}
            </div>
          </>
        )}
        <DriverSub />
        <AdminPlans />
      </div>
    </>
  );
}

function Num({ n, l }: { n: number | null | undefined; l: string }) {
  return (
    <span className="adm-num">
      <b>{v(n)}</b>
      <small>{l}</small>
    </span>
  );
}

/** Подписка водителя Safar (вместо /sub в боте): ник AMR ID или Telegram id и срок. */
function DriverSub() {
  const [who, setWho] = useState("");
  const [days, setDays] = useState("30");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!who.trim()) return setMsg("Введите ник AMR ID или Telegram id водителя");
    setBusy(true);
    const r = await api<{ ok?: boolean; car?: string | null; seats?: number; until?: string | null; error?: string }>("/api/admin/driver-sub", {
      method: "POST",
      body: JSON.stringify({ who: who.trim(), days: Number(days) }),
    });
    setBusy(false);
    if (!r.ok) return setMsg(r.status === 404 ? "Такого водителя нет: пусть сначала откроет Safar и укажет машину" : "Не сохранилось");
    const until = r.data.until ? new Date(r.data.until).toLocaleDateString("ru-RU") : null;
    setMsg(until ? `Готово: подписка до ${until}${r.data.car ? ` · ${r.data.car}, ${r.data.seats} мест` : ""}` : "Подписка выключена");
  }
  return (
    <div className="group">
      <div className="lab">Подписка водителя Safar</div>
      <div className="card adm-plans">
        <input className="in" placeholder="ник (ali.amr) или Telegram id" value={who} onChange={(e) => setWho(e.target.value)} autoCapitalize="none" spellCheck={false} />
        <div className="adm-row">
          <select className="in" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Срок">
            <option value="30">+30 дней</option>
            <option value="60">+60 дней</option>
            <option value="90">+90 дней</option>
            <option value="0">Выключить</option>
          </select>
        </div>
        <button className="btn p" type="button" disabled={busy} onClick={() => void save()}>Сохранить подписку</button>
        {msg ? <p className="hint" role="status">{msg}</p> : null}
      </div>
    </div>
  );
}
