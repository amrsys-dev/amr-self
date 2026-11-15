/**
 * Car upkeep by odometer. The user types the current mileage now and then;
 * every item (engine oil, gearbox oil, filters...) knows the mileage of its
 * last replacement and its interval, so "km left" is simple arithmetic.
 */
import type { DataRecord } from "../data/schema.ts";

export const MAINTENANCE_KINDS = ["engine_oil", "gear_oil", "oil_filter", "air_filter", "cabin_filter", "brake_pads", "tires", "custom"] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

/** Typical intervals, used only as a starting value the user can change. */
export const DEFAULT_INTERVAL_KM: Record<MaintenanceKind, number> = {
  engine_oil: 10000,
  gear_oil: 60000,
  oil_filter: 10000,
  air_filter: 20000,
  cabin_filter: 15000,
  brake_pads: 40000,
  tires: 50000,
  custom: 10000,
};

export type CarProfile = DataRecord & {
  name: string;
  /** Latest odometer reading, km. */
  odometer: number;
  /** YYYY-MM-DD of that reading. */
  odometerDate: string;
};

export type MaintenanceItem = DataRecord & {
  kind: MaintenanceKind;
  /** Shown for kind "custom". */
  title?: string;
  intervalKm: number;
  /** Odometer at the last replacement, km. */
  lastKm: number;
  lastDate?: string;
};

/** One replacement done, kept as history. Its cost also goes to Finance as a "car" expense. */
export type ServiceEntry = DataRecord & {
  itemId: string;
  kind: MaintenanceKind;
  km: number;
  date: string;
  cost?: number;
  currency?: string;
  expenseId?: string;
};

export type ItemStatus = "ok" | "soon" | "overdue";

export type ItemState = {
  nextKm: number;
  /** Negative when overdue. */
  leftKm: number;
  /** 0..1 share of the interval already driven. */
  used: number;
  status: ItemStatus;
};

/** "Soon" when 10 % of the interval or 1 000 km is left, whichever is larger. */
export function itemState(item: Pick<MaintenanceItem, "intervalKm" | "lastKm">, odometer: number): ItemState {
  const nextKm = item.lastKm + item.intervalKm;
  const leftKm = nextKm - odometer;
  const used = item.intervalKm > 0 ? Math.min(1, Math.max(0, (odometer - item.lastKm) / item.intervalKm)) : 1;
  const soonAt = Math.max(1000, item.intervalKm * 0.1);
  const status: ItemStatus = leftKm < 0 ? "overdue" : leftKm <= soonAt ? "soon" : "ok";
  return { nextKm, leftKm, used, status };
}

/** The item that needs attention first (least km left), or null. */
export function nextDue<T extends Pick<MaintenanceItem, "intervalKm" | "lastKm" | "deleted">>(items: readonly T[], odometer: number): { item: T; state: ItemState } | null {
  let best: { item: T; state: ItemState } | null = null;
  for (const item of items) {
    if (item.deleted) continue;
    const state = itemState(item, odometer);
    if (!best || state.leftKm < best.state.leftKm) best = { item, state };
  }
  return best;
}

/** Parse a typed mileage like "56 000" or "56000". Rejects negatives and fractions. */
export function parseKm(input: string): number | null {
  const cleaned = input.replace(/[\s  .,]/g, "");
  if (!/^\d{1,7}$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** A new reading lower than the stored one is almost always a typo. */
export function isOdometerRollback(current: number, next: number): boolean {
  return next < current;
}
