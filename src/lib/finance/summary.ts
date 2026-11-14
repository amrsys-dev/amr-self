/**
 * Balance rules (the core promise of the Finance screen):
 *   - balance  = money received − money spent, in the period;
 *   - expected = what open planned incomes still owe; never part of balance;
 *   - an advance is received money; the rest of that job is expected;
 *   - a planned expense is not spent until it is marked paid.
 * So nothing is ever counted twice.
 */
import { live } from "../data/merge.ts";
import type { ExpenseCategory, ExpenseEntry, IncomeEntry, Money, PlannedExpense, PlannedIncome } from "./model.ts";

export type Period = { from: string; to: string };

export type FinanceData = {
  plannedIncome: PlannedIncome[];
  income: IncomeEntry[];
  plannedExpense: PlannedExpense[];
  expense: ExpenseEntry[];
};

export function inPeriod(date: string, p: Period): boolean {
  return date >= p.from && date <= p.to;
}

/** Calendar month that contains `day` (YYYY-MM-DD). */
export function monthOf(day: string): Period {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function sum(rows: readonly { amount: Money }[]): Money {
  return rows.reduce((t, r) => t + r.amount, 0);
}

export type PlanProgress = { received: Money; remaining: Money; expected: Money };

/** How much of a planned income has come in, and what is still expected. */
export function planProgress(plan: PlannedIncome, income: readonly IncomeEntry[]): PlanProgress {
  const received = sum(live(income).filter((e) => e.plannedId === plan.id));
  const remaining = Math.max(0, plan.total - received);
  return { received, remaining, expected: plan.closed || plan.deleted ? 0 : remaining };
}

export type Summary = {
  received: Money;
  spent: Money;
  balance: Money;
  /** Still owed by open planned incomes, across all dates. */
  expected: Money;
  /** Unpaid planned expenses due in the period. */
  plannedSpend: Money;
};

export function summarize(d: FinanceData, p: Period): Summary {
  const received = sum(live(d.income).filter((e) => inPeriod(e.date, p)));
  const spent = sum(live(d.expense).filter((e) => inPeriod(e.date, p)));
  const expected = live(d.plannedIncome).reduce((t, plan) => t + planProgress(plan, d.income).expected, 0);
  const plannedSpend = sum(live(d.plannedExpense).filter((x) => !x.paidEntryId && inPeriod(x.dueDate, p)));
  return { received, spent, balance: received - spent, expected, plannedSpend };
}

/** Spending per category in the period, largest first. */
export function byCategory(expense: readonly ExpenseEntry[], p: Period): { category: ExpenseCategory; amount: Money }[] {
  const totals = new Map<ExpenseCategory, Money>();
  for (const e of live(expense)) {
    if (!inPeriod(e.date, p)) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  }
  return [...totals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

export type WeekBucket = { from: string; to: string; received: Money; spent: Money };

/** The month split into 1–7, 8–14, 15–21, 22–end, as on the Finance chart. */
export function monthWeeks(d: FinanceData, month: Period): WeekBucket[] {
  const prefix = month.from.slice(0, 8);
  const lastDay = Number(month.to.slice(8));
  const ranges: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, lastDay]];
  return ranges.map(([a, b]) => {
    const p = { from: prefix + String(a).padStart(2, "0"), to: prefix + String(b).padStart(2, "0") };
    return {
      ...p,
      received: sum(live(d.income).filter((e) => inPeriod(e.date, p))),
      spent: sum(live(d.expense).filter((e) => inPeriod(e.date, p))),
    };
  });
}
