import { useEffect, useRef, useState } from "react";
import type { MsgKey } from "@/lib/i18n.ts";
import {
  browserInstallUrl,
  isIos,
  isStandalone,
  isTelegramWebView,
  takeInstallFlag,
  telegramWebApp,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-install.ts";

export function InstallButton({ t, className = "tool txt" }: { t: (k: MsgKey) => string; className?: string }) {
  const [hidden, setHidden] = useState(true);
  const [hint, setHint] = useState<"ios" | "tg" | "none">("none");
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true);
      return;
    }
    setHidden(false);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      promptRef.current = null;
      setHidden(true);
      setHint("none");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const flag = takeInstallFlag(window.location.search);
    if (flag.install) {
      const url = `${window.location.pathname}${flag.nextSearch}${window.location.hash}`;
      window.history.replaceState(null, "", url);
      if (isTelegramWebView()) setHint("tg");
      else if (isIos() || !promptRef.current) setHint(isIos() ? "ios" : "none");
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  const onClick = async () => {
    const pending = promptRef.current;
    if (pending) {
      setHint("none");
      await pending.prompt();
      const choice = await pending.userChoice;
      promptRef.current = null;
      if (choice.outcome === "accepted") setHidden(true);
      return;
    }
    const tg = telegramWebApp();
    if (isTelegramWebView()) {
      if (typeof tg?.addToHomeScreen === "function") {
        try {
          tg.addToHomeScreen();
          return;
        } catch {
          /* older clients */
        }
      }
      setHint("tg");
      return;
    }
    setHint("ios");
  };

  const openBrowser = () => {
    const tg = telegramWebApp();
    const href = browserInstallUrl();
    if (tg?.openLink) tg.openLink(href);
    else window.open(href, "_blank", "noopener");
    setHint("none");
  };

  return (
    <div className="pwa-install">
      <button type="button" className={className} onClick={() => void onClick()}>
        {t("install")}
      </button>
      {hint === "ios" ? (
        <div className="pwa-hint" role="status">
          {t("install_ios")}
        </div>
      ) : null}
      {hint === "tg" ? (
        <div className="pwa-hint" role="status">
          <button type="button" className="btn sm g" onClick={openBrowser}>
            {t("install_browser")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
