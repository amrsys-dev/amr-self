import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBackup, parseBackup } from "../data/backup.ts";
import { mergeUserData } from "../data/merge.ts";
import { emptyUserData, type HealthEntry } from "../data/schema.ts";
import {
  HealthConsentRequired,
  addHealthEntry,
  grantHealthConsent,
  hasHealthConsent,
  mergeHealthConsent,
  withdrawHealthConsent,
} from "./consent.ts";

const water = (id: string, at = "2026-11-17T08:00:00.000Z"): HealthEntry => ({ id, updatedAt: at, kind: "water", title: "Water", date: "2026-11-17", amount: 250, unit: "ml" });
const weight = (id: string, at = "2026-11-17T08:00:00.000Z"): HealthEntry => ({ id, updatedAt: at, kind: "weight", title: "Weight", date: "2026-11-17", amount: 81.5, unit: "kg", note: "morning" });

describe("health consent (PDPL)", () => {
  it("new and older files have no consent", () => {
    assert.equal(hasHealthConsent(emptyUserData()), false);
    assert.equal(emptyUserData().healthConsent, undefined);
  });

  it("refuses to save a health entry before consent", () => {
    const data = emptyUserData();
    assert.throws(() => addHealthEntry(data, "water", water("w1")), HealthConsentRequired);
    assert.deepEqual(data.health!.water, []);
  });

  it("refuses to save after consent was withdrawn", () => {
    const withdrawn = withdrawHealthConsent(grantHealthConsent(emptyUserData(), new Date("2026-11-17T08:00:00Z")), new Date("2026-11-17T09:00:00Z"));
    assert.throws(() => addHealthEntry(withdrawn, "weight", weight("x")), HealthConsentRequired);
  });

  it("saves entries once «Разрешить» is pressed and stores the date", () => {
    const granted = grantHealthConsent(emptyUserData(), new Date("2026-11-17T08:00:00Z"));
    assert.deepEqual(granted.healthConsent, { granted: true, at: "2026-11-17T08:00:00.000Z" });
    const next = addHealthEntry(granted, "water", water("w1"));
    assert.equal(next.health!.water.length, 1);
    assert.equal(next.health!.water[0]!.amount, 250);
  });

  it("withdrawing clears every health entry and the consent", () => {
    let d = grantHealthConsent(emptyUserData(), new Date("2026-11-17T07:00:00Z"));
    d = addHealthEntry(d, "water", water("w1"));
    d = addHealthEntry(d, "weight", weight("kg1"));
    d = addHealthEntry(d, "nutrition", { id: "m1", updatedAt: "2026-11-17T08:00:00.000Z", kind: "meal", calories: 600, amount: 600, unit: "kcal", note: "plov" });
    d = addHealthEntry(d, "workouts", { id: "r1", updatedAt: "2026-11-17T08:00:00.000Z", kind: "workout", amount: 30, unit: "min" });
    d.finance.income.push({ id: "inc", updatedAt: "2026-11-17T08:00:00.000Z", amount: 100 });
    const out = withdrawHealthConsent(d, new Date("2026-11-17T10:00:00Z"));
    assert.equal(hasHealthConsent(out), false);
    assert.deepEqual(out.healthConsent, { granted: false, at: "2026-11-17T10:00:00.000Z" });
    for (const list of Object.values(out.health!)) {
      for (const row of list) assert.deepEqual(Object.keys(row).sort(), ["deleted", "id", "updatedAt"]);
      assert.ok(list.every((r) => r.deleted));
    }
    assert.equal(JSON.stringify(out.health).includes("plov"), false);
    assert.equal(JSON.stringify(out.health).includes("81.5"), false);
    assert.equal(out.finance.income.length, 1, "other sections untouched");
  });

  it("another phone cannot bring health entries back after withdrawal", () => {
    let phoneA = grantHealthConsent(emptyUserData(), new Date("2026-11-17T07:00:00Z"));
    phoneA = addHealthEntry(phoneA, "weight", weight("kg1"));
    const phoneB = structuredClone(phoneA);
    // Phone B still thinks consent is on and adds a late entry.
    const phoneBLate = addHealthEntry(phoneB, "water", water("late", "2026-11-17T11:00:00.000Z"));
    const withdrawnA = withdrawHealthConsent(phoneA, new Date("2026-11-17T10:00:00Z"));
    for (const merged of [mergeUserData(withdrawnA, phoneBLate), mergeUserData(phoneBLate, withdrawnA)]) {
      assert.equal(hasHealthConsent(merged), false);
      const live = Object.values(merged.health!).flat().filter((r) => !r.deleted);
      assert.deepEqual(live, []);
    }
  });

  it("a newer «Разрешить» after withdrawal wins the merge", () => {
    const withdrawn = withdrawHealthConsent(grantHealthConsent(emptyUserData(), new Date("2026-11-17T07:00:00Z")), new Date("2026-11-17T08:00:00Z"));
    const again = grantHealthConsent(withdrawn, new Date("2026-11-17T09:00:00Z"));
    assert.equal(hasHealthConsent(mergeUserData(withdrawn, again)), true);
    assert.equal(mergeHealthConsent({ granted: true, at: "2026-11-17T09:00:00.000Z" }, { granted: false, at: "2026-11-17T09:00:00.000Z" })!.granted, false);
    assert.equal(mergeHealthConsent(undefined, { granted: "yes", at: 1 }), undefined);
  });

  it("the consent flag survives merge with an older file and a backup round-trip", () => {
    const granted = grantHealthConsent(emptyUserData(), new Date("2026-11-17T08:00:00Z"));
    const legacy = emptyUserData();
    delete legacy.health;
    assert.deepEqual(mergeUserData(legacy, granted).healthConsent, { granted: true, at: "2026-11-17T08:00:00.000Z" });
    assert.equal("healthConsent" in mergeUserData(legacy, emptyUserData()), false);
    const r = parseBackup(buildBackup(granted));
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.data.healthConsent, granted.healthConsent);
  });

  it("rejects a backup with a broken consent flag", () => {
    const file = JSON.parse(buildBackup(emptyUserData()));
    file.data.healthConsent = { granted: "yes" };
    const r = parseBackup(JSON.stringify(file));
    assert.equal(r.ok, false);
  });
});
