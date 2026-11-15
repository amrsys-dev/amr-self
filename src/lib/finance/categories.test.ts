import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { billState, expenseByCategory, normalizeCategory } from "./categories.ts";

describe("monthly bills", () => {
  const rent = { dayOfMonth: 25, paidMonths: [] as string[] };

  it("is due later in the month", () => {
    assert.deepEqual(billState(rent, "2026-11-15"), { dueDate: "2026-11-25", paid: false, daysLeft: 10, status: "later" });
  });
  it("is 'soon' within 5 days and overdue after the day", () => {
    assert.equal(billState(rent, "2026-11-21").status, "soon");
    assert.equal(billState(rent, "2026-11-27").status, "overdue");
  });
  it("is paid once this month is marked, and due again next month", () => {
    const paid = { ...rent, paidMonths: ["2026-11"] };
    assert.equal(billState(paid, "2026-11-27").status, "paid");
    assert.equal(billState(paid, "2026-12-01").status, "later");
  });
  it("moves day 31 to the last day of a short month", () => {
    assert.equal(billState({ dayOfMonth: 31, paidMonths: [] }, "2027-02-10").dueDate, "2027-02-28");
  });
});

describe("spending by category", () => {
  it("sums one month, skips deleted rows, maps old category names", () => {
    const rows = [
      { id: "1", updatedAt: "x", amount: 120, category: "telecom", date: "2026-11-02" },
      { id: "2", updatedAt: "x", amount: 260, category: "transport", date: "2026-11-03" },
      { id: "3", updatedAt: "x", amount: 40, category: "fuel", date: "2026-11-09" },
      { id: "4", updatedAt: "x", amount: 999, category: "fuel", date: "2026-10-30" },
      { id: "5", updatedAt: "x", amount: 50, category: "food", date: "2026-11-04", deleted: true },
    ];
    assert.deepEqual(expenseByCategory(rows, "2026-11"), [
      { category: "fuel", amount: 300 },
      { category: "telecom", amount: 120 },
    ]);
  });
  it("treats a missing category as 'other'", () => {
    assert.equal(normalizeCategory(undefined), "other");
  });
});
