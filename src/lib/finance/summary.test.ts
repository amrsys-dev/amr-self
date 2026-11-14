import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoney, toMinor, type ExpenseEntry, type IncomeEntry, type PlannedExpense, type PlannedIncome } from "./model.ts";
import { byCategory, monthOf, monthWeeks, planProgress, summarize, type FinanceData } from "./summary.ts";

const T = "2026-11-01T00:00:00.000Z";
const NOV = monthOf("2026-11-14");

function plan(over: Partial<PlannedIncome> = {}): PlannedIncome {
  return { id: "job", updatedAt: T, title: "Сборка кухни", category: "gig", total: 100000, dueDate: "2026-11-20", workDone: false, closed: false, ...over };
}
function pay(id: string, amount: number, date: string, over: Partial<IncomeEntry> = {}): IncomeEntry {
  return { id, updatedAt: T, date, amount, category: "gig", kind: "regular", ...over };
}
function spend(id: string, amount: number, date: string, over: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return { id, updatedAt: T, date, amount, category: "food", ...over };
}
function data(over: Partial<FinanceData> = {}): FinanceData {
  return { plannedIncome: [], income: [], plannedExpense: [], expense: [], ...over };
}

describe("side job: 1 000 SAR agreed, 300 advance", () => {
  const advance = pay("a1", 30000, "2026-11-10", { plannedId: "job", kind: "advance" });

  it("counts only the advance as received; 700 is expected, not balance", () => {
    const s = summarize(data({ plannedIncome: [plan()], income: [advance] }), NOV);
    assert.equal(s.received, 30000);
    assert.equal(s.balance, 30000);
    assert.equal(s.expected, 70000);
  });

  it("after the final 700 nothing is expected and nothing is counted twice", () => {
    const final = pay("f1", 70000, "2026-11-20", { plannedId: "job", kind: "final" });
    const s = summarize(data({ plannedIncome: [plan({ workDone: true })], income: [advance, final] }), NOV);
    assert.equal(s.received, 100000);
    assert.equal(s.expected, 0);
  });

  it("a closed job expects nothing more even if it paid less", () => {
    const s = summarize(data({ plannedIncome: [plan({ closed: true })], income: [advance] }), NOV);
    assert.equal(s.expected, 0);
    assert.equal(s.received, 30000);
  });

  it("paying more than agreed never makes 'remaining' negative", () => {
    const p = planProgress(plan(), [pay("x", 120000, "2026-11-12", { plannedId: "job" })]);
    assert.deepEqual(p, { received: 120000, remaining: 0, expected: 0 });
  });

  it("a deleted payment no longer counts", () => {
    const s = summarize(data({ plannedIncome: [plan()], income: [{ ...advance, deleted: true }] }), NOV);
    assert.equal(s.received, 0);
    assert.equal(s.expected, 100000);
  });
});

describe("expenses", () => {
  it("a planned expense is not spent until paid", () => {
    const bill: PlannedExpense = { id: "b1", updatedAt: T, title: "Связь", category: "telecom", amount: 12000, dueDate: "2026-11-14" };
    const s1 = summarize(data({ plannedExpense: [bill] }), NOV);
    assert.equal(s1.spent, 0);
    assert.equal(s1.plannedSpend, 12000);

    const paid = spend("e1", 12000, "2026-11-14", { category: "telecom", plannedId: "b1" });
    const s2 = summarize(data({ plannedExpense: [{ ...bill, paidEntryId: "e1" }], expense: [paid] }), NOV);
    assert.equal(s2.spent, 12000);
    assert.equal(s2.plannedSpend, 0);
  });

  it("only the period's rows count", () => {
    const s = summarize(data({ expense: [spend("o", 5000, "2026-10-31"), spend("n", 4200, "2026-11-01")] }), NOV);
    assert.equal(s.spent, 4200);
  });

  it("groups by category, largest first", () => {
    const rows = [spend("1", 4200, "2026-11-02"), spend("2", 26000, "2026-11-03", { category: "transport" }), spend("3", 1000, "2026-11-04")];
    assert.deepEqual(byCategory(rows, NOV), [
      { category: "transport", amount: 26000 },
      { category: "food", amount: 5200 },
    ]);
  });
});

describe("month weeks", () => {
  it("splits November into 1–7, 8–14, 15–21, 22–30", () => {
    const w = monthWeeks(data({ income: [pay("1", 100, "2026-11-08")], expense: [spend("2", 50, "2026-11-30")] }), NOV);
    assert.deepEqual(w.map((b) => [b.from, b.to]), [
      ["2026-11-01", "2026-11-07"],
      ["2026-11-08", "2026-11-14"],
      ["2026-11-15", "2026-11-21"],
      ["2026-11-22", "2026-11-30"],
    ]);
    assert.equal(w[1]!.received, 100);
    assert.equal(w[3]!.spent, 50);
  });

  it("knows February in a leap year", () => {
    assert.deepEqual(monthOf("2028-02-10"), { from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("money input and display", () => {
  it("parses what people type", () => {
    assert.equal(toMinor("1 000"), 100000);
    assert.equal(toMinor("12,5"), 1250);
    assert.equal(toMinor("12.50"), 1250);
    assert.equal(toMinor("0"), 0);
  });

  it("rejects nonsense and negatives", () => {
    assert.equal(toMinor(""), null);
    assert.equal(toMinor("-5"), null);
    assert.equal(toMinor("1.234"), null);
    assert.equal(toMinor("abc"), null);
  });

  it("formats with grouped thousands and no needless decimals", () => {
    assert.equal(formatMoney(100000), "1 000");
    assert.equal(formatMoney(1250), "12.50");
    assert.equal(formatMoney(-12000), "−120");
  });
});
