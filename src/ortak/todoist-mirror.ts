// Explicit .ts extensions: this file also runs under plain Node (araclar/todoist-mirror-test.mts).
import { ruleFromTodoist } from "./date-parse.ts";
import { addList, addTask, updateList, updateTask, type ListsFile, type TasksFile } from "./local-tasks.ts";
import { priorityFromTodoist, todoistColor } from "./task.ts";
import { ONEMLI_ETIKETI, PLAN_PROJESI } from "./tipler.ts";

/**
 * Argos's own copy of Todoist, so that what is deleted in Todoist is not lost.
 *
 * Todoist's Sync API reports changes since the last sync token. A task
 * completed elsewhere comes back with `checked: true`; a deleted one comes
 * back with `is_deleted: true` and its content blanked. That is why the copy
 * is needed: it still holds the name, date and list of whatever Todoist
 * deleted, and those become Argos lists and tasks instead of disappearing.
 *
 * Deleting from Argos goes the other way: Argos records the id first
 * (`argosDeleted`), deletes it in Todoist, and the sync that reports the
 * deletion only drops it.
 */

/** Outside tasks/: the Telegram bot resends its snapshot on every change there. */
export const MIRROR_PATH = "sync/todoist.json";

export interface MirrorProject {
  id: string;
  name: string;
  /** Hex, as Argos lists store it. */
  color: string;
  favorite: boolean;
  inbox: boolean;
  /** Todoist's `child_order`: the sidebar order. */
  order: number;
}

export interface MirrorItem {
  id: string;
  projectId: string;
  content: string;
  description: string;
  /** Todoist's `due.date`: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS". */
  due: string | null;
  dueString: string | null;
  recurring: boolean;
  /** Todoist's scale: 4 = P1 … 1 = P4. */
  priority: number;
  labels: string[];
  /** Set for a sub-task. */
  parentId: string | null;
  /** Todoist's `child_order` within the project. */
  order: number;
}

/**
 * 2 added the fields the screens read (order, sub-tasks). A copy of an older
 * version keeps its data but loses its token, so the next sync is a full one
 * that refills every field and still checks what vanished meanwhile.
 */
export const MIRROR_VERSION = 2;

export interface MirrorFile {
  version: typeof MIRROR_VERSION;
  /** Null until the first full sync. */
  syncToken: string | null;
  projects: Record<string, MirrorProject>;
  items: Record<string, MirrorItem>;
  /** "project:<id>" / "item:<id>" deleted from Argos: their deletion is expected, not kept. */
  argosDeleted: string[];
}

export const emptyMirror = (): MirrorFile => ({ version: MIRROR_VERSION, syncToken: null, projects: {}, items: {}, argosDeleted: [] });

export function normalizeMirror(raw: unknown): MirrorFile {
  const m = raw as Partial<MirrorFile> | null;
  if (!m || typeof m !== "object") return emptyMirror();
  return {
    version: MIRROR_VERSION,
    syncToken: typeof m.syncToken === "string" && m.version === MIRROR_VERSION ? m.syncToken : null,
    projects: m.projects && typeof m.projects === "object" ? m.projects : {},
    items: m.items && typeof m.items === "object" ? m.items : {},
    argosDeleted: Array.isArray(m.argosDeleted) ? m.argosDeleted : [],
  };
}

/* --- Sync API shapes (only the fields Argos reads) ------------------------------ */

export interface SyncProject {
  id: string;
  name: string;
  color?: string;
  is_favorite?: boolean;
  inbox_project?: boolean;
  is_deleted?: boolean;
  is_archived?: boolean;
  child_order?: number;
}

export interface SyncItem {
  id: string;
  project_id: string;
  content: string;
  description?: string;
  due?: { date?: string; string?: string; is_recurring?: boolean } | null;
  priority?: number;
  labels?: string[];
  checked?: boolean;
  is_deleted?: boolean;
  parent_id?: string | null;
  child_order?: number;
}

export interface SyncResponse {
  sync_token: string;
  full_sync: boolean;
  projects?: SyncProject[];
  items?: SyncItem[];
}

const projectOf = (p: SyncProject): MirrorProject => ({
  id: p.id,
  name: p.name,
  color: todoistColor(p.color),
  favorite: p.is_favorite === true,
  inbox: p.inbox_project === true,
  order: p.child_order ?? 0,
});

const itemOf = (i: SyncItem): MirrorItem => ({
  id: i.id,
  projectId: i.project_id,
  content: i.content,
  description: i.description ?? "",
  due: i.due?.date ?? null,
  dueString: i.due?.string ?? null,
  recurring: i.due?.is_recurring === true,
  priority: i.priority ?? 1,
  labels: i.labels ?? [],
  parentId: i.parent_id ?? null,
  order: i.child_order ?? 0,
});

/* --- applying a sync -------------------------------------------------------------- */

export interface DeletedProject {
  project: MirrorProject;
  items: MirrorItem[];
}

export interface SyncOutcome {
  mirror: MirrorFile;
  /** Deleted in Todoist (not from Argos): to become an Argos list with its tasks. */
  deletedProjects: DeletedProject[];
  /** Deleted in Todoist while their list still exists: to become Argos tasks in that list. */
  deletedItems: MirrorItem[];
  /**
   * After a full re-sync on an existing copy: ids that vanished without a
   * reason. The caller asks Todoist about each (404 = deleted) and passes the
   * answer to `resolveVanished`.
   */
  vanishedProjects: string[];
  vanishedItems: string[];
  /** Whether the copy's content (not just the token) changed. */
  changed: boolean;
}

export function applySync(prev: MirrorFile, res: SyncResponse): SyncOutcome {
  const projects = { ...prev.projects };
  const items = { ...prev.items };
  const argosDeleted = new Set(prev.argosDeleted);
  const deletedProjects: DeletedProject[] = [];
  const deletedItems: MirrorItem[] = [];
  let changed = false;

  const dropItemsOf = (projectId: string): MirrorItem[] => {
    const gone = Object.values(items).filter((i) => i.projectId === projectId);
    for (const i of gone) delete items[i.id];
    return gone;
  };

  if (res.full_sync) {
    // A first sync fills the copy. A later full sync (Todoist reset the
    // token) rebuilds it, and whatever vanished is checked one by one.
    const nextProjects: Record<string, MirrorProject> = {};
    const nextItems: Record<string, MirrorItem> = {};
    for (const p of res.projects ?? []) {
      if (!p.is_deleted && !p.is_archived && p.id !== PLAN_PROJESI) nextProjects[p.id] = projectOf(p);
    }
    for (const i of res.items ?? []) {
      if (!i.is_deleted && !i.checked && nextProjects[i.project_id]) nextItems[i.id] = itemOf(i);
    }
    // An empty copy is a first sync; a migrated one (no token, old data) is a re-sync.
    const first = prev.syncToken === null && Object.keys(prev.items).length === 0 && Object.keys(prev.projects).length === 0;
    const vanishedProjects = first ? [] : Object.keys(prev.projects).filter((id) => !nextProjects[id]);
    const vanishedItems = first
      ? []
      : Object.keys(prev.items).filter((id) => !nextItems[id] && !vanishedProjects.includes(prev.items[id]!.projectId));
    return {
      // Nothing was copied before a first sync, so no deletion from Argos is pending.
      mirror: { version: MIRROR_VERSION, syncToken: res.sync_token, projects: nextProjects, items: nextItems, argosDeleted: first ? [] : [...argosDeleted] },
      deletedProjects: [],
      deletedItems: [],
      vanishedProjects,
      vanishedItems,
      changed: true,
    };
  }

  // Projects first: a deleted project takes its items with it.
  for (const p of res.projects ?? []) {
    // The Asistan's plan slots come and go by design; they are never kept.
    if (p.id === PLAN_PROJESI) continue;
    const old = projects[p.id];
    if (p.is_deleted || p.is_archived) {
      if (!old) continue;
      delete projects[p.id];
      const its = dropItemsOf(p.id);
      changed = true;
      // Deleted from Argos, or archived (hidden, not lost): nothing to keep.
      if (argosDeleted.delete(`project:${p.id}`) || p.is_archived) continue;
      deletedProjects.push({ project: old, items: its });
      continue;
    }
    const next = projectOf(p);
    if (JSON.stringify(old) !== JSON.stringify(next)) {
      projects[p.id] = next;
      changed = true;
    }
  }

  for (const i of res.items ?? []) {
    const old = items[i.id];
    if (i.is_deleted) {
      const fromArgos = argosDeleted.delete(`item:${i.id}`);
      if (!old) {
        if (fromArgos) changed = true;
        continue;
      }
      delete items[i.id];
      changed = true;
      if (!fromArgos) deletedItems.push(old);
      continue;
    }
    if (i.checked || !projects[i.project_id]) {
      if (old) {
        delete items[i.id];
        changed = true;
      }
      continue;
    }
    const next = itemOf(i);
    if (JSON.stringify(old) !== JSON.stringify(next)) {
      items[i.id] = next;
      changed = true;
    }
  }

  return {
    mirror: { version: MIRROR_VERSION, syncToken: res.sync_token, projects, items, argosDeleted: [...argosDeleted] },
    deletedProjects,
    deletedItems,
    vanishedProjects: [],
    vanishedItems: [],
    changed,
  };
}

/**
 * Turns vanished ids into deletions, using the previous copy for their data.
 * `deleted(id)` is Todoist's answer: true when it no longer knows the id.
 */
export function resolveVanished(
  prev: MirrorFile,
  outcome: SyncOutcome,
  deletedProjectIds: Set<string>,
  deletedItemIds: Set<string>,
): SyncOutcome {
  const argosDeleted = new Set(outcome.mirror.argosDeleted);
  const deletedProjects: DeletedProject[] = [];
  for (const id of outcome.vanishedProjects) {
    const project = prev.projects[id];
    if (!project || !deletedProjectIds.has(id) || argosDeleted.delete(`project:${id}`)) continue;
    deletedProjects.push({ project, items: Object.values(prev.items).filter((i) => i.projectId === id) });
  }
  const deletedItems: MirrorItem[] = [];
  for (const id of outcome.vanishedItems) {
    const item = prev.items[id];
    if (!item || !deletedItemIds.has(id) || argosDeleted.delete(`item:${id}`)) continue;
    deletedItems.push(item);
  }
  return {
    ...outcome,
    mirror: { ...outcome.mirror, argosDeleted: [...argosDeleted] },
    deletedProjects: [...outcome.deletedProjects, ...deletedProjects],
    deletedItems: [...outcome.deletedItems, ...deletedItems],
  };
}

/** Marks ids about to be deleted from Argos, so their deletion is not kept. */
export function expectDeletion(m: MirrorFile, keys: string[]): MirrorFile {
  const set = new Set(m.argosDeleted);
  for (const k of keys) set.add(k);
  return { ...m, argosDeleted: [...set] };
}

/** The undo of `expectDeletion`, when the Todoist delete failed. */
export function cancelDeletion(m: MirrorFile, keys: string[]): MirrorFile {
  const drop = new Set(keys);
  return { ...m, argosDeleted: m.argosDeleted.filter((k) => !drop.has(k)) };
}

/* --- keeping what Todoist deleted ------------------------------------------------- */

const localDue = (due: string | null): string | null => (due ? (due.length > 10 ? due.slice(0, 16) : due.slice(0, 10)) : null);

function taskInput(i: MirrorItem) {
  const due = localDue(i.due);
  return {
    title: i.content,
    description: i.description,
    due,
    recurrence: i.recurring && i.dueString && due ? ruleFromTodoist(i.dueString, due.slice(0, 10)) : null,
    priority: priorityFromTodoist(i.priority),
    important: i.labels.some((l) => l.toLocaleLowerCase("tr") === ONEMLI_ETIKETI),
  };
}

export interface KeptSummary {
  lists: string[];
  tasks: number;
}

/** Ids come from Todoist's: a sync that runs twice (crash, write conflict) adds nothing twice. */
export const keptListId = (projectId: string): string => `l-td-${projectId}`;
export const keptTaskId = (itemId: string): string => `t-td-${itemId}`;

/**
 * Writes what Todoist deleted into the Argos files: each deleted project
 * becomes an Argos list (same name, colour and favourite) holding its open
 * tasks, plus any tasks already kept in it; each deleted task becomes an
 * Argos task in its Todoist list.
 */
export function keepDeleted(
  lists: ListsFile,
  tasks: TasksFile,
  outcome: Pick<SyncOutcome, "deletedProjects" | "deletedItems">,
  now: string,
): { lists: ListsFile; tasks: TasksFile; summary: KeptSummary } {
  const summary: KeptSummary = { lists: [], tasks: 0 };
  const hasTask = (id: string) => tasks.tasks.some((t) => t.id === id);

  for (const { project, items } of outcome.deletedProjects) {
    const listId = keptListId(project.id);
    if (!lists.lists.some((l) => l.id === listId)) {
      lists = addList(lists, { name: project.name, color: project.color }, listId, now);
      if (project.favorite) lists = updateList(lists, listId, { favorite: true });
      summary.lists.push(project.name);
    }
    for (const i of items) {
      if (hasTask(keptTaskId(i.id))) continue;
      tasks = addTask(tasks, { listId, ...taskInput(i) }, keptTaskId(i.id), now);
      summary.tasks++;
    }
    // Tasks kept earlier in this Todoist list move into its new Argos list.
    for (const t of tasks.tasks.filter((t) => t.listSource === "todoist" && t.listId === project.id)) {
      tasks = updateTask(tasks, t.id, { listId, listSource: undefined });
    }
  }

  for (const i of outcome.deletedItems) {
    if (hasTask(keptTaskId(i.id))) continue;
    tasks = addTask(tasks, { listId: i.projectId, listSource: "todoist", ...taskInput(i) }, keptTaskId(i.id), now);
    summary.tasks++;
  }

  return { lists, tasks, summary };
}
