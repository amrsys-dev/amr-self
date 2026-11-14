import { emptyUserData, type DataRecord, type SalaryRecord, type UserData } from "./schema.ts";

function isRecord(x: unknown): x is DataRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as DataRecord;
  return typeof r.id === "string" && typeof r.updatedAt === "string";
}

/** How long a deletion marker is kept so other devices can learn about it. */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Per-record merge: same id keeps the row with the later updatedAt.
 *
 * Deleted rows stay as tombstones ({ deleted: true }). Dropping them here would
 * let another device that still holds the old row bring it back on the next
 * sync. Tombstones older than TOMBSTONE_TTL_MS are pruned. Screens show rows
 * through live().
 */
export function mergeRecordList<T extends DataRecord = DataRecord>(a: readonly unknown[], b: readonly unknown[], now: number = Date.now()): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    if (!isRecord(item)) continue;
    const row = item as T;
    const prev = map.get(item.id);
    if (!prev || row.updatedAt > prev.updatedAt) map.set(row.id, row);
  }
  return [...map.values()].filter((r) => !r.deleted || now - Date.parse(r.updatedAt) < TOMBSTONE_TTL_MS);
}

/** Rows that are not deleted. Use this for anything shown or counted. */
export function live<T extends DataRecord>(rows: readonly T[]): T[] {
  return rows.filter((r) => !r.deleted);
}

/** Same rule as rows: the newer write wins, and a deletion is kept so it can win later too. */
function mergeSalary(a: SalaryRecord | null, b: SalaryRecord | null): SalaryRecord | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function mergeUserData(local: UserData, remote: UserData): UserData {
  const l = local ?? emptyUserData();
  const r = remote ?? emptyUserData();
  return {
    v: 1,
    finance: {
      salary: mergeSalary(l.finance.salary, r.finance.salary),
      plannedIncome: mergeRecordList(l.finance.plannedIncome, r.finance.plannedIncome),
      income: mergeRecordList(l.finance.income, r.finance.income),
      expense: mergeRecordList(l.finance.expense, r.finance.expense),
      plannedExpense: mergeRecordList(l.finance.plannedExpense, r.finance.plannedExpense),
      limits: mergeRecordList(l.finance.limits, r.finance.limits),
    },
    work: { tasks: mergeRecordList(l.work.tasks, r.work.tasks) },
    visa: { entries: mergeRecordList(l.visa.entries, r.visa.entries) },
    diary: { items: mergeRecordList(l.diary.items, r.diary.items) },
    sport: { sessions: mergeRecordList(l.sport.sessions, r.sport.sessions) },
    plans: { items: mergeRecordList(l.plans.items, r.plans.items) },
  };
}
