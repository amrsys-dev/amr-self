import { useEffect, useState } from "react";
import { Header } from "./ui.tsx";
import type { App } from "./use-id-app.ts";
import { AdminPlans } from "./admin-plans.tsx";
import { api } from "@/lib/client.ts";

/**
 * Пульт управления AMR (Мурад, 27.11.2026): в профиле одна кнопка «Администратор» - видна только владельцу (AMR_ADMINS).
 * Внутри - список приложений; нажал приложение - его страница: статистика посещений и подписок и управление подписками.
 * Из профиля любого приложения AMR ссылка id.amrsys.net/?admin=<приложение> открывает сразу его страницу.
 * Только для администратора, поэтому тексты по-русски.
 */
type Plans = Record<string, { pro: number; trial: number; business: number }>;
type Stats = {
  amrid: { users: number | null; sessions: number | null };
  plans?: Plans | null;
  safar: {
    users: number | null; new7: number | null; drivers: number | null;
    visits: { today: number | null; week: number | null; days: { d: string; n: number }[] };
    taxi: { drivers: number; subs: number; trips: number; bookings: number; leads: number } | null;
  } | null;
  hostel: { hostels: number; active: number; owners: number; seats: number; busy: number; bookings7: number; bookingsOpen: number } | null;
};

export const ADMIN_APP_LIST = [
  ["amrid", "AMR ID", "id"],
  ["safar", "Safar", "safar"],
  ["hostel", "Hostel", "hostel"],
  ["cut", "AMR Cut", "cut"],
  ["bazar", "AMR Market", "bazar"],
  ["self", "SELF", "self"],
] as const;
type AdminAppId = (typeof ADMIN_APP_LIST)[number][0];
const isAdminApp = (v: string | null): v is AdminAppId => ADMIN_APP_LIST.some(([id]) => id === v);

/** ?admin=<приложение> из профиля другого приложения - запоминаем до входа и открываем пульт. */
export const ADMIN_APP_KEY = "amr.adminApp";
export function takeAdminLink(): AdminAppId | null {
  try {
    const u = new URL(window.location.href);
    const q = u.searchParams.get("admin");
    if (isAdminApp(q)) {
      sessionStorage.setItem(ADMIN_APP_KEY, q);
      u.searchParams.delete("admin");
      window.history.replaceState(null, "", u.pathname + u.search);
    }
    const v = sessionStorage.getItem(ADMIN_APP_KEY);
    return isAdminApp(v) ? v : null;
  } catch {
    return null;
  }
}

const v = (n: number | null | undefined) => (n == null ? "-" : String(n));

/** Одна кнопка «Администратор» в профиле - видна только владельцу. */
export function AdminEntry({ app }: { app: App }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void api<{ admin?: boolean }>("/api/admin/plan").then((r) => {
      const ok = Boolean(r.ok && r.data.admin);
      setAdmin(ok);
      // пришли из профиля другого приложения (?admin=safar) - сразу пульт этого приложения
      if (ok && takeAdminLink()) app.setScreen("admin");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!admin) return null;
  return (
    <div className="group">
      <div className="card pad0 set-list">
        <button type="button" className="set-row" onClick={() => app.setScreen("admin")}>
          <span className="set-label">Администратор</span>
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
  const [sel, setSel] = useState<AdminAppId | null>(null);
  useEffect(() => {
    if (screen !== "admin" || !session) return;
    const link = takeAdminLink();
    if (link) {
      setSel(link);
      try {
        sessionStorage.removeItem(ADMIN_APP_KEY);
      } catch {
        /* нет хранилища */
      }
    }
    setBad(false);
    void api<Stats>("/api/admin/stats").then((r) => (r.ok && r.data ? setSt(r.data) : setBad(true)));
  }, [screen, session]);
  if (screen !== "admin") return null;
  const cur = ADMIN_APP_LIST.find(([id]) => id === sel);
  return (
    <>
      <Header title={cur ? cur[1] : "Администратор"} onBack={() => (sel ? setSel(null) : setScreen("profile"))} />
      <div className="page adm">
        {bad && <p className="err">Нет доступа или нет связи</p>}
        {!st && !bad && <p className="hint">Загружаю…</p>}
        {!sel && (
          <div className="group">
            <div className="card pad0 set-list">
              {ADMIN_APP_LIST.map(([id, name, ic]) => (
                <button key={id} type="button" className="set-row" onClick={() => setSel(id)}>
                  <img className="set-appic" src={`/apps/${ic}.webp`} alt="" width={32} height={32} />
                  <span className="set-label">{name}</span>
                  <span className="adm-mini">{st ? short(id, st) : ""}</span>
                  <span className="set-chev" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {sel && st && <AppPage id={sel} st={st} />}
      </div>
    </>
  );
}

/** Короткая цифра в списке: сколько людей у приложения. */
function short(id: AdminAppId, st: Stats): string {
  if (id === "amrid") return v(st.amrid.users);
  if (id === "safar") return v(st.safar?.users);
  if (id === "hostel") return v(st.hostel?.hostels);
  const p = st.plans?.[id];
  return p ? String(p.pro + p.business + p.trial) : "";
}

function AppPage({ id, st }: { id: AdminAppId; st: Stats }) {
  const p = st.plans?.[id];
  const planCard = p ? (
    <div className="group">
      <div className="lab">Подписки</div>
      <div className="card adm-grid">
        <Num n={p.pro + p.business} l="платных" />
        <Num n={p.trial} l="пробных 14 дней" />
        {p.business ? <Num n={p.business} l="Бизнес" /> : null}
      </div>
    </div>
  ) : null;
  if (id === "amrid")
    return (
      <div className="group">
        <div className="lab">Аккаунты</div>
        <div className="card adm-grid">
          <Num n={st.amrid.users} l="аккаунтов" />
          <Num n={st.amrid.sessions} l="активных входов" />
        </div>
      </div>
    );
  if (id === "safar") return <SafarPage st={st} planCard={planCard} />;
  if (id === "hostel")
    return (
      <>
        {st.hostel ? (
          <div className="group">
            <div className="lab">Хостелы</div>
            <div className="card adm-grid">
              <Num n={st.hostel.hostels} l="хостелов" />
              <Num n={st.hostel.active} l="с подпиской" />
              <Num n={st.hostel.owners} l="владельцев" />
              <Num n={st.hostel.seats} l="мест" />
              <Num n={st.hostel.busy} l="занято" />
              <Num n={st.hostel.bookings7} l="броней за 7 дней" />
              <Num n={st.hostel.bookingsOpen} l="ждут ответа" />
            </div>
          </div>
        ) : (
          <p className="hint">Hostel не ответил</p>
        )}
        <div className="group">
          <div className="lab">Подписки владельцев</div>
          <div className="card pad0 set-list">
            <a className="set-row" href="https://hostel.amrsys.net/admin">
              <img className="set-appic" src="/apps/hostel.webp" alt="" width={32} height={32} />
              <span className="set-label">Управление хостелами</span>
              <span className="set-chev" aria-hidden="true">›</span>
            </a>
          </div>
        </div>
      </>
    );
  if (id === "cut")
    return (
      <>
        {planCard}
        <AdminPlans only="cut" />
      </>
    );
  return <p className="hint">{id === "bazar" ? "AMR Market бесплатный: подписок нет, AMR не участвует в сделках." : "SELF бесплатный: подписок нет."}</p>;
}

function SafarPage({ st, planCard }: { st: Stats; planCard: React.ReactNode }) {
  const s = st.safar;
  const days = s?.visits.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <>
      {s ? (
        <div className="group">
          <div className="lab">Посещения</div>
          <div className="card">
            <div className="adm-grid">
              <Num n={s.visits.today} l="сегодня" />
              <Num n={s.visits.week} l="за 7 дней" />
              <Num n={s.users} l="в Telegram" />
              <Num n={s.new7} l="новых за 7 дней" />
              <Num n={s.drivers} l="анкет водителей" />
              <Num n={s.taxi?.trips} l="открытых рейсов" />
              <Num n={s.taxi?.bookings} l="броней за сутки" />
              <Num n={s.taxi?.leads} l="заявок за сутки" />
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
            <p className="hint">Одно устройство - один раз в день.</p>
          </div>
        </div>
      ) : (
        <p className="hint">Safar не ответил</p>
      )}
      <div className="group">
        <div className="lab">Подписки водителей</div>
        <div className="card adm-grid">
          <Num n={s?.taxi?.subs} l="с подпиской" />
          <Num n={s?.taxi?.drivers} l="водителей в боте" />
        </div>
      </div>
      <DriverSub />
      {planCard}
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
    const until = r.data.until ? new Date(r.data.until).toLocaleDateString("ru-RU", { timeZone: "Asia/Riyadh" }) : null;
    setMsg(until ? `Готово: подписка до ${until}${r.data.car ? ` · ${r.data.car}, ${r.data.seats} мест` : ""}` : "Подписка выключена");
  }
  return (
    <div className="group">
      <div className="lab">Выдать подписку водителю</div>
      <div className="card adm-plans">
        <input className="in" placeholder="ник (ali.amr) или Telegram id" value={who} onChange={(e) => setWho(e.target.value)} autoCapitalize="none" spellCheck={false} />
        <select className="in" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Срок">
          <option value="30">+30 дней</option>
          <option value="60">+60 дней</option>
          <option value="90">+90 дней</option>
          <option value="0">Выключить</option>
        </select>
        <button className="btn p" type="button" disabled={busy} onClick={() => void save()}>Сохранить подписку</button>
        {msg ? <p className="hint" role="status">{msg}</p> : null}
      </div>
    </div>
  );
}
