// Explicit .ts extension: this file also runs under plain Node (araclar/recurrence-test.mts).
import { AY_TAM, GUN_ADLARI, ayAl, gunAl, gunEkle, gunFarki, haftaninGunu, yilAl } from "./gun.ts";

/**
 * Recurrence rules for Argos-local tasks. Todoist computes recurrence for its
 * own tasks; local tasks need the same behaviour, so it lives here as pure
 * functions over ISO dates ("YYYY-MM-DD").
 *
 * Weekdays follow gun.ts: 0 = Monday … 6 = Sunday.
 */
export type RecurrenceRule =
  | { kind: "daily"; interval: number }
  | { kind: "weekly"; interval: number; days: number[] }
  | { kind: "monthly"; interval: number; day: number | "last" }
  | { kind: "yearly"; month: number; day: number };

const WEEKDAYS = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];

/** Upper bound for the day-by-day search; enough for "every 4 years on Feb 29". */
const SEARCH_LIMIT_DAYS = 366 * 5;

const daysInMonth = (iso: string): number =>
  new Date(Date.UTC(yilAl(iso), ayAl(iso), 0)).getUTCDate();

/** Day 31 in a 30-day month (or Feb 29 in a common year) falls on the month's last day. */
function dayMatches(iso: string, day: number | "last"): boolean {
  const last = daysInMonth(iso);
  return day === "last" ? gunAl(iso) === last : gunAl(iso) === Math.min(day, last);
}

const mondayOf = (iso: string): string => gunEkle(iso, -haftaninGunu(iso));
const monthIndex = (iso: string): number => yilAl(iso) * 12 + ayAl(iso) - 1;

/**
 * Whether `iso` is an occurrence of `rule`. Intervals count from `anchor`
 * (the task's current due date), so "every 2 weeks" keeps its rhythm.
 */
export function occursOn(rule: RecurrenceRule, iso: string, anchor: string): boolean {
  switch (rule.kind) {
    case "daily": {
      const diff = gunFarki(iso, anchor);
      return diff % Math.max(1, rule.interval) === 0;
    }
    case "weekly": {
      if (!rule.days.includes(haftaninGunu(iso))) return false;
      const weeks = Math.round(gunFarki(mondayOf(iso), mondayOf(anchor)) / 7);
      return weeks % Math.max(1, rule.interval) === 0;
    }
    case "monthly": {
      const months = monthIndex(iso) - monthIndex(anchor);
      return months % Math.max(1, rule.interval) === 0 && dayMatches(iso, rule.day);
    }
    case "yearly":
      return ayAl(iso) === rule.month && dayMatches(iso, rule.day);
  }
}

/** First occurrence on or after `from`; `anchor` defaults to `from`. Null for an empty rule. */
export function firstOccurrence(rule: RecurrenceRule, from: string, anchor = from): string | null {
  for (let i = 0; i <= SEARCH_LIMIT_DAYS; i++) {
    const iso = gunEkle(from, i);
    if (occursOn(rule, iso, anchor)) return iso;
  }
  return null;
}

/**
 * Where a recurring task goes when it is completed. Like Todoist, it moves
 * to the first occurrence after both its due date and today: an overdue
 * daily task completed today shows up tomorrow, not on a day already past.
 */
export function nextDueAfterCompletion(rule: RecurrenceRule, due: string, today: string): string | null {
  const after = due > today ? due : today;
  return firstOccurrence(rule, gunEkle(after, 1), due);
}

/* --- description --------------------------------------------------------- */

const lower = (s: string): string => s.toLocaleLowerCase("tr-TR");

/** Turkish ordinal suffix for a day of month: 1'i, 2'si, 3'ü, 6'sı … */
function daySuffix(n: number): string {
  const last = n % 10;
  const tens = Math.floor(n / 10) % 10;
  if (last === 0) return tens === 1 ? "'u" : tens === 2 ? "'si" : "'u";
  return ["", "'i", "'si", "'ü", "'ü", "'i", "'sı", "'si", "'i", "'u"][last]!;
}

function joinDays(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => lower(GUN_ADLARI[d]!));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ve ${names.at(-1)}`;
}

const sameSet = (a: number[], b: number[]): boolean =>
  a.length === b.length && b.every((x) => a.includes(x));

/** Short Turkish description shown in the UI: "Her pazartesi ve perşembe", "Her ayın 15'i". */
export function describeRule(rule: RecurrenceRule): string {
  switch (rule.kind) {
    case "daily":
      return rule.interval <= 1 ? "Her gün" : `${rule.interval} günde bir`;
    case "weekly": {
      if (rule.interval <= 1 && sameSet(rule.days, WEEKDAYS)) return "Hafta içi her gün";
      if (rule.interval <= 1 && sameSet(rule.days, WEEKEND)) return "Hafta sonu her gün";
      if (rule.days.length === 7 && rule.interval <= 1) return "Her gün";
      const days = joinDays(rule.days);
      return rule.interval <= 1 ? `Her ${days}` : `${rule.interval} haftada bir ${days}`;
    }
    case "monthly": {
      const day = rule.day === "last" ? "son günü" : `${rule.day}${daySuffix(rule.day)}`;
      return rule.interval <= 1 ? `Her ayın ${day}` : `${rule.interval} ayda bir, ayın ${day}`;
    }
    case "yearly":
      return `Her yıl ${rule.day} ${AY_TAM[rule.month - 1]}`;
  }
}

/* --- rules offered by the date picker -------------------------------------- */

/** The quick choices of the "Tekrarla" menu, derived from the task's date. */
export function presetRules(iso: string): { label: string; rule: RecurrenceRule }[] {
  const presets: RecurrenceRule[] = [
    { kind: "daily", interval: 1 },
    { kind: "weekly", interval: 1, days: WEEKDAYS },
    { kind: "weekly", interval: 1, days: [haftaninGunu(iso)] },
    { kind: "monthly", interval: 1, day: gunAl(iso) },
    { kind: "yearly", month: ayAl(iso), day: gunAl(iso) },
  ];
  return presets.map((rule) => ({ label: describeRule(rule), rule }));
}

export const WEEKDAY_SET = WEEKDAYS;
export const WEEKEND_SET = WEEKEND;
