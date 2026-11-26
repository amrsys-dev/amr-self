import { useEffect, useState } from "react";
import { Header } from "./ui.tsx";
import type { App } from "./use-id-app.ts";
import { api } from "@/lib/client.ts";

type HostelSub = { id: number; name: string; until: number | null; status: string };
type SafarDriver = { driver: boolean; car?: string | null; seats?: number; until?: number | null; trialTrip?: boolean };
type Sub = { app: string; plan: string; until: number | null; trial: boolean; trialUsed: boolean; trialAvailable: boolean };

/** 25.11.2026 «Мои подписки»: одна запись человека - что активно в каждом приложении AMR и до какого числа. */
const APPS: { id: string; name: string; icon: string; url: string; noteKey?: string }[] = [
  { id: "safar", name: "Safar", icon: "/apps/safar.webp", url: "https://safar.amrsys.net/" },
  { id: "cut", name: "AMR Cut", icon: "/apps/cut.webp", url: "https://cut.amrsys.net/" },
  { id: "hostel", name: "Hostel", icon: "/apps/hostel.webp", url: "https://hostel.amrsys.net/owner" },
  { id: "self", name: "SELF", icon: "/apps/self.webp", url: "https://self.amrsys.net/", noteKey: "subs_free_all" },
];
const PLAN_NAME: Record<string, string> = { pro: "Pro", business: "Business" };

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function SubsScreen({ app }: { app: App }) {
  const { t, screen, setScreen, session } = app;
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [hostels, setHostels] = useState<HostelSub[] | null | undefined>(undefined);
  const [bad, setBad] = useState(false);
  const [safar, setSafar] = useState<SafarDriver | null | undefined>(undefined);
  useEffect(() => {
    if (screen !== "subs" || !session) return;
    setBad(false);
    void api<{ apps: Sub[]; hostels?: HostelSub[] | null; safar?: SafarDriver | null }>("/api/me/subs").then((r) => {
      if (!r.ok || !r.data) return setBad(true);
      setSafar(r.data.safar ?? null);
      setSubs(r.data.apps);
      setHostels(r.data.hostels ?? null);
    });
  }, [screen, session]);
  if (screen !== "subs") return null;
  const renew = (name: string) => `https://t.me/amr_ecosystems?text=${encodeURIComponent(`${t("subs_renew_msg")} ${name} (${session?.nick ?? ""})`)}`;
  return (
    <>
      <Header title={t("subs_title")} onBack={() => setScreen("profile")} />
      <div className="page">
      <p className="hint subs-hint">{t("subs_hint")}</p>
      {bad && <p className="err">{t("subs_err")}</p>}
      <div className="card pad0 set-list subs-list">
        {APPS.map((a) => {
          if (a.id === "hostel") return <HostelRow key={a.id} a={a} hostels={hostels} t={t} />;
          if (a.id === "safar") return <SafarRow key={a.id} a={a} d={safar} t={t} renew={renew(a.name)} />;
          const s = subs?.find((x) => x.app === a.id);
          const paid = s && s.plan !== "free";
          const status = a.noteKey ? t(a.noteKey as never) : !s ? "…" : paid ? `${PLAN_NAME[s.plan] ?? s.plan}${s.trial ? ` · ${t("subs_trial")}` : ""}${s.until ? ` · ${t("subs_until")} ${fmt(s.until)}` : ""}` : `${t("subs_free")}${s.trialAvailable ? ` · ${t("subs_trial_avail")}` : ""}`;
          return (
            <div className="set-row subs-row" key={a.id}>
              <img src={a.icon} alt="" width={40} height={40} className="subs-ic" loading="lazy" />
              <span className="set-label">
                <b>{a.name}</b>
                <small className={paid ? "subs-on" : ""}>{status}</small>
              </span>
              <span className="subs-acts">
                <a className="btn sm" href={a.url} target="_blank" rel="noopener noreferrer">{t("subs_open")}</a>
                {!a.noteKey && (
                  <a className="btn sm p" href={renew(a.name)} target="_blank" rel="noopener noreferrer">{t(paid ? "subs_renew" : "subs_buy")}</a>
                )}
              </span>
            </div>
          );
        })}
      </div>
      </div>
    </>
  );
}

/** Hostel: подписка у каждого хостела своя - строка на каждый хостел владельца со сроком. Гостям бесплатно. */
function HostelRow({ a, hostels, t }: { a: (typeof APPS)[number]; hostels: HostelSub[] | null | undefined; t: App["t"] }) {
  const own = hostels && hostels.length > 0;
  const lines: { text: string; on: boolean }[] =
    hostels === undefined
      ? [{ text: "…", on: false }]
      : hostels === null
        ? [{ text: t("subs_hostel_note"), on: false }]
        : !own
          ? [{ text: t("subs_hostel_none"), on: false }]
          : hostels.map((h) => {
              const on = h.status === "active" || h.status === "expiring";
              return { text: `${h.name} · ${on && h.until ? `${t("subs_until")} ${fmt(h.until)}` : t("subs_expired")}`, on };
            });
  return (
    <div className="set-row subs-row">
      <img src={a.icon} alt="" width={40} height={40} className="subs-ic" loading="lazy" />
      <span className="set-label">
        <b>{a.name}</b>
        {lines.map((l, i) => (
          <small key={i} className={l.on ? "subs-on" : ""}>{l.text}</small>
        ))}
      </span>
      <span className="subs-acts">
        <a className={own ? "btn sm p" : "btn sm"} href={a.url} target="_blank" rel="noopener noreferrer">{t(own ? "subs_renew" : "subs_open")}</a>
      </span>
    </div>
  );
}

/** Safar: пассажирам бесплатно; водителю - подписка по местам машины (10 ﷼ за место в месяц). */
function SafarRow({ a, d, t, renew }: { a: (typeof APPS)[number]; d: SafarDriver | null | undefined; t: App["t"]; renew: string }) {
  const on = !!d?.driver && !!d.until;
  const text =
    d === undefined ? "…"
      : !d || !d.driver ? t("subs_safar_none")
      : on ? `${t("subs_safar_on")} · ${t("subs_until")} ${fmt(d.until!)}${d.seats ? ` · ${d.seats} ${t("subs_seats")}` : ""}`
      : t("subs_safar_off");
  return (
    <div className="set-row subs-row">
      <img src={a.icon} alt="" width={40} height={40} className="subs-ic" loading="lazy" />
      <span className="set-label">
        <b>{a.name}</b>
        <small className={on ? "subs-on" : ""}>{text}</small>
      </span>
      <span className="subs-acts">
        <a className="btn sm" href={a.url} target="_blank" rel="noopener noreferrer">{t("subs_open")}</a>
        {d?.driver ? <a className="btn sm p" href={renew} target="_blank" rel="noopener noreferrer">{t(on ? "subs_renew" : "subs_buy")}</a> : null}
      </span>
    </div>
  );
}
