// Explicit .ts extension: this file also runs under plain Node (araclar/local-tasks-test.mts).
import type { LocalList, LocalTask, Priority, Reminder } from "./local-tasks.ts";
import { describeRule, type RecurrenceRule } from "./recurrence.ts";
import { ONEMLI_ETIKETI, onemliMi, type TodoistGorev, type TodoistProje } from "./tipler.ts";

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
  /**
   * Which kind of list `listId` names. Equal to `source`, except for an Argos
   * task kept in a Todoist list after Todoist deleted it.
   */
  listSource: TaskSource;
  title: string;
  description: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM[:SS]"; null when undated. */
  due: string | null;
  recurring: boolean;
  /** Human text of the repeat rule, e.g. "Her pazartesi"; null when not recurring. */
  recurrenceText: string | null;
  /** The structured rule of an Argos task; Todoist tasks only carry `recurrenceText`. */
  rule: RecurrenceRule | null;
  priority: Priority;
  important: boolean;
  labels: string[];
  reminders: Reminder[];
  isSubtask: boolean;
  /** Todoist's raw due string (recurring tasks keep their rule through it); null for local tasks. */
  todoistDueString: string | null;
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
    listSource: "todoist",
    title: g.icerik,
    description: g.aciklama,
    due: g.tarih,
    recurring: g.tekrarli,
    recurrenceText: g.tekrarli ? g.tarihMetni : null,
    rule: null,
    priority: priorityFromTodoist(g.oncelik),
    important: onemliMi(g),
    labels: g.etiketler,
    reminders,
    isSubtask: g.altGorev,
    todoistDueString: g.dueString ?? null,
  };
}

export function fromLocal(t: LocalTask): Task {
  return {
    key: taskKey("local", t.id),
    source: "local",
    id: t.id,
    listId: t.listId,
    listSource: t.listSource ?? "local",
    title: t.title,
    description: t.description,
    due: t.due,
    recurring: t.recurrence !== null,
    recurrenceText: t.recurrence ? describeRule(t.recurrence) : null,
    rule: t.recurrence,
    priority: t.priority,
    important: t.important,
    labels: [],
    reminders: t.reminders,
    isSubtask: false,
    todoistDueString: null,
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

/** Projects carry the hex; the colour menu needs the name back to mark the current swatch. */
export const todoistColorName = (hex: string): string | null =>
  Object.entries(TODOIST_COLORS).find(([, h]) => h.toLowerCase() === hex.toLowerCase())?.[0] ?? null;

/** Names shown on the colour swatches of a Todoist project. */
export const TODOIST_COLOR_LABELS: Record<string, string> = {
  berry_red: "Bordo",
  red: "Kırmızı",
  orange: "Turuncu",
  yellow: "Sarı",
  olive_green: "Zeytin yeşili",
  lime_green: "Açık yeşil",
  green: "Yeşil",
  mint_green: "Nane yeşili",
  teal: "Petrol mavisi",
  sky_blue: "Gök mavisi",
  light_blue: "Açık mavi",
  blue: "Mavi",
  grape: "Üzüm",
  violet: "Mor",
  lavender: "Lavanta",
  magenta: "Pembe",
  salmon: "Somon",
  charcoal: "Koyu gri",
  grey: "Gri",
  taupe: "Vizon",
};

/**
 * An Argos task in the Todoist shape, for the older screens (Takvim, Hafta,
 * Bugün cards) that render `TodoistGorev`. `source: "local"` lets their
 * actions route back to the local store.
 */
export function localAsTodoist(t: LocalTask): TodoistGorev {
  return {
    id: t.id,
    icerik: t.title,
    aciklama: t.description,
    projeId: t.listId,
    tarih: t.due,
    tarihMetni: t.recurrence ? describeRule(t.recurrence) : null,
    tekrarli: t.recurrence !== null,
    oncelik: priorityToTodoist(t.priority),
    etiketler: t.important ? [ONEMLI_ETIKETI] : [],
    altGorev: false,
    source: "local",
  };
}
