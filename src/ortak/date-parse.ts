// Explicit .ts extension: this file also runs under plain Node (araclar/date-parse-test.mts).
import { ayAl, gunAl, gunEkle, haftaninGunu } from "./gun.ts";
import { WEEKDAY_SET, WEEKEND_SET, firstOccurrence, type RecurrenceRule } from "./recurrence.ts";
import { turkceTarihCevir } from "./todoist-tarih.ts";

/**
 * Turkish date text → a concrete date for Argos-local tasks.
 *
 * The Turkish grammar already lives in todoist-tarih.ts, which rewrites
 * "haftaya salı 18:00" or "her pazartesi ve perşembe" into the small English
 * vocabulary Todoist understands. Rather than a second Turkish parser, this
 * module resolves that closed English vocabulary into a date, a time and a
 * recurrence rule. One grammar, two consumers.
 */
export interface ParsedDate {
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" or null for an all-day task. */
  time: string | null;
  rule: RecurrenceRule | null;
}

const WEEKDAY_EN: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thursday: 3,
  fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};
const MONTH_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7 };

const pad = (n: number): string => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28). */
function addMonths(iso: string, n: number): string {
  const total = Number(iso.slice(0, 4)) * 12 + ayAl(iso) - 1 + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return isoOf(y, m, Math.min(gunAl(iso), last));
}

/** Next given weekday strictly after today ("cuma" said on a Friday means next Friday). */
const nextWeekday = (today: string, day: number): string =>
  gunEkle(today, ((day - haftaninGunu(today) + 7) % 7) || 7);

function resolveRule(spec: string, today: string): RecurrenceRule | null {
  if (spec === "every day") return { kind: "daily", interval: 1 };
  if (spec === "every weekday") return { kind: "weekly", interval: 1, days: WEEKDAY_SET };
  if (spec === "every sat, sun") return { kind: "weekly", interval: 1, days: WEEKEND_SET };
  if (spec === "every week") return { kind: "weekly", interval: 1, days: [haftaninGunu(today)] };
  if (spec === "every month") return { kind: "monthly", interval: 1, day: gunAl(today) };
  if (spec === "every year") return { kind: "yearly", month: ayAl(today), day: gunAl(today) };
  if (spec === "every last day") return { kind: "monthly", interval: 1, day: "last" };

  const ordinal = spec.match(/^every (\d{1,2})(?:st|nd|rd|th)$/);
  if (ordinal) return { kind: "monthly", interval: 1, day: Number(ordinal[1]) };

  const interval = spec.match(/^every (\d+) (day|week|month|year)s$/);
  if (interval) {
    const n = Number(interval[1]);
    const unit = interval[2]!;
    if (unit === "day") return { kind: "daily", interval: n };
    if (unit === "week") return { kind: "weekly", interval: n, days: [haftaninGunu(today)] };
    if (unit === "month") return { kind: "monthly", interval: n, day: gunAl(today) };
    return { kind: "yearly", month: ayAl(today), day: gunAl(today) };
  }

  const days = spec.match(/^every ((?:[a-z]{3}(?:, )?)+)$/);
  if (days) {
    const list = days[1]!.split(", ").map((d) => WEEKDAY_EN[d]);
    if (list.every((d) => d !== undefined)) return { kind: "weekly", interval: 1, days: list as number[] };
  }
  return null;
}

function resolveDate(spec: string, today: string): string | null {
  if (spec === "" || spec === "today") return today;
  if (spec === "tomorrow") return gunEkle(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(spec)) return spec;
  if (spec === "next week") return gunEkle(today, 7 - haftaninGunu(today));
  if (spec === "next month") return addMonths(`${today.slice(0, 7)}-01`, 1);

  const inN = spec.match(/^in (\d+) (day|week|month)s?$/);
  if (inN) {
    const n = Number(inN[1]);
    return inN[2] === "month" ? addMonths(today, n) : gunEkle(today, n * UNIT_DAYS[inN[2]!]!);
  }

  const weekday = WEEKDAY_EN[spec];
  if (weekday !== undefined) return nextWeekday(today, weekday);

  // "sep 28 2026", "sep 28": without a year, the next such date from today on.
  const named = spec.match(/^([a-z]{3}) (\d{1,2})(?: (\d{4}))?$/);
  if (named) {
    const month = MONTH_EN.indexOf(named[1]!) + 1;
    const day = Number(named[2]);
    if (month === 0) return null;
    const year = Number(named[3] ?? today.slice(0, 4));
    let iso = isoOf(year, month, day);
    if (!named[3] && iso < today) iso = isoOf(year + 1, month, day);
    return iso;
  }
  return null;
}

/**
 * The rule behind a recurring Todoist task's `due.string` ("every 1st",
 * "every mon, thu at 09:00", "every day starting sep 26 2026"). `anchor` is
 * the task's current due date: "every week" repeats on its weekday. Null for
 * patterns Argos does not model ("every 3rd friday"); those keep showing
 * only their next date.
 */
export function ruleFromTodoist(dueString: string, anchor: string): RecurrenceRule | null {
  let spec = dueString
    .toLowerCase()
    .replace(/^every!/, "every")
    .replace(/\s+starting\s+.*$/, "")
    .replace(/\s+at\s+\d{1,2}:\d{2}(\s*[ap]m)?$/, "")
    .trim();
  // Full weekday names ("every saturday") → the short ones resolveRule reads.
  spec = spec.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, (d) => d.slice(0, 3));
  const rule = resolveRule(spec, anchor);
  if (rule) return rule;
  const yearly = spec.match(/^every ([a-z]{3}) (\d{1,2})$/);
  if (yearly) {
    const month = MONTH_EN.indexOf(yearly[1]!) + 1;
    if (month > 0) return { kind: "yearly", month, day: Number(yearly[2]) };
  }
  return null;
}

/**
 * Parses Turkish date text ("yarın 18:00", "haftaya cuma", "her ayın 15'i").
 * Returns null when the text is not a date. A recurring text yields its first
 * occurrence on or after today.
 */
export function parseDateText(text: string, today: string): ParsedDate | null {
  const english = turkceTarihCevir(text, today);
  return english ? parseEnglishDue(english, today) : null;
}

/**
 * Resolves an English due string of the vocabulary Argos sends Todoist:
 * "2026-10-20 14:30", "tomorrow at 09:00", "every 1st",
 * "every day at 18:00 starting sep 26 2026". With "starting", a recurring
 * text's first occurrence is on or after that date instead of today.
 * Null when the text is outside that vocabulary.
 */
export function parseEnglishDue(english: string, today: string): ParsedDate | null {
  let text = english.trim().toLowerCase().replace(/^every!/, "every");
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ t](\d{2}:\d{2}))?$/);
  if (iso) return { date: iso[1]!, time: iso[2] ?? null, rule: null };

  let from = today;
  const starting = text.match(/^(.*?)\s+starting\s+(.+)$/);
  if (starting) {
    const start = resolveDate(starting[2]!, today);
    if (!start) return null;
    from = start;
    text = starting[1]!;
  }

  const at = text.match(/^(.*?)(?: ?at (\d{2}:\d{2}))?$/)!;
  const spec = at[1]!.trim();
  const time = at[2] ?? null;

  if (spec.startsWith("every")) {
    // Full weekday names ("every saturday") read like the short ones.
    const short = spec.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, (d) => d.slice(0, 3));
    const rule = resolveRule(short, from) ?? ruleFromTodoist(short, from);
    if (!rule) return null;
    const date = firstOccurrence(rule, from);
    return date ? { date, time, rule } : null;
  }
  const date = resolveDate(spec, today);
  return date ? { date, time, rule: null } : null;
}

/** Local task due value: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", like Todoist's `due.date`. */
export const dueValue = (p: { date: string; time: string | null }): string =>
  p.time ? `${p.date}T${p.time}` : p.date;
