import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dueValue, parseDateText } from "@ortak/date-parse";
import { todoistTarihi } from "@ortak/gorev-zaman";
import {
  addList,
  addTask,
  completeTask,
  deleteList,
  deleteTask,
  newLocalId,
  restoreTask,
  updateList,
  updateTask,
  type LocalTask,
  type Priority,
} from "@ortak/local-tasks";
import { splitQuickAdd } from "@ortak/quick-add";
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
import { ONEMLI_ETIKETI, PLAN_PROJESI, type TodoistGorev, type TodoistProje } from "@ortak/tipler";
import { bildir, deferWithUndo, silVeBildir } from "@/ui/toast";
import { kopru, useBugun } from "@/veri/kanca";
import { useLocalTasks } from "@/veri/local-tasks";

/**
 * Everything the task screen needs: Todoist projects and tasks, Argos-local
 * lists and tasks, merged into one `TaskList[]` / `Task[]`, plus every action
 * routed to the right source. The screen never checks where a task lives.
 */

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fail = (text: string) => (e: unknown) => bildir({ metin: `${text} ${message(e)}`, tur: "hata" });

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
  const localTask = (id: string): LocalTask | undefined => local.tasks.find((t) => t.id === id);
  const todoistTask = (id: string): TodoistGorev | undefined => todoTasks.find((t) => t.id === id);
  const hide = (key: string, on: boolean) =>
    setHidden((h) => {
      const next = new Set(h);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /* --- task actions ------------------------------------------------------------ */

  const complete = async (task: Task) => {
    const k = kopru();
    if (task.source === "local") {
      const before = localTask(task.id);
      if (!before) return;
      let nextDue: string | null = null;
      await changeTasks((f) => {
        const r = completeTask(f, task.id, new Date().toISOString(), today);
        nextDue = r.nextDue;
        return r.file;
      });
      bildir({
        metin: nextDue ? `"${task.title}" tamamlandı · sıradaki tarihine kaydı.` : `"${task.title}" tamamlandı.`,
        geriAl: () => changeTasks((f) => restoreTask(f, before)),
      });
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

  /** Moves the date, keeping the time of day. Null clears the date. */
  const setDate = async (task: Task, iso: string | null) => {
    const time = task.due && task.due.length > 10 ? task.due.slice(11, 16) : null;
    const due = iso ? (time ? `${iso}T${time}` : iso) : null;
    if (task.source === "local") {
      await changeTasks((f) => updateTask(f, task.id, { due }));
      return;
    }
    const k = kopru();
    const before = todoistTask(task.id);
    if (!k || !before) return;
    patchTodoist(task.id, (g) => ({ ...g, tarih: due, tarihMetni: null }));
    try {
      putTodoist(await k.todoist.tarihVer(task.id, iso ? todoistTarihi(iso, time) : null));
    } catch (e) {
      putTodoist(before);
      fail("Tarih değiştirilemedi.")(e);
    }
  };

  const setPriority = async (task: Task, priority: Priority) => {
    if (task.source === "local") {
      await changeTasks((f) => updateTask(f, task.id, { priority }));
      return;
    }
    const k = kopru();
    const before = todoistTask(task.id);
    if (!k || !before) return;
    patchTodoist(task.id, (g) => ({ ...g, oncelik: priorityToTodoist(priority) }));
    try {
      putTodoist(await k.todoist.updateTask(task.id, { priority }));
    } catch (e) {
      putTodoist(before);
      fail("Öncelik değiştirilemedi.")(e);
    }
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

  /** Adds a task from a one-line entry ("fatura öde yarın 18:00 p1 @önemli"). Resolves true on success. */
  const add = async (list: TaskList, line: string): Promise<boolean> => {
    const q = splitQuickAdd(line, today);
    if (!q.title) return false;
    if (list.source === "local") {
      const parsed = q.dateText ? parseDateText(q.dateText, today) : null;
      return changeTasks((f) =>
        addTask(
          f,
          {
            listId: list.id,
            title: q.title,
            due: parsed ? dueValue(parsed) : null,
            recurrence: parsed?.rule ?? null,
            priority: q.priority ?? 4,
            important: q.important,
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
        icerik: q.title,
        projeId: list.id,
        tarihMetni: q.dateText ?? undefined,
        oncelik: q.priority ? priorityToTodoist(q.priority) : undefined,
      });
      setTodoTasks((all) => [...all, created]);
      if (q.important) putTodoist(await k.todoist.onemliYap(created.id, true));
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
    setPriority,
    toggleImportant,
    move,
    add,
    toggleFavorite,
    createList,
    renameList,
    recolorList,
    removeList,
  };
}

export type TaskBoard = ReturnType<typeof useTaskBoard>;
