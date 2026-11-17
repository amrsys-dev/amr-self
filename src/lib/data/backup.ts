/**
 * Backup to a file the user keeps (Files app, Google Drive, Telegram "Saved").
 * This is the safety net if the phone is lost, the browser data is cleared,
 * or the password and recovery codes are both gone.
 *
 * The file is plain JSON on purpose: it must open even when the account is
 * lost. The app warns the user to keep it private.
 */
import { isHealthConsent } from "../health/consent.ts";
import { emptyUserData, type UserData } from "./schema.ts";

export const BACKUP_FORMAT = "amr-self-backup";
export const BACKUP_VERSION = 1;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  v: typeof BACKUP_VERSION;
  createdAt: string;
  data: UserData;
};

export function buildBackup(data: UserData, now: Date = new Date()): string {
  const file: BackupFile = { format: BACKUP_FORMAT, v: BACKUP_VERSION, createdAt: now.toISOString(), data };
  return JSON.stringify(file, null, 2);
}

export function backupFileName(now: Date = new Date()): string {
  return `amr-self-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseResult = { ok: true; data: UserData; createdAt: string } | { ok: false; reason: "not_json" | "wrong_format" | "newer_version" | "broken" };

/** Validate a backup file and fill in any sections an older backup lacks. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not_json" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "wrong_format" };
  const f = raw as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) return { ok: false, reason: "wrong_format" };
  if (typeof f.v !== "number" || f.v > BACKUP_VERSION) return { ok: false, reason: "newer_version" };
  if (!f.data || typeof f.data !== "object") return { ok: false, reason: "broken" };

  const base = emptyUserData();
  const d = f.data as Partial<UserData>;
  const merged: UserData = {
    ...base,
    ...d,
    v: 1,
    finance: { ...base.finance, ...(d.finance ?? {}) },
    work: { ...base.work, ...(d.work ?? {}) },
    visa: { ...base.visa, ...(d.visa ?? {}) },
    diary: { ...base.diary, ...(d.diary ?? {}) },
    sport: { ...base.sport, ...(d.sport ?? {}) },
    plans: { ...base.plans, ...(d.plans ?? {}) },
    health: { ...base.health!, ...(d.health ?? {}) },
    car: { ...base.car!, ...(d.car ?? {}) },
  };
  if (d.healthConsent !== undefined) {
    if (!isHealthConsent(d.healthConsent)) return { ok: false, reason: "broken" };
    merged.healthConsent = d.healthConsent;
  }
  for (const [key, section] of Object.entries(merged) as [string, unknown][]) {
    if (key === "healthConsent") continue;
    if (section && typeof section === "object") {
      for (const list of Object.values(section)) {
        if (list !== null && !Array.isArray(list) && typeof list !== "object") return { ok: false, reason: "broken" };
      }
    }
  }
  return { ok: true, data: merged, createdAt: typeof f.createdAt === "string" ? f.createdAt : "" };
}
