import { bildirimGoster } from "./bildirim";
import { todoistDegistiBildir } from "./tepsi";
import * as td from "./todoist";
import { deleteFromArgos, syncOnce } from "./todoist-sync-core";
import { dataDir } from "./veri";

/**
 * Keeps Argos's Todoist copy current (see ortak/todoist-mirror.ts): shortly
 * after start, every few minutes, and whenever the task screen reloads.
 * Every copy operation runs one at a time, deletions from Argos included,
 * so a sync never reads the copy halfway through a delete.
 */

const INTERVAL_MS = 3 * 60_000;
const FIRST_DELAY_MS = 5_000;

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const run = queue.then(f, f);
  queue = run.catch(() => undefined);
  return run;
}

const api = { sync: td.syncChanges, isGone: td.isGone };

/** One sync. Failures are logged, never thrown: the screens still read Todoist directly. */
export function syncNow(): Promise<void> {
  if (!td.durum().anahtarVar) return Promise.resolve();
  return serial(async () => {
    try {
      const kept = await syncOnce(dataDir(), api, new Date().toISOString());
      if (kept.lists.length === 0 && kept.tasks === 0) return;
      const what =
        kept.lists.length > 0
          ? `${kept.lists.map((n) => `"${n}"`).join(", ")} listesi`
          : `${kept.tasks} görev`;
      bildirimGoster("Todoist'ten silindi, Argos'ta kaldı", `${what} artık Argos'ta duruyor.`);
      todoistDegistiBildir();
    } catch (e) {
      console.error("[todoist-sync]", e);
    }
  });
}

export const deleteTaskFromArgos = (id: string): Promise<void> =>
  serial(() => deleteFromArgos(dataDir(), `item:${id}`, () => td.deleteTask(id)));

export const deleteProjectFromArgos = (id: string): Promise<void> =>
  serial(() => deleteFromArgos(dataDir(), `project:${id}`, () => td.deleteProject(id)));

let timer: ReturnType<typeof setInterval> | null = null;

export function startTodoistSync(): void {
  if (timer) return;
  setTimeout(() => void syncNow(), FIRST_DELAY_MS);
  timer = setInterval(() => void syncNow(), INTERVAL_MS);
}
