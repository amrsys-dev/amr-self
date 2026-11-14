/**
 * Personal finance records. No banks, cards or payment systems: the user
 * types every number in.
 *
 * Money is an integer number of minor units (halalas for SAR, 1 SAR = 100),
 * so sums never pick up floating-point errors like 0.1 + 0.2.
 */
import type { DataRecord } from "../data/schema.ts";

export type Money = number;

export const INCOME_CATEGORIES = ["salary", "gig", "extra", "other"] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const EXPENSE_CATEGORIES = ["food", "transport", "car", "sport", "supplements", "housing", "telecom", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** How a received payment relates to a planned income. */
export type PaymentKind = "regular" | "advance" | "final";

/**
 * Money promised but not yet (fully) received, e.g. a side job for 1 000 SAR.
 * It never counts as received money. Payments against it are IncomeEntry rows
 * with plannedId = this id.
 */
export type PlannedIncome = DataRecord & {
  title: string;
  category: IncomeCategory;
  total: Money;
  /** YYYY-MM-DD */
  dueDate?: string;
  /** The work itself is done (the user ticked it). */
  workDone: boolean;
  /** Settled: nothing more is expected, even if less than total came in. */
  closed: boolean;
};

/** Money actually received. Only these rows count toward the balance. */
export type IncomeEntry = DataRecord & {
  /** YYYY-MM-DD */
  date: string;
  amount: Money;
  category: IncomeCategory;
  kind: PaymentKind;
  plannedId?: string;
  note?: string;
};

/** A payment the user plans to make. It counts as spent only once paid. */
export type PlannedExpense = DataRecord & {
  title: string;
  category: ExpenseCategory;
  amount: Money;
  /** YYYY-MM-DD */
  dueDate: string;
  /** Id of the ExpenseEntry created when the user marked it paid. */
  paidEntryId?: string;
};

/** Money actually spent. */
export type ExpenseEntry = DataRecord & {
  /** YYYY-MM-DD */
  date: string;
  amount: Money;
  category: ExpenseCategory;
  plannedId?: string;
  note?: string;
};

/** Monthly spending limit for one category. */
export type CategoryLimit = DataRecord & {
  category: ExpenseCategory;
  amount: Money;
};

/** Parse what the user typed ("1 000", "12,50", "12.5") into minor units. */
export function toMinor(input: string): Money | null {
  const cleaned = input.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const value = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** 100000 -> "1 000", 1250 -> "12.50". Thin spaces group thousands. */
export function formatMoney(minor: Money): string {
  const sign = minor < 0 ? "−" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return sign + grouped + (frac ? "." + String(frac).padStart(2, "0") : "");
}
