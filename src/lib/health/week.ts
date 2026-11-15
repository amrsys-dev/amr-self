/**
 * Training consistency the way workout trackers show it: a Mon–Sun strip with
 * the days you trained, the week's count and minutes, and a streak of
 * consecutive weeks with at least one workout.
 */
import type { HealthEntry } from "../data/schema.ts";

function parse(day: string): Date {
  return new Date(day + "T00:00:00Z");
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week that contains `day`. */
export function weekStart(day: string): string {
  const d = parse(day);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return fmt(d);
}

export function weekDays(day: string): string[] {
  const start = parse(weekStart(day));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return fmt(d);
  });
}

export type WeekSummary = { days: { date: string; trained: boolean; minutes: number }[]; count: number; minutes: number };

export function weekSummary(workouts: readonly HealthEntry[], today: string): WeekSummary {
  const live = workouts.filter((w) => !w.deleted && w.date);
  const days = weekDays(today).map((date) => {
    const list = live.filter((w) => w.date === date);
    return { date, trained: list.length > 0, minutes: list.reduce((n, w) => n + Number(w.amount ?? 0), 0) };
  });
  const inWeek = live.filter((w) => days.some((d) => d.date === w.date));
  return { days, count: inWeek.length, minutes: inWeek.reduce((n, w) => n + Number(w.amount ?? 0), 0) };
}

/**
 * Consecutive weeks with at least one workout, ending this week. If this week
 * has none yet, the streak still counts up to last week (it is not broken
 * until the week is over).
 */
export function weekStreak(workouts: readonly HealthEntry[], today: string): number {
  const weeks = new Set(workouts.filter((w) => !w.deleted && w.date).map((w) => weekStart(w.date!)));
  let cursor = parse(weekStart(today));
  if (!weeks.has(fmt(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 7);
  let n = 0;
  while (weeks.has(fmt(cursor))) {
    n += 1;
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return n;
}
