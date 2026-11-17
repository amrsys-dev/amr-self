import { clearHealthEntries, mergeHealthConsent, stripLiveHealth } from "../health/consent.ts";
import { emptyUserData, type DataRecord, type SalaryRecord, type UserData } from "./schema.ts";

function isRecord<T extends DataRecord>(x: unknown): x is T {
  if (!x || typeof x !== "object") return false;
  const r = x as DataRecord;
  return typeof r.id === "string" && typeof r.updatedAt === "string";
}

/** Keep deletion tombstones during merges so a stale replica cannot resurrect deleted rows. */
export function mergeRecordList<T extends DataRecord>(a: readonly T[], b: readonly T[]): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    if (!isRecord<T>(item)) continue;
    const prev = map.get(item.id);
    if (!prev || item.updatedAt > prev.updatedAt) map.set(item.id, item);
  }
  return [...map.values()];
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
  const lc = l.car ?? empty.car!;
  const rc = r.car ?? empty.car!;
  const healthConsent = mergeHealthConsent(l.healthConsent, r.healthConsent);
  const health = {
    water: mergeRecordList(lh.water ?? [], rh.water ?? []),
    weight: mergeRecordList(lh.weight ?? [], rh.weight ?? []),
    nutrition: mergeRecordList(lh.nutrition ?? [], rh.nutrition ?? []),
    workouts: mergeRecordList(lh.workouts ?? [], rh.workouts ?? []),
  };
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
    // Consent withdrawn on any device (and newer than any grant): nothing in Health may survive the merge.
    health: healthConsent && !healthConsent.granted ? clearHealthEntries(health, healthConsent.at) : health,
    ...(healthConsent ? { healthConsent } : {}),
    car: {
      vehicles: mergeRecordList(lc.vehicles ?? [], rc.vehicles ?? []),
      items: mergeRecordList(lc.items ?? [], rc.items ?? []),
      log: mergeRecordList(lc.log ?? [], rc.log ?? []),
    },
  };
}

/**
 * What a device may take from a server copy. With consent (the newer decision
 * of this device and the server is «Разрешить») the server copy is used as is.
 * Without it, no health entry comes from the server: only deletion markers and
 * the server's consent/withdrawal decision do. The device keeps only the health
 * entries it already had.
 */
export function healthSafeRemote(remote: UserData, local: UserData | null): UserData {
  const consent = mergeHealthConsent(local?.healthConsent, remote.healthConsent);
  if (consent?.granted) return remote;
  return stripLiveHealth(remote);
}

/** Pull: the server copy for everything, health per healthSafeRemote, plus this device's own health. */
export function keepDeviceOnlyHealth(remote: UserData, local: UserData | null): UserData {
  const consent = mergeHealthConsent(local?.healthConsent, remote.healthConsent);
  if (consent?.granted) return consent === remote.healthConsent ? remote : { ...remote, healthConsent: consent };
  const both = mergeUserData(stripLiveHealth(remote), local ?? { ...emptyUserData(), health: undefined });
  const out: UserData = { ...remote, health: both.health };
  if (consent) out.healthConsent = consent;
  else delete out.healthConsent;
  return out;
}

/** Push conflict (409): merge this device's file with the server copy without taking health from it. */
export function mergeRemoteConflict(local: UserData, remote: UserData): UserData {
  return mergeUserData(local, healthSafeRemote(remote, local));
}
