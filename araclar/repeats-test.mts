/**
 * Later repeats of recurring tasks on the calendar: `node araclar/repeats-test.mts`
 *
 * Todoist keeps only a recurring task's next date; without these the
 * calendar showed "her ayın 1'i" on one month and nowhere after.
 */

import { ruleFromTodoist } from "../src/ortak/date-parse.ts";
import type { LocalTask } from "../src/ortak/local-tasks.ts";
import { occurrencesBetween } from "../src/ortak/recurrence.ts";
import { projectedRepeats } from "../src/ortak/repeats.ts";
import type { TodoistGorev } from "../src/ortak/tipler.ts";

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

console.log("Todoist due string → rule");
const r = (s: string, anchor = "2026-10-05") => ruleFromTodoist(s, anchor);
eq("every 1st", r("every 1st"), { kind: "monthly", interval: 1, day: 1 });
eq("every day at 18:00 starting …", r("every day at 18:00 starting sep 26 2026"), { kind: "daily", interval: 1 });
eq("every mon, thu at 09:00", r("every mon, thu at 09:00"), { kind: "weekly", interval: 1, days: [0, 3] });
eq("every saturday starting … (full name)", r("every saturday starting sep 26 2026"), { kind: "weekly", interval: 1, days: [5] });
eq("every weekday", r("every weekday"), { kind: "weekly", interval: 1, days: [0, 1, 2, 3, 4] });
eq("every week → anchor's weekday (Mon)", r("every week"), { kind: "weekly", interval: 1, days: [0] });
eq("every 2 weeks", r("every 2 weeks"), { kind: "weekly", interval: 2, days: [0] });
eq("every 3 days", r("every 3 days"), { kind: "daily", interval: 3 });
eq("every last day", r("every last day"), { kind: "monthly", interval: 1, day: "last" });
eq("every! day (strict repeat)", r("every! day"), { kind: "daily", interval: 1 });
eq("every sep 26 at 09:00 → yearly", r("every sep 26 at 09:00"), { kind: "yearly", month: 9, day: 26 });
eq("Every 15th (capitals)", r("Every 15th"), { kind: "monthly", interval: 1, day: 15 });
eq("unmodelled pattern → null", r("every 3rd friday"), null);

console.log("\nOccurrences in a window");
const monthly = { kind: "monthly", interval: 1, day: 1 } as const;
eq("monthly 1st, Nov → Jan", occurrencesBetween(monthly, "2026-11-01", "2026-10-01", "2027-01-31"), ["2026-12-01", "2027-01-01"]);
eq("anchor itself is left out", occurrencesBetween(monthly, "2026-11-01", "2026-11-01", "2026-11-30"), []);
eq("every 2 weeks keeps rhythm", occurrencesBetween({ kind: "weekly", interval: 2, days: [0] }, "2026-10-05", "2026-10-06", "2026-11-02"), ["2026-10-19", "2026-11-02"]);

console.log("\nProjected repeats");
const TODAY = "2026-10-05";
const td = (id: string, tarih: string, dueString: string): TodoistGorev => ({
  id, icerik: id, aciklama: "", projeId: "P", tarih, tarihMetni: null, dueString,
  tekrarli: true, oncelik: 1, etiketler: [], altGorev: false,
});
const aidat = td("aidat", "2026-11-01", "every 1st");
const dates = (xs: TodoistGorev[]) => xs.map((x) => `${x.id}@${x.tarih}`);
eq("Aidat in the December grid", dates(projectedRepeats([aidat], [], "2026-11-29", "2027-01-10", TODAY)), ["aidat@2026-12-01", "aidat@2027-01-01"]);
eq("October grid: no repeat before the real Nov 1", dates(projectedRepeats([aidat], [], "2026-09-28", "2026-11-08", TODAY)), []);
eq("copies are marked projected", projectedRepeats([aidat], [], "2026-11-29", "2026-12-06", TODAY)[0]?.projected, true);
eq(
  "time is kept",
  dates(projectedRepeats([td("gym", "2026-10-05T18:00:00", "every day at 18:00")], [], "2026-10-05", "2026-10-07", TODAY)),
  ["gym@2026-10-06T18:00:00", "gym@2026-10-07T18:00:00"],
);
eq(
  "overdue recurring task: no repeats on past days",
  dates(projectedRepeats([td("d", "2026-10-01", "every day")], [], "2026-09-28", "2026-10-07", TODAY)),
  ["d@2026-10-05", "d@2026-10-06", "d@2026-10-07"],
);
eq("range entirely in the past → nothing", projectedRepeats([aidat], [], "2026-01-01", "2026-02-01", TODAY), []);
eq("non-recurring Todoist task → nothing", projectedRepeats([{ ...aidat, tekrarli: false }], [], "2026-11-29", "2027-01-10", TODAY), []);
eq("unknown pattern → nothing", projectedRepeats([td("x", "2026-10-16", "every 3rd friday")], [], "2026-10-01", "2026-12-31", TODAY), []);

const local = (over: Partial<LocalTask>): LocalTask => ({
  id: "l1", listId: "L", title: "Kira", description: "", due: "2026-10-15",
  recurrence: { kind: "monthly", interval: 1, day: 15 }, priority: 4, important: false,
  reminders: [], order: 0, createdAt: "", completedAt: null, ...over,
});
eq("local monthly task", dates(projectedRepeats([], [local({})], "2026-10-01", "2026-12-31", TODAY)), ["l1@2026-11-15", "l1@2026-12-15"]);
eq("local repeat keeps source", projectedRepeats([], [local({})], "2026-11-01", "2026-11-30", TODAY)[0]?.source, "local");
eq("completed local task → nothing", projectedRepeats([], [local({ completedAt: "x" })], "2026-10-01", "2026-12-31", TODAY), []);
eq("local without rule → nothing", projectedRepeats([], [local({ recurrence: null })], "2026-10-01", "2026-12-31", TODAY), []);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
