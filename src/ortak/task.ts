// Explicit .ts extension: this file also runs under plain Node (araclar/local-tasks-test.mts).
import type { LocalList, LocalTask, Priority, Reminder } from "./local-tasks.ts";
import { describeRule } from "./recurrence.ts";
import { onemliMi, type TodoistGorev, type TodoistProje } from "./tipler.ts";

/**
 * One task shape for every screen, whether it lives in Todoist or in Argos.
 * Screens read `Task`; only saving looks at `source` to pick where to write.
 */
export type TaskSource = "todoist" | "local";

export interface Task {
  /** Unique across sources: "todoist:<id>" or "local:<id>". */
  key: string;
  source: TaskSource;
  /** The id within its source. */
  id: string;
  listId: string;
  title: string;
  description: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM[:SS]"; null when undated. */
  due: string | null;
  recurring: boolean;
  /** Human text of the repeat rule, e.g. "Her pazartesi"; null when not recurring. */
  recurrenceText: string | null;
  priority: Priority;
  important: boolean;
  labels: string[];
  reminders: Reminder[];
  isSubtask: boolean;
}

export interface TaskList {
  key: string;
  source: TaskSource;
  id: string;
  name: string;
  color: string;
  favorite: boolean;
  inbox: boolean;
  order: number;
}

export const taskKey = (source: TaskSource, id: string): string => `${source}:${id}`;

/** Todoist stores priority inverted: 4 = P1 … 1 = P4. */
export const priorityFromTodoist = (p: number): Priority => (Math.min(4, Math.max(1, 5 - p)) as Priority);
export const priorityToTodoist = (p: Priority): number => 5 - p;

export function fromTodoist(g: TodoistGorev, reminders: Reminder[] = []): Task {
  return {
    key: taskKey("todoist", g.id),
    source: "todoist",
    id: g.id,
    listId: g.projeId,
    title: g.icerik,
    description: g.aciklama,
    due: g.tarih,
    recurring: g.tekrarli,
    recurrenceText: g.tekrarli ? g.tarihMetni : null,
    priority: priorityFromTodoist(g.oncelik),
    important: onemliMi(g),
    labels: g.etiketler,
    reminders,
    isSubtask: g.altGorev,
  };
}

export function fromLocal(t: LocalTask): Task {
  return {
    key: taskKey("local", t.id),
    source: "local",
    id: t.id,
    listId: t.listId,
    title: t.title,
    description: t.description,
    due: t.due,
    recurring: t.recurrence !== null,
    recurrenceText: t.recurrence ? describeRule(t.recurrence) : null,
    priority: t.priority,
    important: t.important,
    labels: [],
    reminders: t.reminders,
    isSubtask: false,
  };
}

export function listFromTodoist(p: TodoistProje): TaskList {
  return {
    key: taskKey("todoist", p.id),
    source: "todoist",
    id: p.id,
    name: p.ad,
    color: p.color,
    favorite: p.favorite,
    inbox: p.inbox,
    order: p.order,
  };
}

export function listFromLocal(l: LocalList): TaskList {
  return {
    key: taskKey("local", l.id),
    source: "local",
    id: l.id,
    name: l.name,
    color: l.color,
    favorite: l.favorite,
    inbox: false,
    order: l.order,
  };
}

/** Todoist's named colours (API `color` field) as hex. Unknown names fall back to grey. */
export const TODOIST_COLORS: Record<string, string> = {
  berry_red: "#b8256f",
  red: "#db4035",
  orange: "#ff9933",
  yellow: "#fad000",
  olive_green: "#afb83b",
  lime_green: "#7ecc49",
  green: "#299438",
  mint_green: "#6accbc",
  teal: "#158fad",
  sky_blue: "#14aaf5",
  light_blue: "#96c3eb",
  blue: "#4073ff",
  grape: "#884dff",
  violet: "#af38eb",
  lavender: "#eb96eb",
  magenta: "#e05194",
  salmon: "#ff8d85",
  charcoal: "#808080",
  grey: "#b8b8b8",
  taupe: "#ccac93",
};

export const todoistColor = (name: string | undefined): string =>
  (name && TODOIST_COLORS[name]) || TODOIST_COLORS.charcoal!;
