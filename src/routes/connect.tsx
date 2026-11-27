import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { detectLang, type Lang } from "@/lib/i18n.ts";
import { Monogram } from "@/components/monogram.tsx";

/** Экран «Войти через AMR ID» для приложений AMR. Сервер ещё раз проверяет приложение и адрес возврата. */
const OK_KEY = "amr.connect.ok";
function rememberedOk(app: string, nick: string): boolean {
  try {
    const m = JSON.parse(localStorage.getItem(OK_KEY) || "{}") as Record<string, string>;
    return m[app] === nick;
  } catch {
    return false;
  }
}
function remember(app: string, nick: string) {
  try {
    const m = JSON.parse(localStorage.getItem(OK_KEY) || "{}") as Record<string, string>;
    m[app] = nick;
    localStorage.setItem(OK_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked - просто спросим в следующий раз */
  }
}

export const Route = createFileRoute("/connect")({ component: ConnectPage });

const APPS: Record<string, { title: string; home: string; returnUrl: string; extraReturnUrls?: readonly string[] }> = {
  bazar: { title: "AMR Market", home: "https://bazar.amrsys.net/", returnUrl: "https://bazar.amrsys.net/api/auth/amrid" },
  self: { title: "SELF", home: "https://self.amrsys.net/", returnUrl: "https://self.amrsys.net/api/auth/amrid" },
  cut: { title: "AMR Cut", home: "https://cut.amrsys.net/", returnUrl: "https://cut.amrsys.net/" },
  safar: { title: "AMR Safar", home: "https://safar.amrsys.net/", returnUrl: "https://safar.amrsys.net/api/auth/amrid" },
  hostel: { title: "AMR Hostel", home: "https://hostel.amrsys.net/", returnUrl: "https://hostel.amrsys.net/api/auth/amrid", extraReturnUrls: ["https://hostel-preview.amrsys.net/api/auth/amrid"] },
};

const T: Record<string, Record<string, string>> = {
  ru: { ask: "Разрешить {app} видеть ваш ник и имя?", only: "Телефон, почта и скрытые контакты не передаются.", allow: "Разрешить", cancel: "Отмена", login: "Сначала войдите в AMR ID или создайте его.", loginBtn: "Войти или создать AMR ID", bad: "Неверная ссылка входа.", fail: "Не получилось. Попробуйте ещё раз.", wait: "Проверяю…" },
  en: { ask: "Allow {app} to see your nickname and name?", only: "Phone, email and hidden contacts are not shared.", allow: "Allow", cancel: "Cancel", login: "First sign in to AMR ID or create one.", loginBtn: "Sign in or create AMR ID", bad: "Invalid sign-in link.", fail: "Something went wrong. Try again.", wait: "Checking…" },
  ar: { ask: "هل تسمح لـ {app} برؤية اسم المستخدم والاسم؟", only: "لا تتم مشاركة الهاتف والبريد وجهات الاتصال المخفية.", allow: "سماح", cancel: "إلغاء", login: "سجّل الدخول إلى AMR ID أو أنشئه أولًا.", loginBtn: "تسجيل الدخول أو إنشاء AMR ID", bad: "رابط الدخول غير صالح.", fail: "حدث خطأ. حاول مرة أخرى.", wait: "جارٍ التحقق…" },
  uz: { ask: "{app} sizning nik va ismingizni ko‘rishiga ruxsat berasizmi?", only: "Telefon, pochta va yashirin kontaktlar berilmaydi.", allow: "Ruxsat berish", cancel: "Bekor qilish", login: "Avval AMR ID’ga kiring yoki uni yarating.", loginBtn: "Kirish yoki AMR ID yaratish", bad: "Kirish havolasi noto‘g‘ri.", fail: "Xatolik. Qayta urinib ko‘ring.", wait: "Tekshirilmoqda…" },
  tj: { ask: "Ба {app} иҷозат медиҳед, ки ник ва номи шуморо бинад?", only: "Телефон, почта ва контактҳои пинҳон дода намешаванд.", allow: "Иҷозат додан", cancel: "Бекор кардан", login: "Аввал ба AMR ID ворид шавед ё онро созед.", loginBtn: "Ворид шудан ё сохтани AMR ID", bad: "Пайванди воридшавӣ нодуруст аст.", fail: "Хато шуд. Боз кӯшиш кунед.", wait: "Санҷиш…" },
};

export const CONNECT_PENDING_KEY = "amr-connect-pending";

function ConnectPage() {
  const [lang, setLang] = useState<Lang>("ru" as Lang);
  const [state, setState] = useState<"wait" | "login" | "ask" | "bad" | "busy" | "fail">("wait");
  const [nick, setNick] = useState("");
  const [q, setQ] = useState<{ app: string; ret: string; st: string } | null>(null);
  const t = T[lang] ?? T.en;

  useEffect(() => {
    setLang(detectLang());
    const p = new URLSearchParams(location.search);
    const app = p.get("app") ?? "";
    const ret = p.get("return") ?? "";
    const st = p.get("state") ?? "";
    const a = APPS[app];
    if (!a || (ret !== a.returnUrl && !(a.extraReturnUrls ?? []).includes(ret)) || !/^[A-Za-z0-9_-]{16,128}$/.test(st)) {
      setState("bad");
      return;
    }
    setQ({ app, ret, st });
    fetch("/api/me", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) return setState("login");
        const me = (await r.json()) as { nick?: string };
        setNick(me.nick ?? "");
        // 25.11.2026: единый вход - если на этом телефоне уже разрешили это приложение для этого AMR ID,
        // не спрашиваем снова: сразу возвращаем в приложение (как «Войти через Google»).
        if (me.nick && rememberedOk(app, me.nick)) {
          setState("busy");
          void allowFor({ app, ret, st }, me.nick);
          return;
        }
        setState("ask");
      })
      .catch(() => setState("fail"));
  }, []);

  const app = q ? APPS[q.app] : undefined;

  function goLogin() {
    try {
      const v = location.pathname + location.search;
      sessionStorage.setItem(CONNECT_PENDING_KEY, v);
      // Sign-in may finish in another tab (code from the Telegram bot): keep it 10 minutes on this device too.
      localStorage.setItem(CONNECT_PENDING_KEY, JSON.stringify({ v, exp: Date.now() + 10 * 60 * 1000 }));
    } catch {
      /* storage blocked */
    }
    location.href = "/";
  }

  async function allow() {
    if (!q) return;
    return allowFor(q, nick);
  }

  async function allowFor(q: { app: string; ret: string; st: string }, who: string) {
    setState("busy");
    try {
      const r = await fetch("/api/connect/token", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: q.app, return: q.ret, state: q.st }),
      });
      const d = (await r.json()) as { redirect?: string };
      if (r.ok && d.redirect && APPS[q.app] && d.redirect.startsWith(q.ret + "?")) {
        remember(q.app, who);
        location.replace(d.redirect);
      }
      else setState("fail");
    } catch {
      setState("fail");
    }
  }

  return (
    <main className="connect-page" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <div className="connect-card">
        <Monogram className="connect-mono" flat />
        {state === "wait" && <p className="connect-muted">{t.wait}</p>}
        {state === "bad" && <p>{t.bad}</p>}
        {state === "login" && (
          <>
            <p>{t.login}</p>
            <button type="button" className="connect-primary" onClick={goLogin}>{t.loginBtn}</button>
          </>
        )}
        {(state === "ask" || state === "busy" || state === "fail") && app && (
          <>
            <h1>{t.ask.replace("{app}", app.title)}</h1>
            <p className="connect-nick">{nick}</p>
            <p className="connect-muted">{t.only}</p>
            {state === "fail" && <p className="connect-error">{t.fail}</p>}
            <button type="button" className="connect-primary" disabled={state === "busy"} onClick={() => void allow()}>{t.allow}</button>
            <a className="connect-secondary" href={app.home}>{t.cancel}</a>
          </>
        )}
      </div>
    </main>
  );
}
