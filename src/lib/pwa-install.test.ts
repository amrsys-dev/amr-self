import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTALL_LABEL, browserInstallUrl, installUrl, isStandalone, openSiteForInstall, takeInstallFlag } from "./pwa-install.ts";

test("installUrl adds ?install=1 and keeps other query params", () => {
  assert.equal(installUrl("https://bazar.amrsys.net/"), "https://bazar.amrsys.net/?install=1");
  assert.equal(installUrl("https://bazar.amrsys.net"), "https://bazar.amrsys.net/?install=1");
  assert.equal(installUrl("https://self.amrsys.net/?lang=ar"), "https://self.amrsys.net/?lang=ar&install=1");
  assert.equal(installUrl("/me"), "/me?install=1");
  assert.equal(installUrl(""), "?install=1");
});

test("takeInstallFlag reads and strips install=1", () => {
  assert.deepEqual(takeInstallFlag("?install=1"), { install: true, nextSearch: "" });
  assert.deepEqual(takeInstallFlag("?city=mecca&install=1"), { install: true, nextSearch: "?city=mecca" });
  assert.deepEqual(takeInstallFlag("?source=pwa"), { install: false, nextSearch: "?source=pwa" });
  assert.deepEqual(takeInstallFlag(""), { install: false, nextSearch: "" });
});

test("isStandalone follows display-mode and iOS navigator.standalone", () => {
  const mm = (q: string) => ({ matches: q.includes("standalone") }) as MediaQueryList;
  const win = { matchMedia: mm, navigator: {} } as unknown as Window;
  assert.equal(isStandalone(win), true);
  const ios = { matchMedia: () => ({ matches: false }), navigator: { standalone: true } } as unknown as Window;
  assert.equal(isStandalone(ios), true);
  const browser = { matchMedia: () => ({ matches: false }), navigator: {} } as unknown as Window;
  assert.equal(isStandalone(browser), false);
});

test("install labels are short everyday words in all five languages", () => {
  assert.equal(INSTALL_LABEL.ru, "Установить");
  assert.equal(INSTALL_LABEL.ar, "تثبيت");
  assert.equal(INSTALL_LABEL.uz, "O‘rnatish");
  assert.equal(INSTALL_LABEL.tj, "Насб кардан");
  assert.equal(INSTALL_LABEL.en, "Install");
});

test("browserInstallUrl keeps only origin, pathname and install=1 — no hash, no other query", () => {
  const dirty = {
    origin: "https://self.amrsys.net",
    pathname: "/",
    href: "https://self.amrsys.net/?tgWebAppData=secret&city=mecca#tgWebAppData=also",
    search: "?tgWebAppData=secret&city=mecca",
    hash: "#tgWebAppData=also",
  };
  const url = browserInstallUrl(dirty);
  assert.equal(url, "https://self.amrsys.net/?install=1");
  const parsed = new URL(url);
  assert.equal(parsed.hash, "");
  assert.deepEqual([...parsed.searchParams.keys()], ["install"]);
  assert.equal(parsed.searchParams.get("install"), "1");
  assert.equal(url.includes("tgWebAppData"), false);
  assert.equal(url.includes("secret"), false);
  assert.equal(
    browserInstallUrl({ origin: "https://safar.amrsys.net", pathname: "/app" }),
    "https://safar.amrsys.net/app?install=1",
  );
});

test("openSiteForInstall uses openLink with a clean URL and does not call addToHomeScreen", () => {
  const calls: string[] = [];
  const href = openSiteForInstall(
    { origin: "https://safar.amrsys.net", pathname: "/" },
    { openLink: (url: string) => calls.push(url) },
    (url) => calls.push("WINDOW:" + url),
  );
  assert.equal(href, "https://safar.amrsys.net/?install=1");
  assert.deepEqual(calls, ["https://safar.amrsys.net/?install=1"]);
  const parsed = new URL(href);
  assert.equal(parsed.hash, "");
  assert.deepEqual([...parsed.searchParams.keys()], ["install"]);
});

test("?install=1 only reveals the Install button — no openLink, prompt, or addToHomeScreen without a tap", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../components/app/install-button.tsx", import.meta.url), "utf8");
  const effects = [...src.matchAll(/useEffect\(([\s\S]*?)\n  \},/g)].map((m) => m[0]).filter((e) => e.includes("takeInstallFlag"));
  assert.ok(effects.length, "expected a takeInstallFlag effect");
  for (const effect of effects) {
    assert.doesNotMatch(effect, /openSiteForInstall\s*\(/);
    assert.doesNotMatch(effect, /addToHomeScreen\s*\(/);
    assert.doesNotMatch(effect, /openLink\s*\(/);
    assert.doesNotMatch(effect, /\.prompt\s*\(/);
  }
});

test("Install is not in the SELF header", async () => {
  const { readFileSync } = await import("node:fs");
  for (const rel of ["../components/app/shell-screens.tsx", "../components/app/auth-screens.tsx"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.doesNotMatch(src, /Header[^>]*tool=\{<InstallButton/);
    assert.doesNotMatch(src, /tool=\{<InstallButton/);
  }
});
