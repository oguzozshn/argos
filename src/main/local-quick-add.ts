// Explicit .ts extensions: this file also runs under plain Node (araclar/local-quick-add-test.mts).
import { dueValue, parseDateText } from "../ortak/date-parse.ts";
import {
  LISTS_PATH,
  TASKS_PATH,
  addTask,
  newLocalId,
  normalizeLists,
  normalizeTasks,
  type LocalList,
  type ListsFile,
  type TasksFile,
} from "../ortak/local-tasks.ts";
import { splitQuickAdd } from "../ortak/quick-add.ts";
import { localAsTodoist } from "../ortak/task.ts";
import type { TodoistGorev } from "../ortak/tipler.ts";
import { oku, yaz } from "./veri-cekirdek.ts";

/**
 * Quick capture (Ctrl+Alt+N) and the command palette send one line to Todoist.
 * When the line names an Argos list with "#" ("#Başvurular", or
 * "#KişiselGelişim" for "Kişisel Gelişim"), the task goes there instead.
 */

const simplify = (s: string): string => s.toLocaleLowerCase("tr-TR").replace(/[\s_-]+/g, "");

/** The Argos list a "#tag" in the line points to, with the tag removed. Null when none matches. */
export function findLocalListTag(line: string, lists: LocalList[]): { list: LocalList; rest: string } | null {
  const words = line.trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (!w.startsWith("#") || w.length < 2) continue;
    const list = lists.find((l) => simplify(l.name) === simplify(w.slice(1)));
    if (list) return { list, rest: [...words.slice(0, i), ...words.slice(i + 1)].join(" ") };
  }
  return null;
}

/**
 * Adds the line to an Argos list if it names one. Returns the new task in
 * the Todoist shape (source: "local") so callers can show it, or null when
 * the line is for Todoist.
 */
export async function quickAddLocal(root: string, line: string, today: string, now: string): Promise<TodoistGorev | null> {
  const lists = normalizeLists((await oku<ListsFile>(root, LISTS_PATH)).veri).lists;
  const hit = findLocalListTag(line, lists);
  if (!hit) return null;

  const q = splitQuickAdd(hit.rest, today);
  if (!q.title) throw new Error("Görev adı boş");
  const date = q.dateText ? parseDateText(q.dateText, today) : null;
  const id = newLocalId("t");

  // Read → add → write; if the file changed meanwhile (the task screen wrote), try once more on the new state.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await oku<TasksFile>(root, TASKS_PATH);
    const next = addTask(
      normalizeTasks(current.veri),
      {
        listId: hit.list.id,
        title: q.title,
        due: date ? dueValue(date) : null,
        recurrence: date?.rule ?? null,
        priority: q.priority ?? 4,
        important: q.important,
      },
      id,
      now,
    );
    const written = await yaz(root, TASKS_PATH, next, current.mtime);
    if (written.ok) return localAsTodoist(next.tasks.find((t) => t.id === id)!);
    if (written.sebep === "hata") throw new Error(written.mesaj);
  }
  throw new Error("Argos görev dosyası yazılırken iki kez değişti");
}
