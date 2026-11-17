import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBackup, parseBackup } from "../data/backup.ts";
import { readFileSync } from "node:fs";
import { compressAndEncrypt, decryptAndDecompress, generateDataKey } from "../crypto.ts";
import { keepDeviceOnlyHealth, mergeRemoteConflict, mergeUserData } from "../data/merge.ts";
import { emptyUserData, type HealthEntry, type UserData } from "../data/schema.ts";
import {
  HealthConsentRequired,
  addHealthEntry,
  discardHealthWithoutConsent,
  hasLiveHealthEntries,
  needsHealthCleanup,
  stripHealthWithoutConsent,
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

/** A file from before consent existed: health entries, no flag. */
function legacyFile(): UserData {
  const d = emptyUserData();
  d.health!.water.push(water("old-w"));
  d.health!.weight.push(weight("old-kg"));
  d.health!.nutrition.push({ id: "old-m", updatedAt: "2026-11-10T08:00:00.000Z", kind: "meal", calories: 700, amount: 700, unit: "kcal", note: "plov" });
  d.health!.workouts.push({ id: "gone", updatedAt: "2026-11-11T08:00:00.000Z", deleted: true });
  d.finance.income.push({ id: "inc", updatedAt: "2026-11-10T08:00:00.000Z", amount: 100 });
  return d;
}
const liveHealth = (d: UserData) => Object.values(d.health!).flat().filter((r) => !r.deleted);

describe("old health entries without consent", () => {
  it("are detected so the app can ask on first open", () => {
    assert.equal(hasLiveHealthEntries(legacyFile()), true);
    assert.equal(hasLiveHealthEntries(emptyUserData()), false);
  });

  it("«Удалить старые записи» clears them without giving consent", () => {
    const out = discardHealthWithoutConsent(legacyFile(), new Date("2026-11-17T12:00:00Z"));
    assert.equal(hasLiveHealthEntries(out), false);
    assert.equal(out.healthConsent, undefined);
    assert.equal(JSON.stringify(out.health).includes("plov"), false);
    assert.equal(out.finance.income.length, 1);
    assert.throws(() => addHealthEntry(out, "water", water("w")), HealthConsentRequired);
  });

  it("never go into the server payload, only bare deletion markers do", async () => {
    const upload = stripHealthWithoutConsent(legacyFile());
    assert.deepEqual(liveHealth(upload), []);
    assert.deepEqual(upload.health!.workouts, [{ id: "gone", updatedAt: "2026-11-11T08:00:00.000Z", deleted: true }]);
    assert.equal(upload.finance.income.length, 1, "other sections still sync");
    // The encrypted blob that is sent really has no health content.
    const key = await generateDataKey();
    const aad = { accountId: "acc", version: 2 };
    const back = await decryptAndDecompress(key, await compressAndEncrypt(key, upload, aad), aad) as UserData;
    assert.equal(JSON.stringify(back).includes("plov"), false);
    assert.deepEqual(liveHealth(back), []);
  });

  it("go to the server unchanged once consent is given", () => {
    const granted = grantHealthConsent(legacyFile(), new Date("2026-11-17T12:00:00Z"));
    assert.equal(stripHealthWithoutConsent(granted), granted);
  });

  it("an old server copy with health entries is flagged for a stripped re-upload", () => {
    assert.equal(needsHealthCleanup(legacyFile()), true);
    assert.equal(needsHealthCleanup(stripHealthWithoutConsent(legacyFile())), false);
    assert.equal(needsHealthCleanup(grantHealthConsent(legacyFile())), false);
  });

  it("sync uploads only the stripped payload and re-uploads old server copies", () => {
    const src = readFileSync(new URL("../data/sync.ts", import.meta.url), "utf8");
    assert.match(src, /if \(needsHealthCleanup\(remote, data\)\) \{[\s\S]*?dirty: true/);
    assert.match(src, /const upload = stripHealthWithoutConsent\(data\);\s*const encBlob = await compressAndEncrypt\(dataKey, upload,/);
  });

  it("stay on this device after a pull, but a withdrawal elsewhere still clears them", () => {
    const local = legacyFile();
    const remote = stripHealthWithoutConsent(local);
    remote.finance.income.push({ id: "inc2", updatedAt: "2026-11-17T09:00:00.000Z", amount: 5 });
    const pulled = keepDeviceOnlyHealth(remote, local);
    assert.equal(pulled.finance.income.length, 2, "remote wins for other sections");
    assert.equal(liveHealth(pulled).length, 3);
    assert.equal(pulled.healthConsent, undefined);

    const withdrawnRemote = { ...remote, healthConsent: { granted: false, at: "2026-11-17T10:00:00.000Z" } };
    assert.deepEqual(liveHealth(keepDeviceOnlyHealth(withdrawnRemote, local)), []);

    const grantedRemote = grantHealthConsent(remote, new Date("2026-11-17T10:00:00Z"));
    assert.equal(keepDeviceOnlyHealth(grantedRemote, local), grantedRemote);
  });
});

describe("restoring a backup", () => {
  it("brings no health entries back without consent", () => {
    const r = parseBackup(buildBackup(legacyFile()));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(liveHealth(r.data), []);
      assert.equal(JSON.stringify(r.data).includes("plov"), false);
      assert.equal(r.data.finance.income.length, 1);
    }
  });

  it("brings no health entries back from a file where consent was withdrawn", () => {
    const d = legacyFile();
    d.healthConsent = { granted: false, at: "2026-11-16T00:00:00.000Z" };
    const r = parseBackup(buildBackup(d));
    assert.equal(r.ok && liveHealth(r.data).length, 0);
  });

  it("keeps health entries when the backup has consent", () => {
    const d = grantHealthConsent(legacyFile(), new Date("2026-11-17T08:00:00Z"));
    const r = parseBackup(buildBackup(d));
    assert.equal(r.ok && liveHealth(r.data).length, 3);
  });

  it("the restore path applies the same guard before writing", () => {
    const src = readFileSync(new URL("../../components/app/use-id-app.ts", import.meta.url), "utf8");
    assert.match(src, /const restored = stripHealthWithoutConsent\(parsed\.data\);/);
    assert.match(src, /saveLocalData\(key, accountIdOf\(session\), restored\)/);
    assert.match(src, /saveGuestData\(restored\)/);
    assert.doesNotMatch(src, /saveLocalData\([^)]*parsed\.data\)/);
  });
});

describe("server copy without consent never brings health to a device", () => {
  const ids = (d: UserData) => liveHealth(d).map((r) => r.id).sort();

  it("pull to an empty (new) device takes no health entries from the server", () => {
    const remote = legacyFile(); // old server copy: live health, no consent
    const out = keepDeviceOnlyHealth(remote, null);
    assert.deepEqual(ids(out), []);
    assert.equal(JSON.stringify(out.health).includes("plov"), false);
    assert.deepEqual(out.health!.workouts, [{ id: "gone", updatedAt: "2026-11-11T08:00:00.000Z", deleted: true }]);
    assert.equal(out.finance.income.length, 1, "the rest of the file still syncs");
    assert.equal(needsHealthCleanup(remote, out), true, "server copy gets replaced by a stripped one");
  });

  it("pull with local data keeps only this device's own entries, and server deletions still apply", () => {
    const local = emptyUserData();
    local.health!.water.push(water("mine"), water("deleted-elsewhere", "2026-11-17T08:00:00.000Z"));
    const remote = legacyFile();
    remote.health!.water.push({ id: "deleted-elsewhere", updatedAt: "2026-11-17T09:00:00.000Z", deleted: true });
    const out = keepDeviceOnlyHealth(remote, local);
    assert.deepEqual(ids(out), ["mine"]);
    assert.equal(out.healthConsent, undefined);
  });

  it("server withdrawal is taken and clears this device", () => {
    const local = emptyUserData();
    local.health!.water.push(water("mine"));
    const remote = { ...legacyFile(), healthConsent: { granted: false, at: "2026-11-17T10:00:00.000Z" } };
    const out = keepDeviceOnlyHealth(remote, local);
    assert.deepEqual(ids(out), []);
    assert.deepEqual(out.healthConsent, remote.healthConsent);
  });

  it("server consent (newer) applies normally, with its health", () => {
    const remote = grantHealthConsent(legacyFile(), new Date("2026-11-17T10:00:00Z"));
    const out = keepDeviceOnlyHealth(remote, emptyUserData());
    assert.equal(out, remote);
    assert.deepEqual(ids(out), ["old-kg", "old-m", "old-w"]);
  });

  it("a newer local withdrawal beats an older server consent", () => {
    const remote = grantHealthConsent(legacyFile(), new Date("2026-11-17T08:00:00Z"));
    const local = withdrawHealthConsent(remote, new Date("2026-11-17T09:00:00Z"));
    const out = keepDeviceOnlyHealth(remote, local);
    assert.deepEqual(ids(out), []);
    assert.equal(out.healthConsent!.granted, false);
  });

  it("409 conflict merge takes no health from the server, and the upload has none", () => {
    const local = emptyUserData();
    local.health!.weight.push(weight("mine"));
    local.finance.expense.push({ id: "exp", updatedAt: "2026-11-17T08:00:00.000Z", amount: 3 });
    const remote = legacyFile();
    const merged = mergeRemoteConflict(local, remote);
    assert.deepEqual(ids(merged), ["mine"], "local copy keeps only its own entries");
    assert.equal(merged.finance.income.length, 1);
    assert.equal(merged.finance.expense.length, 1);
    assert.deepEqual(liveHealth(stripHealthWithoutConsent(merged)), [], "server gets the stripped file");
  });

  it("409 conflict with server consent merges health normally", () => {
    const local = emptyUserData();
    local.health!.weight.push(weight("mine"));
    const remote = grantHealthConsent(legacyFile(), new Date("2026-11-17T10:00:00Z"));
    const merged = mergeRemoteConflict(local, remote);
    assert.deepEqual(ids(merged), ["mine", "old-kg", "old-m", "old-w"]);
    assert.equal(merged.healthConsent!.granted, true);
  });

  it("sync uses the health-safe merge on 409", () => {
    const src = readFileSync(new URL("../data/sync.ts", import.meta.url), "utf8");
    assert.match(src, /data = mergeRemoteConflict\(data, remote\);/);
    assert.doesNotMatch(src, /mergeUserData\(/);
    assert.match(src, /needsHealthCleanup\(remote, data\)/);
  });
});
