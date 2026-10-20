/**
 * Date labels and groups in task lists: `node araclar/task-dates-test.mts`
 */

import { addedLabel, dateGroup, dueLabel, groupByDate } from "../src/ortak/task-dates.ts";

let passed = 0;
let failed = 0;

function eq(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
  }
}

// Sunday 2026-09-27.
const T = "2026-09-27";

console.log("Labels");
eq("today with time", dueLabel("2026-09-27T18:00", T), { label: "Bugün 18:00", tone: "today" });
eq("Todoist seconds are dropped", dueLabel("2026-09-28T09:30:00", T), { label: "Yarın 09:30", tone: "tomorrow" });
eq("yesterday", dueLabel("2026-09-26", T), { label: "Dün", tone: "overdue" });
eq("within a week → weekday", dueLabel("2026-10-01", T), { label: "Perşembe", tone: "later" });
eq("a week away → date", dueLabel("2026-10-04", T), { label: "4 Eki", tone: "later" });
eq("older overdue → date", dueLabel("2026-08-13", T), { label: "13 Ağu", tone: "overdue" });
eq("other year shows the year", dueLabel("2027-01-15", T), { label: "15 Oca 2027", tone: "later" });

console.log("\nGroups");
eq("overdue", dateGroup("2026-09-20", T), "Gecikmiş");
eq("today (timed)", dateGroup("2026-09-27T08:00", T), "Bugün");
eq("tomorrow", dateGroup("2026-09-28", T), "Yarın");
eq("7 days away is this week", dateGroup("2026-10-04", T), "Bu hafta");
eq("8 days away is later", dateGroup("2026-10-05", T), "Sonra");
eq("undated", dateGroup(null, T), "Tarihsiz");

const grouped = groupByDate(
  [
    { title: "b", due: null, priority: 4 },
    { title: "a", due: null, priority: 1 },
    { title: "timed", due: "2026-09-27T18:00", priority: 4 },
    { title: "allday", due: "2026-09-27", priority: 4 },
    { title: "late", due: "2026-09-01", priority: 4 },
  ],
  T,
);
eq("group order, empty groups left out", grouped.map((g) => g.group), ["Gecikmiş", "Bugün", "Tarihsiz"]);
eq("all-day before timed on the same day", grouped[1]!.tasks.map((t) => t.title), ["allday", "timed"]);
eq("undated sorted by priority", grouped[2]!.tasks.map((t) => t.title), ["a", "b"]);

console.log("\nWhen a task was added");
const simdi = new Date(2026, 9, 20, 10, 0);
eq("today", addedLabel(new Date(2026, 9, 20, 8, 5).toISOString(), simdi), "20 Ekim 2026 · 08:05 · bugün");
eq("yesterday, late at night", addedLabel(new Date(2026, 9, 19, 23, 59).toISOString(), simdi), "19 Ekim 2026 · 23:59 · dün");
eq("days", addedLabel(new Date(2026, 9, 15, 9, 0).toISOString(), simdi), "15 Ekim 2026 · 09:00 · 5 gün önce");
eq("weeks", addedLabel(new Date(2026, 8, 20, 9, 0).toISOString(), simdi), "20 Eylül 2026 · 09:00 · 4 hafta önce");
eq("months", addedLabel(new Date(2026, 4, 1, 9, 0).toISOString(), simdi), "1 Mayıs 2026 · 09:00 · 5 ay önce");
eq("an unreadable date", addedLabel("yarın", simdi), null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
