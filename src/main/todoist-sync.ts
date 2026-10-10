import { app, type BrowserWindow } from "electron";
import { KANAL, type TodoistSyncStatus } from "../ortak/tipler";
import { bildirimGoster } from "./bildirim";
import { todoistDegistiBildir } from "./tepsi";
import * as td from "./todoist";
import { deleteFromArgos, syncOnce } from "./todoist-sync-core";
import { dataDir } from "./veri";

/**
 * Keeps Argos's Todoist copy current (see ortak/todoist-mirror.ts). The
 * screens read only the copy (todoist.ts), so this is what brings phone
 * edits in: shortly after start, every minute, when the window gets focus,
 * and after every write Argos makes. Every copy operation runs one at a
 * time, deletions from Argos included.
 */

const INTERVAL_MS = 60_000;
const FIRST_DELAY_MS = 3_000;
/** Focus brings a sync at most this often. */
const FOCUS_MIN_GAP_MS = 15_000;

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const run = queue.then(f, f);
  queue = run.catch(() => undefined);
  return run;
}

const api = { sync: td.syncChanges, isGone: td.isGone };

let status: TodoistSyncStatus = { online: true, lastSyncAt: null, error: null };
export const syncStatus = (): TodoistSyncStatus => status;

function setStatus(next: TodoistSyncStatus): void {
  const wasOnline = status.online;
  status = next;
  const w = mainWindow();
  if (w && !w.isDestroyed()) w.webContents.send(KANAL.tdSyncDurum, status);
  // Back online: whatever the screens showed from the copy may be stale.
  if (!wasOnline && next.online) todoistDegistiBildir();
}

/** A sync already waiting in the queue serves every caller that comes meanwhile. */
let waiting: Promise<boolean> | null = null;

/**
 * One sync. Resolves with whether the copy changed; never rejects: offline,
 * the screens keep showing the copy and the status says so.
 */
export function syncNow(opts: { notify?: boolean } = {}): Promise<boolean> {
  if (!td.durum().anahtarVar) return Promise.resolve(false);
  if (waiting) return waiting;
  const run = serial(async () => {
    waiting = null;
    try {
      const { kept, changed } = await syncOnce(dataDir(), api, new Date().toISOString());
      setStatus({ online: true, lastSyncAt: new Date().toISOString(), error: null });
      if (kept.lists.length > 0 || kept.tasks > 0) {
        const what = kept.lists.length > 0 ? `${kept.lists.map((n) => `"${n}"`).join(", ")} listesi` : `${kept.tasks} görev`;
        bildirimGoster("Todoist'ten silindi, Argos'ta kaldı", `${what} artık Argos'ta duruyor.`);
      }
      if (changed && opts.notify !== false) todoistDegistiBildir();
      return changed;
    } catch (e) {
      console.error("[todoist-sync]", e);
      setStatus({ online: false, lastSyncAt: status.lastSyncAt, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  });
  waiting = run;
  return run;
}

/**
 * Runs a Todoist write, then syncs before returning, so a screen that
 * reloads afterwards reads the copy with the write already in it.
 */
export async function writeThenSync<R>(write: () => Promise<R>): Promise<R> {
  const r = await write();
  await syncNow({ notify: false });
  return r;
}

export const deleteTaskFromArgos = (id: string): Promise<void> =>
  serial(() => deleteFromArgos(dataDir(), `item:${id}`, () => td.deleteTask(id)));

export const deleteProjectFromArgos = (id: string): Promise<void> =>
  serial(() => deleteFromArgos(dataDir(), `project:${id}`, () => td.deleteProject(id)));

let timer: ReturnType<typeof setInterval> | null = null;
let mainWindow: () => BrowserWindow | null = () => null;

export function startTodoistSync(getMainWindow: () => BrowserWindow | null): void {
  if (timer) return;
  mainWindow = getMainWindow;
  setTimeout(() => void syncNow(), FIRST_DELAY_MS);
  timer = setInterval(() => void syncNow(), INTERVAL_MS);
  let lastFocus = 0;
  app.on("browser-window-focus", () => {
    if (Date.now() - lastFocus < FOCUS_MIN_GAP_MS) return;
    lastFocus = Date.now();
    void syncNow();
  });
}
