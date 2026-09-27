// Explicit .ts extension: this file also runs under plain Node (araclar/reminders-test.mts).
import { AY_ADLARI, gunEkle } from "./gun.ts";
import type { LocalTask, Reminder } from "./local-tasks.ts";

/**
 * Argos's own reminders. Todoist Free has none, so they live in Argos:
 * on the task itself for Argos-local tasks, and in `tasks/reminders.json`
 * for Todoist tasks. Delivery is twofold — a desktop notification while
 * Argos runs, and a Telegram message from the Worker, which reads the
 * resolved moments from the snapshot.
 *
 * Moments are local wall-clock strings, "YYYY-MM-DDTHH:MM" (Istanbul time).
 */

export const REMINDERS_PATH = "tasks/reminders.json";

/** A relative reminder on an all-day task counts from this time of the due day. */
export const ALL_DAY_BASE = "09:00";

/** Minutes before the due time offered in the picker. */
export const REMINDER_PRESETS = [0, 10, 30, 60, 1440];

/**
 * Reminders of one Todoist task, with a copy of its title and due date so
 * the snapshot can be built without asking Todoist. Argos refreshes the
 * copy whenever it reads Todoist.
 */
export interface TodoistReminderEntry {
  title: string;
  due: string | null;
  reminders: Reminder[];
}

export interface RemindersFile {
  version: 1;
  todoist: Record<string, TodoistReminderEntry>;
}

export const emptyReminders = (): RemindersFile => ({ version: 1, todoist: {} });

export function normalizeReminders(raw: unknown): RemindersFile {
  const todoist = (raw as { todoist?: Record<string, Partial<TodoistReminderEntry>> } | null)?.todoist;
  if (!todoist || typeof todoist !== "object") return emptyReminders();
  const out: Record<string, TodoistReminderEntry> = {};
  for (const [id, e] of Object.entries(todoist)) {
    if (!e || !Array.isArray(e.reminders) || e.reminders.length === 0) continue;
    out[id] = { title: e.title ?? "", due: e.due ?? null, reminders: e.reminders };
  }
  return { version: 1, todoist: out };
}

/** Sets (or, with no reminders left, removes) one Todoist task's entry. */
export function setTodoistReminders(file: RemindersFile, taskId: string, entry: TodoistReminderEntry): RemindersFile {
  const todoist = { ...file.todoist };
  if (entry.reminders.length === 0) delete todoist[taskId];
  else todoist[taskId] = entry;
  return { ...file, todoist };
}

/**
 * Brings the cached title/due of Todoist entries up to date and drops
 * entries whose task is no longer open. Returns null when nothing changed,
 * so callers can skip the write.
 */
export function syncTodoistReminders(
  file: RemindersFile,
  open: { id: string; title: string; due: string | null }[],
): RemindersFile | null {
  const byId = new Map(open.map((t) => [t.id, t]));
  let changed = false;
  const todoist: Record<string, TodoistReminderEntry> = {};
  for (const [id, e] of Object.entries(file.todoist)) {
    const t = byId.get(id);
    if (!t) {
      changed = true;
      continue;
    }
    const due = t.due ? t.due.slice(0, 16) : null;
    if (t.title !== e.title || due !== e.due) changed = true;
    todoist[id] = { ...e, title: t.title, due };
  }
  return changed ? { ...file, todoist } : null;
}

/* --- moments ----------------------------------------------------------------- */

const pad = (n: number): string => String(n).padStart(2, "0");

/** Wall-clock arithmetic on "YYYY-MM-DDTHH:MM" (no time zone involved). */
export function addMinutes(moment: string, minutes: number): string {
  const [d, t] = moment.split("T");
  const [y, m, day] = d!.split("-").map(Number);
  const [h, mi] = t!.split(":").map(Number);
  const x = new Date(Date.UTC(y!, m! - 1, day!, h!, mi!) + minutes * 60000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

/** When a reminder fires, or null for a relative reminder on an undated task. */
export function reminderMoment(due: string | null, r: Reminder): string | null {
  if (r.kind === "absolute") return r.at.slice(0, 16);
  if (!due) return null;
  const base = due.length > 10 ? due.slice(0, 16) : `${due.slice(0, 10)}T${ALL_DAY_BASE}`;
  return addMinutes(base, -r.minutesBefore);
}

/** "Zamanında", "10 dk önce", "1 saat önce", "1 gün önce", "17 Eki 09:00". */
export function describeReminder(r: Reminder, today?: string): string {
  if (r.kind === "absolute") {
    const iso = r.at.slice(0, 10);
    const time = r.at.slice(11, 16);
    if (today && iso === today) return `Bugün ${time}`;
    if (today && iso === gunEkle(today, 1)) return `Yarın ${time}`;
    return `${Number(iso.slice(8, 10))} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]} ${time}`;
  }
  const m = r.minutesBefore;
  if (m === 0) return "Zamanında";
  if (m % 1440 === 0) return `${m / 1440} gün önce`;
  if (m % 60 === 0) return `${m / 60} saat önce`;
  if (m > 60) return `${Math.floor(m / 60)} sa ${m % 60} dk önce`;
  return `${m} dk önce`;
}

/* --- what is coming ------------------------------------------------------------ */

export interface ReminderItem {
  /** Unique per reminder and moment: "local:<task>:<reminder>@<moment>". */
  key: string;
  at: string;
  title: string;
  source: "todoist" | "local";
  taskId: string;
  /** The task's due value, for the Telegram "done" button of a local task. */
  due: string | null;
}

/** Reminders firing in [from, to], earliest first. Done local tasks are skipped. */
export function upcomingReminders(
  local: LocalTask[],
  todoist: RemindersFile,
  from: string,
  to: string,
): ReminderItem[] {
  const items: ReminderItem[] = [];
  const push = (source: "todoist" | "local", taskId: string, title: string, due: string | null, r: Reminder) => {
    const at = reminderMoment(due, r);
    if (!at || at < from || at > to) return;
    items.push({ key: `${source}:${taskId}:${r.id}@${at}`, at, title, source, taskId, due });
  };
  for (const t of local) {
    if (t.completedAt) continue;
    for (const r of t.reminders) push("local", t.id, t.title, t.due, r);
  }
  for (const [id, e] of Object.entries(todoist.todoist)) {
    for (const r of e.reminders) push("todoist", id, e.title, e.due, r);
  }
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
