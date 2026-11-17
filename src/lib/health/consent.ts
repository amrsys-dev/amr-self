/**
 * Health data is sensitive under PDPL, so the Health section needs explicit
 * consent before the first entry. Consent lives inside the encrypted user file
 * with the date it was given. Withdrawing it clears every health entry.
 */
import type { HealthEntry, UserData } from "../data/schema.ts";

export type HealthConsent = {
  /** true after «Разрешить»; false after «Отозвать согласие». */
  granted: boolean;
  /** ISO time of the last decision. */
  at: string;
};

export type HealthField = "water" | "weight" | "nutrition" | "workouts";
export const HEALTH_FIELDS: readonly HealthField[] = ["water", "weight", "nutrition", "workouts"];

export class HealthConsentRequired extends Error {
  constructor() {
    super("health_consent_required");
    this.name = "HealthConsentRequired";
  }
}

export function isHealthConsent(x: unknown): x is HealthConsent {
  if (!x || typeof x !== "object") return false;
  const c = x as HealthConsent;
  return typeof c.granted === "boolean" && typeof c.at === "string" && !Number.isNaN(Date.parse(c.at));
}

export function hasHealthConsent(data: Pick<UserData, "healthConsent">): boolean {
  return isHealthConsent(data.healthConsent) && data.healthConsent.granted === true;
}

const emptyHealth = () => ({ water: [] as HealthEntry[], weight: [] as HealthEntry[], nutrition: [] as HealthEntry[], workouts: [] as HealthEntry[] });

export function grantHealthConsent(data: UserData, now: Date = new Date()): UserData {
  return { ...data, health: data.health ?? emptyHealth(), healthConsent: { granted: true, at: now.toISOString() } };
}

/** The only way to add a health entry: refuses without consent. */
export function addHealthEntry(data: UserData, field: HealthField, entry: HealthEntry): UserData {
  if (!hasHealthConsent(data)) throw new HealthConsentRequired();
  const health = data.health ?? emptyHealth();
  return { ...data, health: { ...health, [field]: [...(health[field] ?? []), entry] } };
}

/**
 * Turn every live entry into a bare tombstone (id, time, deleted): the content
 * is gone, and the tombstone stops another device from bringing it back.
 */
export function clearHealthEntries(health: UserData["health"], at: string): NonNullable<UserData["health"]> {
  const h = health ?? emptyHealth();
  const wipe = (rows: HealthEntry[] | undefined): HealthEntry[] =>
    (rows ?? []).map((r) => ({ id: r.id, updatedAt: r.updatedAt > at ? r.updatedAt : at, deleted: true }));
  return { water: wipe(h.water), weight: wipe(h.weight), nutrition: wipe(h.nutrition), workouts: wipe(h.workouts) };
}

/** «Отозвать согласие»: clears all health entries and marks consent as withdrawn. */
export function withdrawHealthConsent(data: UserData, now: Date = new Date()): UserData {
  const at = now.toISOString();
  return { ...data, health: clearHealthEntries(data.health, at), healthConsent: { granted: false, at } };
}

/** The newer decision wins when two devices disagree. */
export function mergeHealthConsent(a: unknown, b: unknown): HealthConsent | undefined {
  const x = isHealthConsent(a) ? a : undefined;
  const y = isHealthConsent(b) ? b : undefined;
  if (!x) return y;
  if (!y) return x;
  if (x.at === y.at) return x.granted ? y : x; // tie: withdrawal wins
  return x.at > y.at ? x : y;
}

/** True when the file still has health entries (e.g. from before consent existed). */
export function hasLiveHealthEntries(data: Pick<UserData, "health">): boolean {
  const h = data.health;
  if (!h) return false;
  return HEALTH_FIELDS.some((f) => (h[f] ?? []).some((r) => !r.deleted));
}

/** «Удалить старые записи»: tombstone every health entry without giving consent. */
export function discardHealthWithoutConsent(data: UserData, now: Date = new Date()): UserData {
  return { ...data, health: clearHealthEntries(data.health, now.toISOString()) };
}

/**
 * Without consent, health content never leaves the device and never enters a
 * restored file: live entries are dropped, and only bare deletion markers
 * (id, time, deleted) remain so deletions still reach other devices.
 * With consent the data is returned unchanged.
 */
export function stripHealthWithoutConsent(data: UserData): UserData {
  if (hasHealthConsent(data)) return data;
  const h = data.health ?? emptyHealth();
  const keep = (rows: HealthEntry[] | undefined): HealthEntry[] =>
    (rows ?? []).filter((r) => r.deleted).map((r) => ({ id: r.id, updatedAt: r.updatedAt, deleted: true }));
  return { ...data, health: { water: keep(h.water), weight: keep(h.weight), nutrition: keep(h.nutrition), workouts: keep(h.workouts) } };
}

/** A server copy with health entries but no consent must be re-uploaded stripped. */
export function needsHealthCleanup(remote: Pick<UserData, "health" | "healthConsent">): boolean {
  return !hasHealthConsent(remote) && hasLiveHealthEntries(remote);
}
