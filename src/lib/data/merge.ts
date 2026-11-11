import { emptyUserData, type DataRecord, type SalaryRecord, type UserData } from "./schema.ts";

function isRecord(x: unknown): x is DataRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as DataRecord;
  return typeof r.id === "string" && typeof r.updatedAt === "string";
}

/** Per-record merge: same id keeps the row with the later updatedAt. Deleted rows drop out. */
export function mergeRecordList(a: unknown[], b: unknown[]): DataRecord[] {
  const map = new Map<string, DataRecord>();
  for (const item of [...a, ...b]) {
    if (!isRecord(item)) continue;
    const prev = map.get(item.id);
    if (!prev || item.updatedAt > prev.updatedAt) map.set(item.id, item);
  }
  return [...map.values()].filter((r) => !r.deleted);
}

function mergeSalary(a: SalaryRecord | null, b: SalaryRecord | null): SalaryRecord | null {
  if (!a) return b && !b.deleted ? b : null;
  if (!b) return a.deleted ? null : a;
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  return newer.deleted ? null : newer;
}

export function mergeUserData(local: UserData, remote: UserData): UserData {
  const l = local ?? emptyUserData();
  const r = remote ?? emptyUserData();
  return {
    v: 1,
    finance: {
      salary: mergeSalary(l.finance.salary, r.finance.salary),
      gigs: mergeRecordList(l.finance.gigs, r.finance.gigs),
      income: mergeRecordList(l.finance.income, r.finance.income),
      expense: mergeRecordList(l.finance.expense, r.finance.expense),
      planned: mergeRecordList(l.finance.planned, r.finance.planned),
      limits: mergeRecordList(l.finance.limits, r.finance.limits),
    },
    work: { tasks: mergeRecordList(l.work.tasks, r.work.tasks) },
    visa: { entries: mergeRecordList(l.visa.entries, r.visa.entries) },
    diary: { items: mergeRecordList(l.diary.items, r.diary.items) },
    sport: { sessions: mergeRecordList(l.sport.sessions, r.sport.sessions) },
    plans: { items: mergeRecordList(l.plans.items, r.plans.items) },
  };
}
