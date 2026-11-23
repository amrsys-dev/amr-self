import { useEffect, useState } from "react";
import { Header } from "./ui.tsx";
import { ServiceIcon } from "../contact-icons.tsx";
import type { App } from "./use-id-app.ts";
import type { ContactKind } from "@/lib/card/visibility.ts";
import { api } from "@/lib/client.ts";

type Item = { nick: string; displayName?: string; avatar?: string | null; kinds?: ContactKind[]; phone?: string; missing?: boolean };

/** «My contacts»: cards saved in AMR ID. Always fresh - read from their owners every time. */
export function ContactsScreen({ app }: { app: App }) {
  const { t, screen, setScreen, session } = app;
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (screen !== "contacts" || !session) return;
    void api<{ items: Item[] }>("/api/me/saved").then((r) => setItems(r.ok ? r.data.items : []));
  }, [screen, session?.nick]);
  if (!session || screen !== "contacts") return null;
  const query = q.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => !query || i.nick.includes(query) || (i.displayName ?? "").toLowerCase().includes(query) || (i.phone ?? "").replace(/\D/g, "").includes(query.replace(/\D/g, "") || "\u0000"));
  const remove = async (nick: string) => {
    if (!window.confirm(t("contacts_remove_q").replace("{n}", nick))) return;
    const r = await api(`/api/me/saved?nick=${encodeURIComponent(nick)}`, { method: "DELETE" });
    if (r.ok) setItems((l) => (l ?? []).filter((x) => x.nick !== nick));
  };
  // 23.11.2026 (Мурад): переслать сохранённую визитку другому человеку.
  const share = async (i: Item) => {
    const url = `${location.origin}/u/${encodeURIComponent(i.nick)}`;
    const title = i.displayName || i.nick;
    try {
      if (navigator.share) return await navigator.share({ title, url });
    } catch {
      return; // отмена в меню «Поделиться»
    }
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } }).Telegram?.WebApp;
    if (tg?.openTelegramLink) return tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`);
    try {
      await navigator.clipboard.writeText(url);
      window.alert(t("contacts_copied"));
    } catch {
      window.prompt(title, url);
    }
  };
  return (
    <>
      <Header title={t("contacts_title")} onBack={() => setScreen("profile")} />
      <div className="page">
        {items && items.length > 6 ? (
          <div className="field" style={{ marginBottom: 12 }}>
            <div className="box">
              <input type="search" placeholder={t("contacts_search")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        ) : null}
        {items === null ? <p className="hint">…</p> : null}
        {items && items.length === 0 ? <p className="hint">{t("contacts_empty")}</p> : null}
        {shown.length ? (
          <div className="card pad0 set-list">
            {shown.map((i) => (
              <div className="set-row" key={i.nick}>
                <a href={`/u/${encodeURIComponent(i.nick)}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
                  <span style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flex: "0 0 44px", background: "var(--acc, #00d4ff)", display: "grid", placeItems: "center", fontWeight: 800, color: "#0b0e11" }}>
                    {i.avatar ? <img src={i.avatar} alt="" width={44} height={44} style={{ objectFit: "cover", width: 44, height: 44 }} /> : (i.displayName || i.nick)[0]?.toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b dir="auto" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.missing ? i.nick : i.displayName || i.nick}</b>
                    <small style={{ display: "block", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.missing ? t("contacts_missing") : i.phone || i.nick}</small>
                    {i.kinds?.length ? (
                      <span style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {Array.from(new Set<ContactKind>(i.kinds)).slice(0, 6).map((k) => (
                          <span key={k}><ServiceIcon kind={k} size={18} /></span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </a>
                <button type="button" className="set-pen" aria-label={t("contacts_share")} title={t("contacts_share")} onClick={() => void share(i)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14 5l6 6-6 6M20 11h-9a6 6 0 0 0-6 6v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" className="set-pen" aria-label={t("contacts_remove")} title={t("contacts_remove")} onClick={() => void remove(i.nick)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="#e5484d" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <p className="hint" style={{ marginTop: 12 }}>{t("contacts_hint")}</p>
      </div>
    </>
  );
}
