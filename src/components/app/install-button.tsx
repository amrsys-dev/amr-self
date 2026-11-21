import { useEffect, useRef, useState } from "react";
import type { MsgKey } from "@/lib/i18n.ts";
import {
  isStandalone,
  isTelegramWebView,
  openSiteForInstall,
  takeInstallFlag,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-install.ts";

function usePwaInstall(opts: { consumeFlag: boolean }) {
  const [hidden, setHidden] = useState(true);
  const [wanted, setWanted] = useState(false);
  const [hint, setHint] = useState<"ios" | "android" | "tg" | "none">("none");
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true);
      return;
    }
    setHidden(false);
    const early = (window as unknown as { __amrInstall?: BeforeInstallPromptEvent | null }).__amrInstall;
    if (early) promptRef.current = early;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      promptRef.current = null;
      setHidden(true);
      setWanted(false);
      setHint("none");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (opts.consumeFlag) {
      const flag = takeInstallFlag(window.location.search);
      if (flag.install) {
        // Reveal the big Install button only. Never prompt or openLink without a tap.
        const url = `${window.location.pathname}${flag.nextSearch}${window.location.hash}`;
        window.history.replaceState(null, "", url);
        setWanted(true);
      }
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [opts.consumeFlag]);

  const onClick = async () => {
    if (isTelegramWebView()) {
      openSiteForInstall();
      return;
    }
    const pending = promptRef.current;
    if (pending) {
      setHint("none");
      await pending.prompt();
      const choice = await pending.userChoice;
      promptRef.current = null;
      (window as unknown as { __amrInstall?: unknown }).__amrInstall = null;
      if (choice.outcome === "accepted") {
        setHidden(true);
        setWanted(false);
      }
      return;
    }
    setHint(/android/i.test(navigator.userAgent) ? "android" : "ios");
  };

  return { hidden, wanted, hint, setHint, onClick };
}

/** Profile (and other non-header) install item. In Telegram: openLink to the site. */
export function InstallButton({ t, className = "set-label" }: { t: (k: MsgKey) => string; className?: string }) {
  const { hidden, hint, onClick } = usePwaInstall({ consumeFlag: false });
  if (hidden) return null;
  return (
    <div className="pwa-install">
      <button type="button" className={className} onClick={() => void onClick()}>
        {t("install")}
      </button>
      {hint === "ios" || hint === "android" ? (
        <div className="pwa-hint" role="status">
          {t(hint === "android" ? "install_android" : "install_ios")}
        </div>
      ) : null}
    </div>
  );
}

/** Shown on the website when the page was opened with ?install=1. Needs a user tap. */
export function InstallHero({ t }: { t: (k: MsgKey) => string }) {
  const { hidden, wanted, hint, onClick } = usePwaInstall({ consumeFlag: true });
  if (hidden || !wanted) return null;
  return (
    <div className="pwa-hero" role="region" aria-label={t("install")}>
      <button type="button" className="btn p" onClick={() => void onClick()}>
        {t("install")}
      </button>
      {hint === "ios" || hint === "android" ? (
        <div className="pwa-hint" role="status">
          {t(hint === "android" ? "install_android" : "install_ios")}
        </div>
      ) : null}
    </div>
  );
}
