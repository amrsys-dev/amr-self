import { useEffect, useState } from "react";
import { Header } from "./ui.tsx";
import { ServiceIcon } from "../contact-icons.tsx";
import type { App } from "./use-id-app.ts";
import type { ContactKind } from "@/lib/card/visibility.ts";
import { api } from "@/lib/client.ts";

type Item = { nick: string; displayName?: string; avatar?: string | null; kinds?: ContactKind[]; phone?: string; missing?: boolean };

/** «My contacts»: cards saved in AMR ID. Always fresh - read from their owners every time. */
type Found = { nick: string; displayName: string; avatar: string | null; verified: boolean };

export function ContactsScreen({ app }: { app: App }) {
  const { t, screen, setScreen, session, saveProfile } = app;
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  // 28.11.2026 (Мурад): поиск людей по всему AMR ID - только тех, кто включил «Меня можно найти»
  const [found, setFound] = useState<Found[] | null>(null);
  const [savedNow, setSavedNow] = useState<string[]>([]);
  useEffect(() => {
    if (screen !== "contacts" || !session) return;
    void api<{ items: Item[] }>("/api/me/saved").then((r) => setItems(r.ok ? r.data.items : []));
  }, [screen, session?.nick]);
  useEffect(() => {
    const v = q.trim().replace(/^@/, "");
    if (screen !== "contacts" || v.length < 2) return setFound(null);
    const id = setTimeout(() => {
      void api<{ items: Found[] }>(`/api/find?q=${encodeURIComponent(v)}`).then((r) => setFound(r.ok ? r.data.items : []));
    }, 450);
    return () => clearTimeout(id);
  }, [q, screen]);
  if (!session || screen !== "contacts") return null;
  const query = q.trim().toLowerCase();
  const saveFound = async (nick: string) => {
    const r = await api("/api/me/saved", { method: "POST", body: JSON.stringify({ nicks: [nick] }) });
    if (r.ok) setSavedNow((l) => [...l, nick]);
  };
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
        {items ? (
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
        {found !== null ? (
          <>
            <p className="hint" style={{ margin: "12px 0 6px", fontWeight: 700 }}>{t("find_title")}</p>
            {found.filter((f) => !(items ?? []).some((i) => i.nick === f.nick)).length ? (
              <div className="card pad0 set-list">
                {found.filter((f) => !(items ?? []).some((i) => i.nick === f.nick)).map((f) => (
                  <div className="set-row" key={f.nick}>
                    <a href={`/u/${encodeURIComponent(f.nick)}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
                      <span style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flex: "0 0 40px", background: "var(--acc, #00d4ff)", display: "grid", placeItems: "center", fontWeight: 800, color: "#0b0e11" }}>
                        {f.avatar ? <img src={f.avatar} alt="" width={40} height={40} style={{ objectFit: "cover", width: 40, height: 40 }} /> : (f.displayName || f.nick)[0]?.toUpperCase()}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <b dir="auto" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.displayName || f.nick}{f.verified ? " ✓" : ""}</b>
                        <small style={{ display: "block", opacity: 0.7 }}>{f.nick}</small>
                      </span>
                    </a>
                    <button type="button" className="btn s" disabled={savedNow.includes(f.nick)} onClick={() => void saveFound(f.nick)}>
                      {savedNow.includes(f.nick) ? t("find_saved") : t("find_save")}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">{t("find_none")}</p>
            )}
          </>
        ) : null}
        <label className="set-row" style={{ marginTop: 12, gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={Boolean(session.findable)} onChange={(e) => void saveProfile({ findable: e.target.checked })} />
          <span style={{ flex: 1 }}>
            <b style={{ display: "block" }}>{t("find_me")}</b>
            <small style={{ opacity: 0.7 }}>{t("find_me_hint")}</small>
          </span>
        </label>
        <p className="hint" style={{ marginTop: 12 }}>{t("contacts_hint")}</p>
      </div>
    </>
  );
}
