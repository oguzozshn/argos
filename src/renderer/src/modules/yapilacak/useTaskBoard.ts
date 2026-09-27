import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { todoistTarihi } from "@ortak/gorev-zaman";
import {
  addList,
  addTask,
  deleteList,
  deleteTask,
  newLocalId,
  updateList,
  updateTask,
  type Priority,
} from "@ortak/local-tasks";
import {
  fromLocal,
  fromTodoist,
  listFromLocal,
  listFromTodoist,
  priorityToTodoist,
  taskKey,
  type Task,
  type TaskList,
} from "@ortak/task";
import {
  ONEMLI_ETIKETI,
  PLAN_PROJESI,
  type TodoistGorev,
  type TodoistProje,
  type TodoistTaskPatch,
} from "@ortak/tipler";
import { rescheduleRecurring, todoistRecurrence } from "@ortak/todoist-schedule";
import { turkceTarihCevir } from "@ortak/todoist-tarih";
import type { Schedule } from "@/ui/DatePicker";
import { bildir, deferWithUndo, silVeBildir } from "@/ui/toast";
import { kopru, useBugun } from "@/veri/kanca";
import { completeLocalWithUndo, useLocalTasks } from "@/veri/local-tasks";

/**
 * Everything the task screen needs: Todoist projects and tasks, Argos-local
 * lists and tasks, merged into one `TaskList[]` / `Task[]`, plus every action
 * routed to the right source. The screen never checks where a task lives.
 */

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fail = (text: string) => (e: unknown) => bildir({ metin: `${text} ${message(e)}`, tur: "hata" });

export interface NewTaskInput {
  title: string;
  description?: string;
  schedule: Schedule | null;
  priority: Priority;
  important: boolean;
}

/** Todoist keeps the due string as typed, which may be Turkish; the API needs English. */
const englishDue = (s: string): string => (/^every\b/i.test(s.trim()) ? s : (turkceTarihCevir(s) ?? s));

/** The due_string that stores a picker result on a Todoist task (null clears the date). */
function todoistDueText(task: Task | null, sched: Schedule): string | null {
  if (!sched.date) return null;
  if (sched.repeat.kind === "rule") return todoistRecurrence(sched.repeat.rule, sched.date, sched.time);
  if (sched.repeat.kind === "keep" && task?.recurring && task.todoistDueString) {
    return rescheduleRecurring(englishDue(task.todoistDueString), sched.date, sched.time);
  }
  return todoistTarihi(sched.date, sched.time);
}

/** Todoist is re-read on focus at most this often, so phone edits show up. */
const FOCUS_REFRESH_MS = 60_000;

export type TodoistStatus = "loading" | "ready" | "noKey" | "error";

export function useTaskBoard() {
  const today = useBugun();
  const local = useLocalTasks();
  const { changeLists, changeTasks } = local;

  const [status, setStatus] = useState<TodoistStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [keyPath, setKeyPath] = useState("");
  const [projects, setProjects] = useState<TodoistProje[]>([]);
  const [todoTasks, setTodoTasks] = useState<TodoistGorev[]>([]);
  /** Rows removed on screen whose delete waits for the undo toast to close. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const lastLoad = useRef(0);
  const inboxId = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setStatus("noKey");
      return;
    }
    lastLoad.current = Date.now();
    try {
      const d = await k.todoist.durum();
      setKeyPath(d.gizliYolu);
      if (!d.anahtarVar) {
        setStatus("noKey");
        return;
      }
      const [p, t] = await Promise.all([k.todoist.projeler(), k.todoist.allTasks()]);
      setProjects(p.filter((x) => x.id !== PLAN_PROJESI));
      setTodoTasks(t);
      inboxId.current = p.find((x) => x.inbox)?.id ?? null;
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(message(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Quick capture, the task edits and Telegram all announce Todoist changes.
  useEffect(() => kopru()?.todoistDegisimDinle(() => void reload()), [reload]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastLoad.current > FOCUS_REFRESH_MS) void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  /* --- merged view -------------------------------------------------------- */

  const lists = useMemo<TaskList[]>(
    () => [
      ...[...projects].sort((a, b) => a.order - b.order).map(listFromTodoist),
      ...local.lists.map(listFromLocal),
    ],
    [projects, local.lists],
  );

  const tasks = useMemo<Task[]>(
    () =>
      [
        ...todoTasks.map((g) => fromTodoist(g)),
        ...local.tasks.filter((t) => !t.completedAt).map(fromLocal),
      ].filter((t) => !hidden.has(t.key)),
    [todoTasks, local.tasks, hidden],
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      const key = taskKey(t.source, t.listId);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  /* --- helpers --------------------------------------------------------------- */

  const patchTodoist = (id: string, f: (g: TodoistGorev) => TodoistGorev) =>
    setTodoTasks((all) => all.map((g) => (g.id === id ? f(g) : g)));
  const putTodoist = (g: TodoistGorev) => setTodoTasks((all) => all.map((x) => (x.id === g.id ? g : x)));
  const todoistTask = (id: string): TodoistGorev | undefined => todoTasks.find((t) => t.id === id);
  const hide = (key: string, on: boolean) =>
    setHidden((h) => {
      const next = new Set(h);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Optimistic Todoist edit of text fields or priority; reverts on failure. */
  const editTodoist = async (
    task: Task,
    patch: TodoistTaskPatch,
    optimistic: (g: TodoistGorev) => TodoistGorev,
    errorText: string,
  ) => {
    const k = kopru();
    const before = todoistTask(task.id);
    if (!k || !before) return;
    patchTodoist(task.id, optimistic);
    try {
      putTodoist(await k.todoist.updateTask(task.id, patch));
    } catch (e) {
      putTodoist(before);
      fail(errorText)(e);
    }
  };

  /* --- task actions ------------------------------------------------------------ */

  const complete = async (task: Task) => {
    const k = kopru();
    if (task.source === "local") {
      await completeLocalWithUndo(local, task.id, today);
      return;
    }
    if (!k) return;
    if (task.recurring) {
      // Todoist moves a recurring task to its next date itself; reopening
      // would not bring the old date back, so there is no undo here.
      try {
        await k.todoist.kapat(task.id);
        bildir({ metin: `"${task.title}" tamamlandı · sıradaki tarihine kaydı.` });
        await reload();
      } catch (e) {
        fail("Görev tamamlanamadı.")(e);
      }
      return;
    }
    const before = todoistTask(task.id);
    if (!before) return;
    const putBack = () => setTodoTasks((all) => [before, ...all.filter((x) => x.id !== before.id)]);
    setTodoTasks((all) => all.filter((x) => x.id !== task.id));
    silVeBildir({
      metin: `"${task.title}" tamamlandı.`,
      hataMetni: "Görev tamamlanamadı.",
      sil: () =>
        k.todoist.kapat(task.id).then(
          () => true,
          () => {
            putBack();
            return false;
          },
        ),
      geriKoy: () =>
        k.todoist.ac(task.id).then(
          () => {
            putBack();
            return true;
          },
          () => false,
        ),
    });
  };

  const remove = (task: Task) => {
    const k = kopru();
    deferWithUndo({
      metin: `"${task.title}" silindi.`,
      hataMetni: "Görev silinemedi.",
      apply: () => hide(task.key, true),
      revert: () => hide(task.key, false),
      commit: async () => {
        if (task.source === "local") {
          const ok = await changeTasks((f) => deleteTask(f, task.id));
          if (ok) hide(task.key, false);
          return ok;
        }
        if (!k) return false;
        await k.todoist.deleteTask(task.id);
        setTodoTasks((all) => all.filter((x) => x.id !== task.id));
        hide(task.key, false);
        return true;
      },
    });
  };

  /**
   * Applies a picker result. Argos tasks store date, time and rule directly.
   * Todoist gets a due_string: a new rule is spelled out, "keep" on a
   * recurring task restarts its existing rule from the new date, anything
   * else is a plain date - so rescheduling never silently drops a rule.
   */
  const setSchedule = async (task: Task, sched: Schedule) => {
    const due = sched.date ? (sched.time ? `${sched.date}T${sched.time}` : sched.date) : null;
    if (task.source === "local") {
      const patch: Parameters<typeof updateTask>[2] = { due };
      if (sched.repeat.kind === "none") patch.recurrence = null;
      if (sched.repeat.kind === "rule") patch.recurrence = sched.repeat.rule;
      await changeTasks((f) => updateTask(f, task.id, patch));
      return;
    }
    const k = kopru();
    const before = todoistTask(task.id);
    if (!k || !before) return;
    const text = todoistDueText(task, sched);
    patchTodoist(task.id, (g) => ({
      ...g,
      tarih: due,
      tekrarli: sched.repeat.kind === "rule" || (sched.repeat.kind === "keep" && g.tekrarli && !!due),
    }));
    try {
      putTodoist(await k.todoist.tarihVer(task.id, text));
    } catch (e) {
      putTodoist(before);
      fail("Tarih değiştirilemedi.")(e);
    }
  };

  /** Moves the date, keeping the time of day and any repeat rule. Null clears the date. */
  const setDate = (task: Task, iso: string | null) =>
    setSchedule(task, {
      date: iso,
      time: iso && task.due && task.due.length > 10 ? task.due.slice(11, 16) : null,
      repeat: iso ? { kind: "keep" } : { kind: "none" },
    });

  const rename = async (task: Task, title: string) => {
    const clean = title.trim();
    if (!clean || clean === task.title) return;
    if (task.source === "local") {
      await changeTasks((f) => updateTask(f, task.id, { title: clean }));
      return;
    }
    await editTodoist(task, { title: clean }, (g) => ({ ...g, icerik: clean }), "Başlık değiştirilemedi.");
  };

  const setDescription = async (task: Task, description: string) => {
    if (description === task.description) return;
    if (task.source === "local") {
      await changeTasks((f) => updateTask(f, task.id, { description }));
      return;
    }
    await editTodoist(task, { description }, (g) => ({ ...g, aciklama: description }), "Açıklama kaydedilemedi.");
  };

  const setPriority = async (task: Task, priority: Priority) => {
    if (task.source === "local") {
      await changeTasks((f) => updateTask(f, task.id, { priority }));
      return;
    }
    await editTodoist(task, { priority }, (g) => ({ ...g, oncelik: priorityToTodoist(priority) }), "Öncelik değiştirilemedi.");
  };

  const toggleImportant = async (task: Task) => {
    const important = !task.important;
    if (task.source === "local") {
      await changeTasks((f) => updateTask(f, task.id, { important }));
      return;
    }
    const k = kopru();
    const before = todoistTask(task.id);
    if (!k || !before) return;
    patchTodoist(task.id, (g) => ({
      ...g,
      etiketler: important
        ? [...g.etiketler, ONEMLI_ETIKETI]
        : g.etiketler.filter((e) => e.toLocaleLowerCase("tr") !== ONEMLI_ETIKETI),
    }));
    try {
      putTodoist(await k.todoist.onemliYap(task.id, important));
    } catch (e) {
      putTodoist(before);
      fail("Önemli işareti değiştirilemedi.")(e);
    }
  };

  /** Moves a task to another list of the same source. */
  const move = async (task: Task, list: TaskList) => {
    if (list.source !== task.source || list.id === task.listId) return;
    if (task.source === "local") {
      await changeTasks((f) => updateTask(f, task.id, { listId: list.id }));
      bildir({ metin: `"${task.title}" → ${list.name}` });
      return;
    }
    const k = kopru();
    const before = todoistTask(task.id);
    if (!k || !before) return;
    patchTodoist(task.id, (g) => ({ ...g, projeId: list.id }));
    try {
      await k.todoist.moveTask(task.id, list.id);
      bildir({ metin: `"${task.title}" → ${list.name}` });
    } catch (e) {
      putTodoist(before);
      fail("Görev taşınamadı.")(e);
    }
  };

  /** Creates a task in a list of either source. Resolves true on success. */
  const createTask = async (list: TaskList, input: NewTaskInput): Promise<boolean> => {
    const title = input.title.trim();
    if (!title) return false;
    const sched = input.schedule;
    if (list.source === "local") {
      return changeTasks((f) =>
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
        tarihMetni: sched ? (todoistDueText(null, sched) ?? undefined) : undefined,
        oncelik: input.priority < 4 ? priorityToTodoist(input.priority) : undefined,
        description: input.description,
        labels: input.important ? [ONEMLI_ETIKETI] : undefined,
      });
      setTodoTasks((all) => [...all, created]);
      return true;
    } catch (e) {
      fail("Görev eklenemedi.")(e);
      return false;
    }
  };

  /* --- list actions -------------------------------------------------------------- */

  const toggleFavorite = async (list: TaskList) => {
    const favorite = !list.favorite;
    if (list.source === "local") {
      await changeLists((f) => updateList(f, list.id, { favorite }));
      return;
    }
    const k = kopru();
    if (!k) return;
    setProjects((all) => all.map((p) => (p.id === list.id ? { ...p, favorite } : p)));
    try {
      await k.todoist.setProjectFavorite(list.id, favorite);
    } catch (e) {
      setProjects((all) => all.map((p) => (p.id === list.id ? { ...p, favorite: !favorite } : p)));
      fail("Favori değiştirilemedi.")(e);
    }
  };

  /** Creates an Argos list and returns its key, or null if the write failed. */
  const createList = async (name: string): Promise<string | null> => {
    if (!name.trim()) return null;
    const id = newLocalId("l");
    const ok = await changeLists((f) => addList(f, { name }, id, new Date().toISOString()));
    return ok ? taskKey("local", id) : null;
  };

  const renameList = (list: TaskList, name: string) =>
    name.trim() && list.source === "local" ? changeLists((f) => updateList(f, list.id, { name })) : Promise.resolve(false);

  const recolorList = (list: TaskList, color: string) =>
    list.source === "local" ? changeLists((f) => updateList(f, list.id, { color })) : Promise.resolve(false);

  /** Deletes an Argos list and its tasks; undo writes both back. */
  const removeList = async (list: TaskList) => {
    if (list.source !== "local") return;
    const oldList = local.lists.find((l) => l.id === list.id);
    const oldTasks = local.tasks.filter((t) => t.listId === list.id);
    if (!oldList) return;
    const emptyTasks = { version: 1 as const, tasks: [] };
    await changeTasks((f) => deleteList({ version: 1, lists: [] }, f, list.id).tasks);
    await changeLists((f) => deleteList(f, emptyTasks, list.id).lists);
    bildir({
      metin: `"${list.name}" listesi silindi${oldTasks.length ? ` (${oldTasks.length} görevle)` : ""}.`,
      geriAl: async () => {
        const a = await changeLists((f) => ({ ...f, lists: [...f.lists, oldList] }));
        const b = await changeTasks((f) => ({ ...f, tasks: [...f.tasks, ...oldTasks] }));
        return a && b;
      },
    });
  };

  return {
    today,
    status,
    error,
    keyPath,
    localError: local.error,
    loading: status === "loading" || local.loading,
    lists,
    tasks,
    counts,
    inboxKey: inboxId.current ? taskKey("todoist", inboxId.current) : null,
    reload,
    complete,
    remove,
    setDate,
    setSchedule,
    rename,
    setDescription,
    setPriority,
    toggleImportant,
    move,
    createTask,
    toggleFavorite,
    createList,
    renameList,
    recolorList,
    removeList,
  };
}

export type TaskBoard = ReturnType<typeof useTaskBoard>;
