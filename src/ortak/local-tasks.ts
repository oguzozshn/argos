// Explicit .ts extension: this file also runs under plain Node (araclar/local-tasks-test.mts).
import { nextDueAfterCompletion, type RecurrenceRule } from "./recurrence.ts";

/**
 * Argos-local lists and tasks. Todoist Free caps projects at five, so new
 * lists live in the data folder instead: `tasks/lists.json` and
 * `tasks/tasks.json`. They sync through OneDrive like the rest of `data/`,
 * but do not appear in the Todoist app.
 *
 * Everything here is a pure function from one file state to the next; the
 * screens own reading and writing (useDosya handles conflicts).
 */

export const LISTS_PATH = "tasks/lists.json";
export const TASKS_PATH = "tasks/tasks.json";

export interface LocalList {
  id: string;
  name: string;
  /** Hex colour, e.g. "#6ab0de". */
  color: string;
  favorite: boolean;
  order: number;
  createdAt: string;
}

export type Reminder =
  /** Minutes before the due time (0 = at the due time). Needs a timed due date. */
  | { id: string; kind: "relative"; minutesBefore: number }
  /** A fixed local moment: "YYYY-MM-DDTHH:MM". */
  | { id: string; kind: "absolute"; at: string };

/** A reminder before it gets its id. */
export type NewReminder = { kind: "relative"; minutesBefore: number } | { kind: "absolute"; at: string };

/** Priority as people say it: 1 = P1 (highest) … 4 = P4 (none). */
export type Priority = 1 | 2 | 3 | 4;

export interface LocalTask {
  id: string;
  listId: string;
  /**
   * "todoist" when `listId` is a Todoist project: the task was deleted in
   * Todoist and Argos kept it in its list. Absent for a task in an Argos list.
   */
  listSource?: "todoist";
  title: string;
  description: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"; null when undated. */
  due: string | null;
  recurrence: RecurrenceRule | null;
  priority: Priority;
  important: boolean;
  reminders: Reminder[];
  order: number;
  createdAt: string;
  /** Set when a non-recurring task is completed; the task stays in the file. */
  completedAt: string | null;
}

export interface ListsFile {
  version: 1;
  lists: LocalList[];
}

export interface TasksFile {
  version: 1;
  tasks: LocalTask[];
}

export const emptyLists = (): ListsFile => ({ version: 1, lists: [] });
export const emptyTasks = (): TasksFile => ({ version: 1, tasks: [] });

/** Short unique id with a prefix: "l-…" for lists, "t-…" for tasks. */
export const newLocalId = (prefix: "l" | "t" | "r", d = new Date()): string =>
  `${prefix}-${d.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Colours offered for new lists; the first unused one is picked by default. */
export const LIST_COLORS = ["#6ab0de", "#7fc39a", "#e0b35c", "#e08b82", "#b48ee0", "#8b9be8", "#d98cb3", "#9aa39c"];

const nextOrder = (items: { order: number }[]): number =>
  items.reduce((max, x) => Math.max(max, x.order), -1) + 1;

/* --- lists ------------------------------------------------------------------ */

export function addList(
  file: ListsFile,
  input: { name: string; color?: string },
  id: string,
  now: string,
): ListsFile {
  const used = new Set(file.lists.map((l) => l.color));
  const color = input.color ?? LIST_COLORS.find((c) => !used.has(c)) ?? LIST_COLORS[0]!;
  const list: LocalList = {
    id,
    name: input.name.trim(),
    color,
    favorite: false,
    order: nextOrder(file.lists),
    createdAt: now,
  };
  return { ...file, lists: [...file.lists, list] };
}

export function updateList(
  file: ListsFile,
  id: string,
  patch: Partial<Pick<LocalList, "name" | "color" | "favorite" | "order">>,
): ListsFile {
  return {
    ...file,
    lists: file.lists.map((l) =>
      l.id === id ? { ...l, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) } : l,
    ),
  };
}

/** Removes a list together with its tasks, as Todoist does when a project is deleted. */
export function deleteList(
  lists: ListsFile,
  tasks: TasksFile,
  id: string,
): { lists: ListsFile; tasks: TasksFile } {
  return {
    lists: { ...lists, lists: lists.lists.filter((l) => l.id !== id) },
    tasks: { ...tasks, tasks: tasks.tasks.filter((t) => t.listId !== id) },
  };
}

/* --- tasks ------------------------------------------------------------------ */

export interface NewTask {
  listId: string;
  listSource?: "todoist";
  title: string;
  description?: string;
  due?: string | null;
  recurrence?: RecurrenceRule | null;
  priority?: Priority;
  important?: boolean;
  reminders?: Reminder[];
}

export function addTask(file: TasksFile, input: NewTask, id: string, now: string): TasksFile {
  const task: LocalTask = {
    id,
    listId: input.listId,
    ...(input.listSource ? { listSource: input.listSource } : {}),
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    due: input.due ?? null,
    // A rule without a date has nothing to repeat from.
    recurrence: input.due ? (input.recurrence ?? null) : null,
    priority: input.priority ?? 4,
    important: input.important ?? false,
    reminders: input.reminders ?? [],
    order: nextOrder(file.tasks.filter((t) => t.listId === input.listId)),
    createdAt: now,
    completedAt: null,
  };
  return { ...file, tasks: [...file.tasks, task] };
}

export type TaskPatch = Partial<
  Pick<LocalTask, "listId" | "listSource" | "title" | "description" | "due" | "recurrence" | "priority" | "important" | "reminders" | "order">
>;

export function updateTask(file: TasksFile, id: string, patch: TaskPatch): TasksFile {
  return {
    ...file,
    tasks: file.tasks.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch };
      if (patch.title !== undefined) next.title = patch.title.trim();
      // Clearing the date also clears the rule: an undated task cannot repeat.
      if (next.due === null) next.recurrence = null;
      return next;
    }),
  };
}

/** Puts a task back exactly as it was (undo for complete, delete or edit). */
export function restoreTask(file: TasksFile, task: LocalTask): TasksFile {
  const exists = file.tasks.some((t) => t.id === task.id);
  return {
    ...file,
    tasks: exists ? file.tasks.map((t) => (t.id === task.id ? task : t)) : [...file.tasks, task],
  };
}

export function deleteTask(file: TasksFile, id: string): TasksFile {
  return { ...file, tasks: file.tasks.filter((t) => t.id !== id) };
}

/**
 * Completes a task. A recurring one stays open and moves to its next
 * occurrence (keeping its time of day); `nextDue` reports where it went.
 */
export function completeTask(
  file: TasksFile,
  id: string,
  now: string,
  today: string,
): { file: TasksFile; nextDue: string | null } {
  const task = file.tasks.find((t) => t.id === id);
  if (!task) return { file, nextDue: null };

  if (task.recurrence && task.due) {
    const next = nextDueAfterCompletion(task.recurrence, task.due.slice(0, 10), today);
    if (next) {
      const due = task.due.length > 10 ? `${next}${task.due.slice(10)}` : next;
      return { file: updateTask(file, id, { due }), nextDue: due };
    }
  }
  return {
    file: { ...file, tasks: file.tasks.map((t) => (t.id === id ? { ...t, completedAt: now } : t)) },
    nextDue: null,
  };
}

export const openTasks = (file: TasksFile): LocalTask[] => file.tasks.filter((t) => !t.completedAt);

/** Open tasks of one list, in their manual order. */
export const tasksOfList = (file: TasksFile, listId: string): LocalTask[] =>
  openTasks(file)
    .filter((t) => t.listId === listId)
    .sort((a, b) => a.order - b.order);

/** Open tasks whose date falls in [from, to] (inclusive, "YYYY-MM-DD"). */
export const tasksInRange = (file: TasksFile, from: string, to: string): LocalTask[] =>
  openTasks(file).filter((t) => {
    const d = t.due?.slice(0, 10);
    return !!d && d >= from && d <= to;
  });

/**
 * Reads a file written by any version: missing arrays, a missing file or
 * fields added later fall back to defaults, so old data never breaks a screen.
 */
export function normalizeTasks(raw: unknown): TasksFile {
  const tasks = (raw as { tasks?: Partial<LocalTask>[] } | null)?.tasks;
  if (!Array.isArray(tasks)) return emptyTasks();
  return {
    version: 1,
    tasks: tasks
      .filter((t): t is Partial<LocalTask> & { id: string; listId: string; title: string } =>
        typeof t?.id === "string" && typeof t.listId === "string" && typeof t.title === "string",
      )
      .map((t, i) => ({
        id: t.id,
        listId: t.listId,
        ...(t.listSource === "todoist" ? { listSource: "todoist" as const } : {}),
        title: t.title,
        description: t.description ?? "",
        due: t.due ?? null,
        recurrence: t.recurrence ?? null,
        priority: ([1, 2, 3, 4] as const).includes(t.priority as Priority) ? (t.priority as Priority) : 4,
        important: t.important === true,
        reminders: Array.isArray(t.reminders) ? t.reminders : [],
        order: typeof t.order === "number" ? t.order : i,
        createdAt: t.createdAt ?? "",
        completedAt: t.completedAt ?? null,
      })),
  };
}

export function normalizeLists(raw: unknown): ListsFile {
  const lists = (raw as { lists?: Partial<LocalList>[] } | null)?.lists;
  if (!Array.isArray(lists)) return emptyLists();
  return {
    version: 1,
    lists: lists
      .filter((l): l is Partial<LocalList> & { id: string; name: string } =>
        typeof l?.id === "string" && typeof l.name === "string",
      )
      .map((l, i) => ({
        id: l.id,
        name: l.name,
        color: l.color ?? LIST_COLORS[i % LIST_COLORS.length]!,
        favorite: l.favorite === true,
        order: typeof l.order === "number" ? l.order : i,
        createdAt: l.createdAt ?? "",
      })),
  };
}
