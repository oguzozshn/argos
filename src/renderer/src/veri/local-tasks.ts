import { useCallback, useMemo } from "react";
import {
  LISTS_PATH,
  TASKS_PATH,
  normalizeLists,
  normalizeTasks,
  type ListsFile,
  type LocalList,
  type LocalTask,
  type TasksFile,
} from "@ortak/local-tasks";
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
