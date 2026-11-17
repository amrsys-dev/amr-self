import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTALL_LABEL, installUrl, isStandalone, takeInstallFlag } from "./pwa-install.ts";

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
