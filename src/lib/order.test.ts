import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupByDay, monthFlow, shiftMonth, totalBalance, type Entry } from "./finance/ledger.ts";
import { groupTasks } from "./tasks/groups.ts";
import { weekDays, weekStreak, weekSummary } from "./health/week.ts";

const T = "2026-11-01T00:00:00.000Z";

describe("running balance", () => {
  const income = [
    { id: "s", updatedAt: T, amount: 4000, date: "2026-10-28" },
    { id: "a", updatedAt: T, amount: 300, date: "2026-11-10" },
  ];
  const expense = [
    { id: "r", updatedAt: T, amount: 1500, date: "2026-10-30" },
    { id: "f", updatedAt: T, amount: 120, date: "2026-11-12" },
    { id: "x", updatedAt: T, amount: 999, date: "2026-11-13", deleted: true },
  ];

  it("carries over from previous months and ignores deleted rows", () => {
    assert.equal(totalBalance(income, expense), 2680);
  });
  it("shows the month's money in and out separately", () => {
    assert.deepEqual(monthFlow(income, expense, "2026-11"), { in: 300, out: 120, net: 180 });
    assert.deepEqual(monthFlow(income, expense, "2026-10"), { in: 4000, out: 1500, net: 2500 });
  });
  it("moves between months across years", () => {
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
  });
  it("groups the history by day with a day total, newest first", () => {
    const entries: Entry[] = [
      { id: "1", updatedAt: "2026-11-12T08:00:00.000Z", amount: 120, date: "2026-11-12", kind: "expense" },
      { id: "2", updatedAt: "2026-11-12T09:00:00.000Z", amount: 50, date: "2026-11-12", kind: "income" },
      { id: "3", updatedAt: T, amount: 300, date: "2026-11-10", kind: "income" },
    ];
    const g = groupByDay(entries);
    assert.deepEqual(g.map((d) => [d.date, d.net]), [["2026-11-12", -70], ["2026-11-10", 300]]);
    assert.equal(g[0]!.entries[0]!.id, "2");
  });
});

describe("task groups", () => {
  const tasks = [
    { id: "late", updatedAt: T, title: "a", dueDate: "2026-11-10" },
    { id: "low", updatedAt: T, title: "b", dueDate: "2026-11-15", priority: "low" as const },
    { id: "high", updatedAt: T, title: "c", dueDate: "2026-11-15", priority: "high" as const },
    { id: "next", updatedAt: T, title: "d", dueDate: "2026-11-20" },
    { id: "free", updatedAt: T, title: "e" },
    { id: "done", updatedAt: T, title: "f", dueDate: "2026-11-15", completed: true },
    { id: "gone", updatedAt: T, title: "g", dueDate: "2026-11-15", deleted: true },
  ];
  const g = groupTasks(tasks, "2026-11-15");

  it("sorts into overdue, today, upcoming, no date and done", () => {
    assert.deepEqual(
      [g.overdue, g.today, g.upcoming, g.someday, g.done].map((l) => l.map((t) => t.id)),
      [["late"], ["high", "low"], ["next"], ["free"], ["done"]],
    );
  });
});

describe("training week", () => {
  const w = (id: string, date: string, min: number) => ({ id, updatedAt: T, kind: "workout" as const, date, amount: min });

  it("has a Monday-to-Sunday strip", () => {
    assert.deepEqual(weekDays("2026-11-15"), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  });
  it("counts this week's workouts and minutes", () => {
    const s = weekSummary([w("1", "2026-11-09", 45), w("2", "2026-11-11", 60), w("3", "2026-11-02", 30)], "2026-11-15");
    assert.equal(s.count, 2);
    assert.equal(s.minutes, 105);
    assert.deepEqual(s.days.filter((d) => d.trained).map((d) => d.date), ["2026-11-09", "2026-11-11"]);
  });
  it("counts consecutive weeks, and an empty current week does not break the streak yet", () => {
    const list = [w("1", "2026-11-02", 30), w("2", "2026-10-27", 30), w("3", "2026-10-12", 30)];
    assert.equal(weekStreak(list, "2026-11-15"), 2);
    assert.equal(weekStreak([...list, w("4", "2026-11-14", 20)], "2026-11-15"), 3);
    assert.equal(weekStreak([], "2026-11-15"), 0);
  });
});
