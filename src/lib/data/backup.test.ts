import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKUP_FORMAT, backupFileName, buildBackup, parseBackup } from "./backup.ts";
import { emptyUserData } from "./schema.ts";

describe("backup file", () => {
  it("round-trips user data", () => {
    const data = emptyUserData();
    data.finance.income.push({ id: "a1", updatedAt: "2026-11-14T10:00:00.000Z" });
    const r = parseBackup(buildBackup(data, new Date("2026-11-14T10:00:00Z")));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.data, data);
      assert.equal(r.createdAt, "2026-11-14T10:00:00.000Z");
    }
  });

  it("names the file by date", () => {
    assert.equal(backupFileName(new Date("2026-11-14T23:00:00Z")), "amr-self-2026-11-14.json");
  });

  it("rejects text that is not JSON", () => {
    assert.deepEqual(parseBackup("hello"), { ok: false, reason: "not_json" });
  });

  it("rejects other JSON files", () => {
    assert.deepEqual(parseBackup(JSON.stringify({ a: 1 })), { ok: false, reason: "wrong_format" });
  });

  it("rejects a backup from a newer app version", () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, v: 99, createdAt: "", data: emptyUserData() });
    assert.deepEqual(parseBackup(text), { ok: false, reason: "newer_version" });
  });

  it("fills sections missing from an older backup", () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, v: 1, createdAt: "x", data: { finance: { income: [] } } });
    const r = parseBackup(text);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.data.visa, { entries: [] });
      assert.deepEqual(r.data.finance.expense, []);
    }
  });
});
