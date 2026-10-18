import { useCallback, useEffect, useMemo, useState } from "react";
import { todoistTarihi } from "@ortak/gorev-zaman";
import { addTask, newLocalId, type Priority, type Reminder, type TasksFile } from "@ortak/local-tasks";
import { setTodoistReminders, type RemindersFile } from "@ortak/reminders";
import { listFromLocal, listFromTodoist, priorityToTodoist, type TaskList } from "@ortak/task";
import { ONEMLI_ETIKETI, PLAN_PROJESI, type TodoistGorev, type TodoistProje } from "@ortak/tipler";
import { todoistRecurrence } from "@ortak/todoist-schedule";
import type { Schedule } from "@/ui/DatePicker";
import { bildir } from "@/ui/toast";
import { kopru, useBugun } from "./kanca";
import { useLocalTasks } from "./local-tasks";
import { useTodoistReminders } from "./reminders";

/**
 * Creating a task from the add box, wherever it is open: Yapılacaklar or the
 * Takvim day panel (issue #45). Both get the same box and the same result.
 */

export interface NewTaskInput {
  title: string;
  description?: string;
  schedule: Schedule | null;
  priority: Priority;
  important: boolean;
  reminders?: Reminder[];
}

/** What the add box needs from the screen it is on. */
export interface TaskComposerTarget {
  today: string;
  lists: TaskList[];
  createTask: (list: TaskList, input: NewTaskInput) => Promise<boolean>;
}

/** The due string a new Todoist task gets from the picker. */
export function newTaskDueText(sched: Schedule): string | null {
  if (!sched.date) return null;
  if (sched.repeat.kind === "rule") return todoistRecurrence(sched.repeat.rule, sched.date, sched.time);
  return todoistTarihi(sched.date, sched.time);
}

const message = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (\w+: )?/, "");

/**
 * Adds the task to its list: an Argos list writes the local file, a Todoist
 * project goes through Todoist (queued, so offline too) and its reminders
 * are stored with it. Returns the Todoist task when one was made, true for
 * an Argos task, false when nothing was added.
 */
export async function createTaskIn(
  list: TaskList,
  input: NewTaskInput,
  deps: {
    changeTasks: (f: (file: TasksFile) => TasksFile) => Promise<boolean>;
    changeReminders: (f: (file: RemindersFile) => RemindersFile) => Promise<boolean>;
  },
): Promise<TodoistGorev | boolean> {
  const title = input.title.trim();
  if (!title) return false;
  const sched = input.schedule;
  if (list.source === "local") {
    return deps.changeTasks((f) =>
      addTask(
        f,
        {
          listId: list.id,
          title,
          description: input.description,
          due: sched?.date ? (sched.time ? `${sched.date}T${sched.time}` : sched.date) : null,
          recurrence: sched?.repeat.kind === "rule" ? sched.repeat.rule : null,
          priority: input.priority,
          important: input.important,
          reminders: input.reminders,
        },
        newLocalId("t"),
        new Date().toISOString(),
      ),
    );
  }
  const k = kopru();
  if (!k) return false;
  try {
    const created = await k.todoist.ekle({
      icerik: title,
      projeId: list.id,
      tarihMetni: sched ? (newTaskDueText(sched) ?? undefined) : undefined,
      oncelik: input.priority < 4 ? priorityToTodoist(input.priority) : undefined,
      description: input.description,
      labels: input.important ? [ONEMLI_ETIKETI] : undefined,
    });
    if (input.reminders?.length) {
      await deps.changeReminders((f) =>
        setTodoistReminders(f, created.id, {
          title: created.icerik,
          due: created.tarih ? created.tarih.slice(0, 16) : null,
          reminders: input.reminders!,
        }),
      );
    }
    return created;
  } catch (e) {
    bildir({ metin: `Görev eklenemedi. ${message(e)}`, tur: "hata" });
    return false;
  }
}

/**
 * The add box's target for a screen that does not hold the whole task board
 * (Takvim): every list, Todoist projects first, and a create that writes
 * where the box says.
 */
export function useTaskComposerTarget(): TaskComposerTarget & { inbox: TaskList | null } {
  const today = useBugun();
  const local = useLocalTasks();
  const reminders = useTodoistReminders();
  const [projects, setProjects] = useState<TodoistProje[]>([]);

  useEffect(() => {
    const k = kopru();
    if (!k) return;
    let gone = false;
    const load = () =>
      void k.todoist
        .durum()
        .then((d) => (d.anahtarVar ? k.todoist.projeler() : []))
        .then((p) => !gone && setProjects(p.filter((x) => x.id !== PLAN_PROJESI)))
        .catch(() => undefined);
    load();
    const off = k.todoistDegisimDinle(load);
    return () => {
      gone = true;
      off();
    };
  }, []);

  const lists = useMemo<TaskList[]>(
    () => [...[...projects].sort((a, b) => a.order - b.order).map(listFromTodoist), ...local.lists.map(listFromLocal)],
    [projects, local.lists],
  );

  const { changeTasks } = local;
  const changeReminders = reminders.change;
  const createTask = useCallback(
    async (list: TaskList, input: NewTaskInput) =>
      (await createTaskIn(list, input, { changeTasks, changeReminders })) !== false,
    [changeTasks, changeReminders],
  );

  return { today, lists, createTask, inbox: lists.find((l) => l.inbox) ?? null };
}
