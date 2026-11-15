/**
 * Tasks grouped by when they are due, as in Todoist / Things / Reminders:
 * Overdue, Today, Upcoming, No date, and Done (kept out of the way).
 * Inside a group: date, then priority (high first), then newest.
 */
import type { TaskRecord } from "../data/schema.ts";

export type TaskGroups = { overdue: TaskRecord[]; today: TaskRecord[]; upcoming: TaskRecord[]; someday: TaskRecord[]; done: TaskRecord[] };

const RANK = { high: 0, medium: 1, low: 2 } as const;

function byWhenThenPriority(a: TaskRecord, b: TaskRecord): number {
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
    || RANK[a.priority ?? "medium"] - RANK[b.priority ?? "medium"]
    || b.updatedAt.localeCompare(a.updatedAt);
}

export function groupTasks(tasks: readonly TaskRecord[], today: string): TaskGroups {
  const g: TaskGroups = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  for (const t of tasks) {
    if (t.deleted) continue;
    if (t.completed) g.done.push(t);
    else if (!t.dueDate) g.someday.push(t);
    else if (t.dueDate < today) g.overdue.push(t);
    else if (t.dueDate === today) g.today.push(t);
    else g.upcoming.push(t);
  }
  g.overdue.sort(byWhenThenPriority);
  g.today.sort(byWhenThenPriority);
  g.upcoming.sort(byWhenThenPriority);
  g.someday.sort(byWhenThenPriority);
  g.done.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return g;
}
