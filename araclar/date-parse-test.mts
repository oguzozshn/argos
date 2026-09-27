/**
 * Turkish date text → local task date: `node araclar/date-parse-test.mts`
 *
 * Local tasks reuse the Todoist translation grammar; these cases check that
 * its English output resolves to the dates a Turkish speaker means.
 */

import { dueValue, parseDateText } from "../src/ortak/date-parse.ts";

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
const TODAY = "2026-09-27";
const p = (text: string, today = TODAY) => parseDateText(text, today);
const d = (text: string, today = TODAY) => {
  const r = p(text, today);
  return r ? dueValue(r) : null;
};

console.log("Single dates");
eq("bugün", d("bugün"), "2026-09-27");
eq("yarın 18:00", d("yarın 18:00"), "2026-09-28T18:00");
eq("Yarın saat 9", d("Yarın saat 9"), "2026-09-28T09:00");
eq("time only → today", d("18:30"), "2026-09-27T18:30");
eq("öbür gün", d("öbür gün"), "2026-09-29");
eq("3 gün sonra", d("3 gün sonra"), "2026-09-30");
eq("2 hafta sonra", d("2 hafta sonra"), "2026-10-11");
eq("1 ay sonra (month clamps)", d("1 ay sonra", "2027-01-31"), "2027-02-28");
eq("cuma → coming Friday", d("cuma"), "2026-10-02");
eq("cumaya 14:00", d("cumaya 14:00"), "2026-10-02T14:00");
eq("pazar on a Sunday → next Sunday", d("pazar"), "2026-10-04");
eq("haftaya salı (Sunday) → Tue of next week", d("haftaya salı"), "2026-09-29");
eq("haftaya salı (Monday) → 8 days later", d("haftaya salı", "2026-09-21"), "2026-09-29");
eq("gelecek hafta → next Monday", d("gelecek hafta"), "2026-09-28");
eq("gelecek ay → 1st of next month", d("gelecek ay"), "2026-10-01");
eq("25.10", d("25.10"), "2026-10-25");
eq("25.09 already past → next year", d("25.09"), "2027-09-25");
eq("17 ekim 14:00", d("17 ekim 14:00"), "2026-10-17T14:00");
eq("15 ocak 2027", d("15 ocak 2027"), "2027-01-15");
eq("ISO date", d("2026-12-01"), "2026-12-01");

console.log("\nDotted time (14.00)");
eq("14 kasım 14.00", d("14 kasım 14.00"), "2026-11-14T14:00");
eq("yarın 9.30", d("yarın 9.30"), "2026-09-28T09:30");
eq("cuma 14.30'da", d("cuma 14.30'da"), "2026-10-02T14:30");
eq("her salı 18.00", d("her salı 18.00"), "2026-09-29T18:00");
eq("25.10 alone is still a date", d("25.10"), "2026-10-25");
eq("typo 14.000 is not understood", p("14 kasım 14.000"), null);
eq("25.00 after a date is not a time (hour > 23)", p("14 kasım 25.00"), null);

console.log("\nRecurring");
eq("her gün", p("her gün"), { date: "2026-09-27", time: null, rule: { kind: "daily", interval: 1 } });
eq("her gün 07:00", d("her gün 07:00"), "2026-09-27T07:00");
eq("hafta içi → first weekday is Monday", p("hafta içi"), { date: "2026-09-28", time: null, rule: { kind: "weekly", interval: 1, days: [0, 1, 2, 3, 4] } });
eq("hafta sonu → today (Sunday)", p("hafta sonu")?.date, "2026-09-27");
eq("her salı 18:00", p("her salı 18:00"), { date: "2026-09-29", time: "18:00", rule: { kind: "weekly", interval: 1, days: [1] } });
eq("her pazartesi ve perşembe", p("her pazartesi ve perşembe")?.rule, { kind: "weekly", interval: 1, days: [0, 3] });
eq("her hafta → today's weekday", p("her hafta")?.rule, { kind: "weekly", interval: 1, days: [6] });
eq("iki haftada bir", p("iki haftada bir")?.rule, { kind: "weekly", interval: 2, days: [6] });
eq("3 günde bir", p("3 günde bir")?.rule, { kind: "daily", interval: 3 });
eq("her ay → today's day", p("her ay"), { date: "2026-09-27", time: null, rule: { kind: "monthly", interval: 1, day: 27 } });
eq("her ayın 15'i → next 15th", p("her ayın 15'i"), { date: "2026-10-15", time: null, rule: { kind: "monthly", interval: 1, day: 15 } });
eq("her ayın son günü", p("her ayın son günü"), { date: "2026-09-30", time: null, rule: { kind: "monthly", interval: 1, day: "last" } });
eq("her yıl", p("her yıl")?.rule, { kind: "yearly", month: 9, day: 27 });

console.log("\nNot dates");
eq("plain words", p("fatura öde"), null);
eq("empty", p(""), null);
eq("unknown month name", p("25 foo"), null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
