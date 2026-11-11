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
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "AMR ID" },
      { name: "description", content: "AMR ID" },
      { name: "theme-color", content: "#0B0E11" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "AMR ID" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/amr-mono.png" },
      { rel: "apple-touch-icon", href: "/amr-mono.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
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
  }, []);
  return null;
}
