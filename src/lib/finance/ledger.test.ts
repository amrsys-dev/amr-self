import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceSeries } from "./ledger.ts";

const r = (date: string, amount: number) => ({ id: date + amount, updatedAt: date, title: "", amount, date });

test("balanceSeries: переносит остаток прошлых месяцев и копит по дням", () => {
  const inc = [r("2026-10-20", 1000), r("2026-11-02", 500)];
  const exp = [r("2026-11-03", 200), r("2026-11-03", 100)];
  const s = balanceSeries(inc, exp, "2026-11", "2026-11-04");
  assert.deepEqual(s, [1000, 1500, 1200, 1200]);
});

test("balanceSeries: прошлый месяц - все дни", () => {
  assert.equal(balanceSeries([], [], "2026-02").length, 28);
});

test("balanceSeries: удалённые записи не считаются", () => {
  const inc = [{ ...r("2026-11-01", 50), deleted: true }];
  assert.deepEqual(balanceSeries(inc, [], "2026-11", "2026-11-01"), [0]);
});
