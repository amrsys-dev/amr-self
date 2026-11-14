/**
 * Finance categories and monthly bills (rent, electricity, internet...).
 * No banks or cards: the user types every amount.
 */
import type { DataRecord, FinanceRecord } from "../data/schema.ts";

export const EXPENSE_CATEGORIES = ["food", "fuel", "car", "housing", "utilities", "telecom", "health", "sport", "shopping", "family", "transfer", "other"] as const;
export const INCOME_CATEGORIES = ["salary", "freelance", "advance", "bonus", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/** Older records used these keys; keep them readable. */
export const LEGACY_CATEGORY: Record<string, ExpenseCategory> = { transport: "fuel", workTools: "other" };

export function normalizeCategory(c: string | undefined): string {
  if (!c) return "other";
  return LEGACY_CATEGORY[c] ?? c;
}

/** A payment that comes every month: rent, electricity, phone. */
export type BillRecord = DataRecord & {
  title: string;
  category: ExpenseCategory;
  amount: number;
  /** 1..31; clamped to the month's last day. */
  dayOfMonth: number;
  /** "YYYY-MM" months already paid. */
  paidMonths: string[];
};

export type BillState = { dueDate: string; paid: boolean; daysLeft: number; status: "paid" | "overdue" | "soon" | "later" };

function lastDayOf(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Where a bill stands in the month of `today` (YYYY-MM-DD). "Soon" = due within 5 days. */
export function billState(bill: Pick<BillRecord, "dayOfMonth" | "paidMonths">, today: string): BillState {
  const month = today.slice(0, 7);
  const day = Math.min(Math.max(1, bill.dayOfMonth), lastDayOf(month));
  const dueDate = `${month}-${String(day).padStart(2, "0")}`;
  const paid = bill.paidMonths.includes(month);
  const daysLeft = Math.round((Date.parse(dueDate) - Date.parse(today)) / 86_400_000);
  const status = paid ? "paid" : daysLeft < 0 ? "overdue" : daysLeft <= 5 ? "soon" : "later";
  return { dueDate, paid, daysLeft, status };
}

/** Spending per category for one month ("YYYY-MM"), largest first. */
export function expenseByCategory(expense: readonly FinanceRecord[], month: string): { category: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const r of expense) {
    if (r.deleted || !(r.date ?? "").startsWith(month)) continue;
    const amount = Number.isFinite(r.amount) ? Number(r.amount) : 0;
    const c = normalizeCategory(r.category);
    totals.set(c, (totals.get(c) ?? 0) + amount);
  }
  return [...totals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
