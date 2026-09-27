/**
 * Recurrence rules for local tasks: `node araclar/recurrence-test.mts`
 *
 * A wrong next date silently moves someone's weekly task to the wrong day,
 * so the month-end and leap-year edges are pinned here.
 */

import {
  describeRule,
  firstOccurrence,
  nextDueAfterCompletion,
  presetRules,
  type RecurrenceRule,
} from "../src/ortak/recurrence.ts";

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

const daily: RecurrenceRule = { kind: "daily", interval: 1 };
const every3: RecurrenceRule = { kind: "daily", interval: 3 };
const monThu: RecurrenceRule = { kind: "weekly", interval: 1, days: [0, 3] };
const weekdays: RecurrenceRule = { kind: "weekly", interval: 1, days: [0, 1, 2, 3, 4] };
const biweeklyFri: RecurrenceRule = { kind: "weekly", interval: 2, days: [4] };
const on31: RecurrenceRule = { kind: "monthly", interval: 1, day: 31 };
const lastDay: RecurrenceRule = { kind: "monthly", interval: 1, day: "last" };
const quarterly15: RecurrenceRule = { kind: "monthly", interval: 3, day: 15 };
const feb29: RecurrenceRule = { kind: "yearly", month: 2, day: 29 };

// 2026-09-27 is a Sunday.
console.log("First occurrence");
eq("daily starts today", firstOccurrence(daily, "2026-09-27"), "2026-09-27");
eq("Mon/Thu from Sunday → Monday", firstOccurrence(monThu, "2026-09-27"), "2026-09-28");
eq("weekdays from Sunday → Monday", firstOccurrence(weekdays, "2026-09-27"), "2026-09-28");
eq("the 31st from Sep 27 → Sep 30 (30-day month)", firstOccurrence(on31, "2026-09-27"), "2026-09-30");
eq("last day from Feb 3 2027 → Feb 28", firstOccurrence(lastDay, "2027-02-03"), "2027-02-28");
eq("empty weekly rule → null", firstOccurrence({ kind: "weekly", interval: 1, days: [] }, "2026-09-27"), null);

console.log("\nNext due after completion");
eq("daily, on time → tomorrow", nextDueAfterCompletion(daily, "2026-09-27", "2026-09-27"), "2026-09-28");
eq("daily, overdue a week → tomorrow, not a past day", nextDueAfterCompletion(daily, "2026-09-20", "2026-09-27"), "2026-09-28");
eq("daily, completed early → day after due", nextDueAfterCompletion(daily, "2026-09-30", "2026-09-27"), "2026-10-01");
eq("every 3 days keeps its rhythm from the due date", nextDueAfterCompletion(every3, "2026-09-21", "2026-09-27"), "2026-09-30");
eq("Mon/Thu, Monday → Thursday", nextDueAfterCompletion(monThu, "2026-09-28", "2026-09-28"), "2026-10-01");
eq("Mon/Thu, Thursday → next Monday", nextDueAfterCompletion(monThu, "2026-10-01", "2026-10-01"), "2026-10-05");
eq("weekdays, Friday → Monday", nextDueAfterCompletion(weekdays, "2026-10-02", "2026-10-02"), "2026-10-05");
eq("every 2 weeks on Friday skips a week", nextDueAfterCompletion(biweeklyFri, "2026-10-02", "2026-10-02"), "2026-10-16");
eq("the 31st: Oct 31 → Nov 30", nextDueAfterCompletion(on31, "2026-10-31", "2026-10-31"), "2026-11-30");
eq("the 31st: Nov 30 → Dec 31 (back to 31)", nextDueAfterCompletion(on31, "2026-11-30", "2026-11-30"), "2026-12-31");
eq("the 31st: Jan 31 → Feb 28", nextDueAfterCompletion(on31, "2027-01-31", "2027-01-31"), "2027-02-28");
eq("last day: Jan 31 → Feb 28", nextDueAfterCompletion(lastDay, "2027-01-31", "2027-01-31"), "2027-02-28");
eq("every 3 months on the 15th", nextDueAfterCompletion(quarterly15, "2026-10-15", "2026-10-15"), "2027-01-15");
eq("Feb 29 yearly: 2028 → 2029-02-28", nextDueAfterCompletion(feb29, "2028-02-29", "2028-02-29"), "2029-02-28");
eq("Feb 29 yearly: 2029 → 2030-02-28", nextDueAfterCompletion(feb29, "2029-02-28", "2029-02-28"), "2030-02-28");
eq("year boundary: Dec 31 daily → Jan 1", nextDueAfterCompletion(daily, "2026-12-31", "2026-12-31"), "2027-01-01");

console.log("\nDescription");
eq("daily", describeRule(daily), "Her gün");
eq("every 3 days", describeRule(every3), "3 günde bir");
eq("weekdays", describeRule(weekdays), "Hafta içi her gün");
eq("weekend", describeRule({ kind: "weekly", interval: 1, days: [6, 5] }), "Hafta sonu her gün");
eq("Mon and Thu", describeRule(monThu), "Her pazartesi ve perşembe");
eq("three days", describeRule({ kind: "weekly", interval: 1, days: [4, 0, 2] }), "Her pazartesi, çarşamba ve cuma");
eq("every 2 weeks", describeRule(biweeklyFri), "2 haftada bir cuma");
eq("monthly on the 15th", describeRule({ kind: "monthly", interval: 1, day: 15 }), "Her ayın 15'i");
eq("suffix 1'i", describeRule({ kind: "monthly", interval: 1, day: 1 }), "Her ayın 1'i");
eq("suffix 3'ü", describeRule({ kind: "monthly", interval: 1, day: 3 }), "Her ayın 3'ü");
eq("suffix 6'sı", describeRule({ kind: "monthly", interval: 1, day: 6 }), "Her ayın 6'sı");
eq("suffix 9'u", describeRule({ kind: "monthly", interval: 1, day: 9 }), "Her ayın 9'u");
eq("suffix 10'u", describeRule({ kind: "monthly", interval: 1, day: 10 }), "Her ayın 10'u");
eq("suffix 20'si", describeRule({ kind: "monthly", interval: 1, day: 20 }), "Her ayın 20'si");
eq("suffix 30'u", describeRule({ kind: "monthly", interval: 1, day: 30 }), "Her ayın 30'u");
eq("last day", describeRule(lastDay), "Her ayın son günü");
eq("every 3 months", describeRule(quarterly15), "3 ayda bir, ayın 15'i");
eq("yearly", describeRule({ kind: "yearly", month: 10, day: 17 }), "Her yıl 17 Ekim");

console.log("\nPresets");
eq(
  "picker presets for Saturday Oct 17",
  presetRules("2026-10-17").map((p) => p.label),
  ["Her gün", "Hafta içi her gün", "Her cumartesi", "Her ayın 17'si", "Her yıl 17 Ekim"],
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
