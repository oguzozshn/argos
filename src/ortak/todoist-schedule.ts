// Explicit .ts extension: this file also runs under plain Node (araclar/todoist-schedule-test.mts).
import { gunAl } from "./gun.ts";
import { WEEKDAY_SET, WEEKEND_SET, type RecurrenceRule } from "./recurrence.ts";
import { siraEn } from "./todoist-tarih.ts";

/**
 * The date picker speaks in {date, time, rule}; Todoist wants a `due_string`.
 * These build that string in the same shape the calendar's repeat picker
 * already sends (verified against Todoist): rule, then " at HH:MM", then
 * " starting <mon> <d> <yyyy>".
 */

const DAY_EN = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MONTH_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const sameSet = (a: number[], b: number[]): boolean => a.length === b.length && b.every((x) => a.includes(x));

/** "2026-09-28" → "sep 28 2026". */
export const todoistDateWords = (iso: string): string =>
  `${MONTH_EN[Number(iso.slice(5, 7)) - 1]} ${gunAl(iso)} ${iso.slice(0, 4)}`;

function ruleWords(rule: RecurrenceRule): string {
  switch (rule.kind) {
    case "daily":
      return rule.interval <= 1 ? "every day" : `every ${rule.interval} days`;
    case "weekly": {
      if (rule.interval <= 1 && sameSet(rule.days, WEEKDAY_SET)) return "every weekday";
      if (rule.interval <= 1 && sameSet(rule.days, WEEKEND_SET)) return "every sat, sun";
      if (rule.interval <= 1) return `every ${[...rule.days].sort((a, b) => a - b).map((d) => DAY_EN[d]).join(", ")}`;
      // Todoist anchors "every N weeks" on the start date, which the picker
      // sets to an occurrence day.
      return `every ${rule.interval} weeks`;
    }
    case "monthly":
      if (rule.day === "last") return "every last day";
      return rule.interval <= 1 ? `every ${siraEn(rule.day)}` : `every ${rule.interval} months`;
    case "yearly":
      return `every ${MONTH_EN[rule.month - 1]} ${rule.day}`;
  }
}

/** Full due_string for a recurring task starting on `start` ("YYYY-MM-DD"). */
export function todoistRecurrence(rule: RecurrenceRule, start: string, time: string | null): string {
  const at = time ? ` at ${time}` : "";
  // A yearly rule already names its day; "starting" would be redundant.
  const from = rule.kind === "yearly" ? "" : ` starting ${todoistDateWords(start)}`;
  return `${ruleWords(rule)}${at}${from}`;
}

/**
 * Moves a recurring Todoist task to a new date while keeping its rule:
 * the existing English due string loses its old " starting …" (and its time
 * when a new one is given) and gets the new start.
 */
export function rescheduleRecurring(dueString: string, date: string, time: string | null | undefined): string {
  let base = dueString.trim().replace(/\s+starting\s+.*$/i, "");
  const existingTime = base.match(/\s+at\s+(\d{1,2}:\d{2})$/i);
  base = base.replace(/\s+at\s+\d{1,2}:\d{2}$/i, "");
  const t = time === undefined ? (existingTime?.[1] ?? null) : time;
  return `${base}${t ? ` at ${t}` : ""} starting ${todoistDateWords(date)}`;
}
