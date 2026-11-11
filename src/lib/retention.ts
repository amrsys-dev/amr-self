/** Retention windows approved by Murad for AMR ID v1. */

export const LOG_TTL_DAYS = 30;
export const REPORT_TTL_DAYS = 90;
export const PROVIDER_BACKUP_DAYS = 30;

export const LOG_TTL_SECONDS = LOG_TTL_DAYS * 24 * 60 * 60;
export const REPORT_TTL_SECONDS = REPORT_TTL_DAYS * 24 * 60 * 60;

export const LOG_KEY_PREFIX = "log:";
export const REPORT_KEY_PREFIX = "report:";

export type RetentionRecord = {
  kind: "log" | "report";
  at: string;
  payload: unknown;
};

/** Immediate wipe of account data does not wait for these windows. Provider backups may remain up to 30 days. */
export function retentionTtl(kind: "log" | "report"): number {
  return kind === "report" ? REPORT_TTL_SECONDS : LOG_TTL_SECONDS;
}
