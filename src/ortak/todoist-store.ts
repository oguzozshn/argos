// Explicit .ts extensions: this file also runs under plain Node (araclar/todoist-store-test.mts).
import { onemliMi, type TodoistGorev, type TodoistProje } from "./tipler.ts";
import { tarihMetniTurkce } from "./todoist-tarih.ts";
import type { MirrorFile, MirrorItem, MirrorProject } from "./todoist-mirror.ts";

/**
 * The screens' Todoist queries, answered from Argos's own copy instead of
 * the network. Each one returns what the Todoist endpoint it replaces
 * returned (same shape, same filter), so the screens do not change and
 * work the same offline.
 */

export const projectFromStore = (p: MirrorProject): TodoistProje => ({
  id: p.id,
  ad: p.name,
  inbox: p.inbox,
  color: p.color,
  favorite: p.favorite,
  order: p.order,
});

export const taskFromStore = (i: MirrorItem): TodoistGorev => ({
  id: i.id,
  icerik: i.content,
  aciklama: i.description,
  projeId: i.projectId,
  tarih: i.due,
  tarihMetni: tarihMetniTurkce(i.dueString),
  dueString: i.dueString,
  tekrarli: i.recurring,
  oncelik: i.priority,
  etiketler: i.labels,
  altGorev: i.parentId !== null,
});

const day = (t: TodoistGorev): string | null => t.tarih?.slice(0, 10) ?? null;

/** Projects in Todoist's sidebar order. */
export const storeProjects = (m: MirrorFile): TodoistProje[] =>
  Object.values(m.projects)
    .sort((a, b) => a.order - b.order)
    .map(projectFromStore);

/** Every open task (the plan project is never in the copy). */
export const storeTasks = (m: MirrorFile): TodoistGorev[] =>
  Object.values(m.items)
    .sort((a, b) => a.order - b.order)
    .map(taskFromStore);

export const storeProjectTasks = (m: MirrorFile, projectId: string): TodoistGorev[] =>
  storeTasks(m).filter((t) => t.projeId === projectId);

/** Todoist's "today | overdue". */
export const storeTodayAndOverdue = (m: MirrorFile, today: string): TodoistGorev[] =>
  storeTasks(m).filter((t) => {
    const d = day(t);
    return d !== null && d <= today;
  });

/** Todoist's "due after: from & due before: to": both ends excluded. */
export const storeRange = (m: MirrorFile, from: string, to: string): TodoistGorev[] =>
  storeTasks(m).filter((t) => {
    const d = day(t);
    return d !== null && d > from && d < to;
  });

export const storeImportant = (m: MirrorFile): TodoistGorev[] => storeTasks(m).filter(onemliMi);

export const storeRecurring = (m: MirrorFile): TodoistGorev[] => storeTasks(m).filter((t) => t.tekrarli);

/** Whether the copy has been filled at least once; before that the screens still ask Todoist. */
export const storeReady = (m: MirrorFile): boolean => m.syncToken !== null;
