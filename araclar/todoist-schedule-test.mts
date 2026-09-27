/**
 * Picker schedule → Todoist due_string: `node araclar/todoist-schedule-test.mts`
 *
 * A wrong string either fails or, worse, silently changes a recurring task's rule.
 */

import { rescheduleRecurring, todoistRecurrence } from "../src/ortak/todoist-schedule.ts";

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

console.log("Recurrence → due_string");
eq("daily", todoistRecurrence({ kind: "daily", interval: 1 }, "2026-09-28", null), "every day starting sep 28 2026");
eq("daily with time", todoistRecurrence({ kind: "daily", interval: 1 }, "2026-09-28", "07:00"), "every day at 07:00 starting sep 28 2026");
eq("every 3 days", todoistRecurrence({ kind: "daily", interval: 3 }, "2026-09-28", null), "every 3 days starting sep 28 2026");
eq("weekdays", todoistRecurrence({ kind: "weekly", interval: 1, days: [0, 1, 2, 3, 4] }, "2026-09-28", null), "every weekday starting sep 28 2026");
eq("weekend", todoistRecurrence({ kind: "weekly", interval: 1, days: [6, 5] }, "2026-10-03", null), "every sat, sun starting oct 3 2026");
eq("Mon and Thu, sorted", todoistRecurrence({ kind: "weekly", interval: 1, days: [3, 0] }, "2026-09-28", "18:00"), "every mon, thu at 18:00 starting sep 28 2026");
eq("every 2 weeks", todoistRecurrence({ kind: "weekly", interval: 2, days: [4] }, "2026-10-02", null), "every 2 weeks starting oct 2 2026");
eq("monthly on the 15th", todoistRecurrence({ kind: "monthly", interval: 1, day: 15 }, "2026-10-15", null), "every 15th starting oct 15 2026");
eq("monthly on the 1st", todoistRecurrence({ kind: "monthly", interval: 1, day: 1 }, "2026-10-01", null), "every 1st starting oct 1 2026");
eq("last day", todoistRecurrence({ kind: "monthly", interval: 1, day: "last" }, "2026-09-30", null), "every last day starting sep 30 2026");
eq("every 3 months", todoistRecurrence({ kind: "monthly", interval: 3, day: 15 }, "2026-10-15", null), "every 3 months starting oct 15 2026");
eq("yearly has no starting", todoistRecurrence({ kind: "yearly", month: 10, day: 17 }, "2026-10-17", null), "every oct 17");

console.log("\nReschedule keeping the rule");
eq("adds a start", rescheduleRecurring("every mon", "2026-10-05", undefined), "every mon starting oct 5 2026");
eq("replaces an old start", rescheduleRecurring("every day starting sep 1 2026", "2026-09-30", undefined), "every day starting sep 30 2026");
eq("keeps the time", rescheduleRecurring("every day at 07:00 starting sep 1 2026", "2026-09-30", undefined), "every day at 07:00 starting sep 30 2026");
eq("changes the time", rescheduleRecurring("every day at 07:00", "2026-09-30", "08:30"), "every day at 08:30 starting sep 30 2026");
eq("clears the time", rescheduleRecurring("every day at 07:00", "2026-09-30", null), "every day starting sep 30 2026");
eq("case-insensitive", rescheduleRecurring("Every Mon Starting Sep 1 2026", "2026-10-05", undefined), "Every Mon starting oct 5 2026");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
