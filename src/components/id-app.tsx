import { isRtl } from "@/lib/i18n.ts";
import { AuthScreens } from "./app/auth-screens.tsx";
import { CardScreens } from "./app/card-screens.tsx";
import { ContactsScreen } from "./app/contacts-screen.tsx";
import { SubsScreen } from "./app/subs-screen.tsx";
import { ContactSheet } from "./app/contact-sheet.tsx";
import { SecurityScreens } from "./app/security-screens.tsx";
import { ShellScreens } from "./app/shell-screens.tsx";
import { InstallHero } from "./app/install-button.tsx";
import { useIdApp } from "./app/use-id-app.ts";

export function IdApp() {
  const app = useIdApp();
  return (
    <div className={app.cls} dir={isRtl(app.lang) ? "rtl" : "ltr"} lang={app.lang}>
      <InstallHero t={app.t} />
      <AuthScreens app={app} />
      <ShellScreens app={app} />
      <SecurityScreens app={app} />
      <CardScreens app={app} />
      <ContactsScreen app={app} />
      <SubsScreen app={app} />
      <ContactSheet app={app} />
    </div>
  );
}
