import { useEffect, useState } from "react";
import { Header } from "./ui.tsx";
import type { App } from "./use-id-app.ts";
import { api } from "@/lib/client.ts";

type Sub = { app: string; plan: string; until: number | null; trial: boolean; trialUsed: boolean; trialAvailable: boolean };

/** 25.11.2026 «Мои подписки»: одна запись человека - что активно в каждом приложении AMR и до какого числа. */
const APPS: { id: string; name: string; icon: string; url: string; noteKey?: string }[] = [
  { id: "safar", name: "Safar", icon: "/apps/safar.webp", url: "https://safar.amrsys.net/" },
  { id: "cut", name: "AMR Cut", icon: "/apps/cut.webp", url: "https://cut.amrsys.net/" },
  { id: "hostel", name: "Hostel", icon: "/apps/hostel.webp", url: "https://hostel.amrsys.net/profile", noteKey: "subs_hostel_note" },
  { id: "self", name: "SELF", icon: "/apps/self.webp", url: "https://self.amrsys.net/", noteKey: "subs_free_all" },
];
const PLAN_NAME: Record<string, string> = { pro: "Pro", business: "Business" };

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function SubsScreen({ app }: { app: App }) {
  const { t, screen, setScreen, session } = app;
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (screen !== "subs" || !session) return;
    setBad(false);
    void api<{ apps: Sub[] }>("/api/me/subs").then((r) => (r.ok && r.data ? setSubs(r.data.apps) : setBad(true)));
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
