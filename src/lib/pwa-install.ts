/** One-tap PWA install: Android prompt, iOS hint, Telegram open-in-browser. */
export const INSTALL_LABEL = {
  ru: "Установить",
  ar: "تثبيت",
  uz: "O‘rnatish",
  tj: "Насб кардан",
  en: "Install",
} as const;

export function installUrl(href: string): string {
  const raw = String(href || "").trim();
  if (!raw) return "?install=1";
  try {
    const abs = /^https?:/i.test(raw) || raw.startsWith("//");
    const u = new URL(raw, "https://pwa.invalid");
    u.searchParams.set("install", "1");
    if (abs) return u.toString();
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw + (raw.includes("?") ? "&" : "?") + "install=1";
  }
}

export function takeInstallFlag(search: string): { install: boolean; nextSearch: string } {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const install = p.get("install") === "1" || p.get("install") === "true";
  p.delete("install");
  const s = p.toString();
  return { install, nextSearch: s ? `?${s}` : "" };
}

export function isStandalone(win: Window = globalThis as unknown as Window): boolean {
  if (typeof win === "undefined") return false;
  try {
    if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (win.matchMedia?.("(display-mode: minimal-ui)").matches) return true;
  } catch {
    /* ignore */
  }
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return nav?.standalone === true;
}

export function isIos(win: Window = globalThis as unknown as Window): boolean {
  const nav = win.navigator;
  if (!nav) return false;
  const ua = nav.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export type TgWebApp = {
  initData?: string;
  openLink?: (url: string, opts?: { try_instant_view?: boolean }) => void;
  addToHomeScreen?: () => void;
};

export function telegramWebApp(win: Window = globalThis as unknown as Window): TgWebApp | undefined {
  const tg = (win as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return tg;
}

export function isTelegramWebView(win: Window = globalThis as unknown as Window): boolean {
  const tg = telegramWebApp(win);
  if (tg?.initData) return true;
  const ua = win.navigator?.userAgent || "";
  return /Telegram/i.test(ua);
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function browserInstallUrl(loc?: { origin: string; pathname: string }): string {
  const l = loc ?? (globalThis as unknown as Window).location;
  return `${l.origin}${l.pathname}?install=1`;
}

/** In Telegram, open the site in the external browser so the PWA can be installed there. Never add Telegram query/hash. */
export function openSiteForInstall(
  loc?: { origin: string; pathname: string },
  tg?: { openLink?: (url: string) => void },
  openWindow?: (url: string) => void,
): string {
  const href = browserInstallUrl(loc);
  const wa = tg ?? telegramWebApp();
  if (wa?.openLink) wa.openLink(href);
  else if (openWindow) openWindow(href);
  else if (typeof window !== "undefined") window.open(href, "_blank", "noopener");
  return href;
}
