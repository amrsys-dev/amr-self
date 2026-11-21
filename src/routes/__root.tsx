import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { registerSw } from "@/sw-register.ts";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { title: "AMR ID" },
      { name: "description", content: "AMR ID - цифровая визитка и единый контакт: телефон, мессенджеры, соцсети и сайт в одной постоянной ссылке и одном QR. Один вход во все приложения AMR." },
      { name: "theme-color", content: "#0B0E11" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "AMR ID" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/app-favicon.png" },
      { rel: "apple-touch-icon", href: "/app-touch-icon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/app.webmanifest" },
    ],
    // Chrome may offer installation before React starts: keep that offer so the «Установить» button opens one install dialog.
    scripts: [{ children: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__amrInstall=e});addEventListener('appinstalled',function(){window.__amrInstall=null})" }],
  }),
  component: () => (
    <html lang="ru" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <SwBoot />
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});


function SwBoot() {
  useEffect(() => {
    registerSw();
    // Height of the on-screen keyboard, so bottom sheets and dialogs sit right above it.
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
