import { useCallback, useMemo } from "react";
import {
  LISTS_PATH,
  TASKS_PATH,
  completeTask,
  normalizeLists,
  normalizeTasks,
  restoreTask,
  type ListsFile,
  type LocalList,
  type LocalTask,
  type TasksFile,
} from "@ortak/local-tasks";
import { bildir } from "@/ui/toast";
import { useDosya } from "./kanca";

/**
 * Argos-local lists and tasks, read from the data folder. Lives in the shared
 * layer because Yapılacaklar, Takvim and Bugün all show these tasks.
 *
 * Changes go through `useDosya.degistir`, so each edit builds on the latest
 * state and a conflicting outside write is caught instead of overwritten.
 */
export interface LocalTasksState {
  lists: LocalList[];
  /** Every task in the file, done ones included; screens filter what they need. */
  tasks: LocalTask[];
  loading: boolean;
  error: string | null;
  changeLists: (f: (file: ListsFile) => ListsFile) => Promise<boolean>;
  changeTasks: (f: (file: TasksFile) => TasksFile) => Promise<boolean>;
}

export function useLocalTasks(): LocalTasksState {
  const listsFile = useDosya<ListsFile>(LISTS_PATH);
  const tasksFile = useDosya<TasksFile>(TASKS_PATH);

  const lists = useMemo(
    () => [...normalizeLists(listsFile.veri).lists].sort((a, b) => a.order - b.order),
    [listsFile.veri],
  );
  const tasks = useMemo(() => normalizeTasks(tasksFile.veri).tasks, [tasksFile.veri]);

  const { degistir: writeLists } = listsFile;
  const { degistir: writeTasks } = tasksFile;
  const changeLists = useCallback(
    (f: (file: ListsFile) => ListsFile) => writeLists((current) => f(normalizeLists(current))),
    [writeLists],
  );
  const changeTasks = useCallback(
    (f: (file: TasksFile) => TasksFile) => writeTasks((current) => f(normalizeTasks(current))),
    [writeTasks],
  );

  return {
    lists,
    tasks,
    loading: listsFile.yukleniyor || tasksFile.yukleniyor,
    error: listsFile.hata ?? tasksFile.hata,
    changeLists,
    changeTasks,
  };
}

/**
 * Completes an Argos task and offers undo. A recurring one moves to its next
 * date instead of disappearing; undo puts back exactly what was there.
 */
export async function completeLocalWithUndo(
  state: Pick<LocalTasksState, "tasks" | "changeTasks">,
  id: string,
  today: string,
): Promise<void> {
  const before = state.tasks.find((t) => t.id === id);
  if (!before) return;
  let moved = false;
  const ok = await state.changeTasks((f) => {
    const r = completeTask(f, id, new Date().toISOString(), today);
    moved = r.nextDue !== null;
    return r.file;
  });
  if (!ok) {
    bildir({ metin: "Görev tamamlanamadı.", tur: "hata" });
    return;
  }
  bildir({
    metin: moved ? `"${before.title}" tamamlandı · sıradaki tarihine kaydı.` : `"${before.title}" tamamlandı.`,
    geriAl: () => state.changeTasks((f) => restoreTask(f, before)),
  });
}
