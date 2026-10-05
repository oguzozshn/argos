// Explicit .ts extensions: this file also runs under plain Node (araclar/repeats-test.mts).
import { ruleFromTodoist } from "./date-parse.ts";
import type { LocalTask } from "./local-tasks.ts";
import { occurrencesBetween, type RecurrenceRule } from "./recurrence.ts";
import { localAsTodoist } from "./task.ts";
import type { TodoistGorev } from "./tipler.ts";

/**
 * Later repeats of recurring tasks for a calendar range. Todoist (and Argos)
 * store only a recurring task's next date, so "her ayın 1'i" showed on one
 * month and vanished from the next. Each repeat is a copy marked `projected`,
 * on its own date with the task's time kept.
 *
 * Repeats start the day after the task's next date and never before today:
 * a past day only ever holds the real, overdue task.
 */
export function projectedRepeats(
  todoist: TodoistGorev[],
  local: LocalTask[],
  from: string,
  to: string,
  today: string,
): TodoistGorev[] {
  const start = from > today ? from : today;
  if (start > to) return [];

  const repeat = (task: TodoistGorev, rule: RecurrenceRule | null): TodoistGorev[] => {
    if (!rule || !task.tarih) return [];
    const time = task.tarih.slice(10);
    return occurrencesBetween(rule, task.tarih.slice(0, 10), start, to).map((day) => ({
      ...task,
      tarih: day + time,
      projected: true,
    }));
  };

  return [
    ...todoist
      .filter((t) => t.tekrarli && t.tarih && t.dueString)
      .flatMap((t) => repeat(t, ruleFromTodoist(t.dueString!, t.tarih!.slice(0, 10)))),
    ...local.filter((t) => !t.completedAt && t.due && t.recurrence).flatMap((t) => repeat(localAsTodoist(t), t.recurrence)),
  ];
}
