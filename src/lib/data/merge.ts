import { emptyUserData, type DataRecord, type SalaryRecord, type UserData } from "./schema.ts";

function isRecord<T extends DataRecord>(x: unknown): x is T {
  if (!x || typeof x !== "object") return false;
  const r = x as DataRecord;
  return typeof r.id === "string" && typeof r.updatedAt === "string";
}

/** Per-record merge: same id keeps the row with the later updatedAt. Deleted rows drop out. */
export function mergeRecordList<T extends DataRecord>(a: readonly T[], b: readonly T[]): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    if (!isRecord<T>(item)) continue;
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
  const empty = emptyUserData();
  const l = local ?? empty;
  const r = remote ?? empty;
  const lf = l.finance ?? empty.finance;
  const rf = r.finance ?? empty.finance;
  const lh = l.health ?? empty.health!;
  const rh = r.health ?? empty.health!;
  return {
    v: 1,
    finance: {
      salary: mergeSalary(lf.salary ?? null, rf.salary ?? null),
      gigs: mergeRecordList(lf.gigs ?? [], rf.gigs ?? []),
      income: mergeRecordList(lf.income ?? [], rf.income ?? []),
      expense: mergeRecordList(lf.expense ?? [], rf.expense ?? []),
      planned: mergeRecordList(lf.planned ?? [], rf.planned ?? []),
      limits: mergeRecordList(lf.limits ?? [], rf.limits ?? []),
    },
    work: { tasks: mergeRecordList(l.work?.tasks ?? [], r.work?.tasks ?? []) },
    visa: { entries: mergeRecordList(l.visa?.entries ?? [], r.visa?.entries ?? []) },
    diary: { items: mergeRecordList(l.diary?.items ?? [], r.diary?.items ?? []) },
    sport: { sessions: mergeRecordList(l.sport?.sessions ?? [], r.sport?.sessions ?? []) },
    plans: { items: mergeRecordList(l.plans?.items ?? [], r.plans?.items ?? []) },
    health: {
      water: mergeRecordList(lh.water ?? [], rh.water ?? []),
      weight: mergeRecordList(lh.weight ?? [], rh.weight ?? []),
      nutrition: mergeRecordList(lh.nutrition ?? [], rh.nutrition ?? []),
      workouts: mergeRecordList(lh.workouts ?? [], rh.workouts ?? []),
    },
  };
}
