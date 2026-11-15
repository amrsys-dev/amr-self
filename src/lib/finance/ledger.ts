/**
 * Running balance and day-grouped history, the way money trackers show it:
 * one balance that carries over month to month, money in / money out for the
 * chosen month, and transactions grouped by day with a day total.
 */
import type { FinanceRecord } from "../data/schema.ts";

const amountOf = (r: FinanceRecord) => (Number.isFinite(r.amount) ? Number(r.amount) : 0);
const live = (rows: readonly FinanceRecord[]) => rows.filter((r) => !r.deleted);

/** Everything received minus everything spent, all time. Carries over between months. */
export function totalBalance(income: readonly FinanceRecord[], expense: readonly FinanceRecord[], upTo?: string): number {
  const keep = (r: FinanceRecord) => !upTo || (r.date ?? "") <= upTo;
  const inSum = live(income).filter(keep).reduce((n, r) => n + amountOf(r), 0);
  const outSum = live(expense).filter(keep).reduce((n, r) => n + amountOf(r), 0);
  return round2(inSum - outSum);
}

/** Money in and out for one month ("YYYY-MM"). */
export function monthFlow(income: readonly FinanceRecord[], expense: readonly FinanceRecord[], month: string): { in: number; out: number; net: number } {
  const inMonth = (r: FinanceRecord) => (r.date ?? "").startsWith(month);
  const i = live(income).filter(inMonth).reduce((n, r) => n + amountOf(r), 0);
  const o = live(expense).filter(inMonth).reduce((n, r) => n + amountOf(r), 0);
  return { in: round2(i), out: round2(o), net: round2(i - o) };
}

/** "2026-11" shifted by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type Entry = FinanceRecord & { kind: "income" | "expense" };
export type DayGroup = { date: string; net: number; entries: Entry[] };

/** Newest day first; inside a day, newest entry first. */
export function groupByDay(entries: readonly Entry[]): DayGroup[] {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.deleted) continue;
    const d = e.date ?? "";
    (map.get(d) ?? map.set(d, []).get(d)!).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      entries: list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      net: round2(list.reduce((n, e) => n + (e.kind === "income" ? amountOf(e) : -amountOf(e)), 0)),
    }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
