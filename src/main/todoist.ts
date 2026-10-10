import { existsSync, readFileSync } from "node:fs";
import type {
  TodoistDurum,
  TodoistGorev,
  TodoistProje,
  TodoistProjectPatch,
  TodoistTaskPatch,
} from "../ortak/tipler";
import { ayar, ayarKaydet } from "./ayar";
import { jsonCoz } from "./veri-cekirdek";
import * as cekirdek from "./todoist-cekirdek";
import { randomUUID } from "node:crypto";
import type { MirrorFile, MirrorItem } from "../ortak/todoist-mirror";
import * as store from "../ortak/todoist-store";
import * as q from "../ortak/todoist-outbox";
import { TODOIST_COLORS, todoistColor } from "../ortak/task";
import { bugunIso } from "../ortak/plan";
import { dataDir } from "./veri";
import { cancelQueuedClose, enqueue, readOutbox, readView } from "./todoist-sync-core";
import { TodoistHata, type YeniGorev } from "./todoist-cekirdek";

/**
 * Çekirdeğin (todoist-cekirdek.ts) Electron'a bağlanan ince kabuğu: anahtarı
 * bulur ve her çağrıya geçirir.
 *
 * API anahtarı BU DOSYADAN çıkmaz — arayüz yalnızca sonuçları görür.
 */

/** Anahtar dosyasının yolu; ayarlanabilir, varsayılan eski deponun yanı. */
export const gizliYolu = (): string =>
  ayar("gizliYolu", "../personnal_assistant/gizli.json", process.env.ARGOS_GIZLI);

/**
 * Kullanıcının seçtiği anahtar dosyasını kalıcı ayara yazar.
 *
 * Sıfırlanacak bir şey yok: `gizliYolu` her çağrıda diskten okunuyor.
 */
export async function gizliAyarla(yol: string): Promise<void> {
  await ayarKaydet("gizliYolu", yol.split("\\").join("/"));
}

/** Anahtarı her çağrıda diskten okur: dosya değişince yeniden başlatmak gerekmesin. */
function anahtar(): string | null {
  try {
    const f = gizliYolu();
    if (!existsSync(f)) return null;
    const g = jsonCoz<{ todoistToken?: string }>(readFileSync(f, "utf8"));
    return g.todoistToken?.trim() || null;
  } catch {
    return null;
  }
}

function jeton(): string {
  const t = anahtar();
  if (!t) throw new TodoistHata("Todoist anahtarı yok");
  return t;
}

export function durum(): TodoistDurum {
  return { anahtarVar: anahtar() !== null, gizliYolu: gizliYolu() };
}

/* --- writes: queued (see ortak/todoist-outbox.ts) ----------------------------
 * A write is applied to the view at once and waits in the outbox until
 * Todoist confirms it, so it works offline. Before the copy's first sync, or
 * for a task outside it (the plan project), it still goes straight to Todoist.
 */

const clock = (): q.Clock => ({ uuid: randomUUID, now: new Date().toISOString(), today: bugunIso() });

/** Set by todoist-sync.ts: a queued write asks for a send. */
let onQueued: () => void = () => undefined;
export function whenQueued(f: () => void): void {
  onQueued = f;
}
const queued = (): void => onQueued();

/** Tasks closed from Argos, so an undo after the close was sent can bring them back as they were. */
const recentlyClosed = new Map<string, MirrorItem>();

/** Queues a write to a task in the copy; null from `live` means the direct call returns nothing. */
async function queuedItem<T extends TodoistGorev | null>(
  id: string,
  build: (item: MirrorItem, c: q.Clock) => q.OutboxCommand,
  live: () => Promise<T>,
): Promise<TodoistGorev | T> {
  const root = dataDir();
  const [view, { outbox }] = await Promise.all([readView(root), readOutbox(root)]);
  const item = view.items[outbox.tempIds[id] ?? id];
  if (!store.storeReady(view) || !item) return live();
  await enqueue(root, build(item, clock()));
  queued();
  const after = (await readView(root)).items[item.id];
  return store.taskFromStore(after ?? item);
}

async function queuedProject(
  id: string,
  build: (c: q.Clock) => q.OutboxCommand,
  live: () => Promise<TodoistProje>,
): Promise<TodoistProje> {
  const root = dataDir();
  const view = await readView(root);
  const project = view.projects[id];
  if (!store.storeReady(view) || !project) return live();
  await enqueue(root, build(clock()));
  queued();
  return store.projectFromStore((await readView(root)).projects[id] ?? project);
}

/* --- reads: from Argos's copy ------------------------------------------------
 * Once the copy has been filled (see todoist-sync.ts), every read the screens
 * make is answered from it, online or not. Only before the very first sync
 * do they still ask Todoist.
 */
async function fromStore<T>(query: (m: MirrorFile) => T, live: () => Promise<T>): Promise<T> {
  const m = await readView(dataDir());
  return store.storeReady(m) ? query(m) : live();
}

export const projeler = (): Promise<TodoistProje[]> =>
  fromStore(store.storeProjects, () => cekirdek.projeler(jeton()));

export const gorevler = (projeId: string): Promise<TodoistGorev[]> =>
  cekirdek.gorevler(jeton(), projeId);

export const bugunVeGecikmis = (): Promise<TodoistGorev[]> =>
  fromStore((m) => store.storeTodayAndOverdue(m, bugunIso()), () => cekirdek.bugunVeGecikmis(jeton()));

export const tarihAraligi = (bas: string, son: string): Promise<TodoistGorev[]> =>
  fromStore((m) => store.storeRange(m, bas, son), () => cekirdek.tarihAraligi(jeton(), bas, son));

export const onemliler = (): Promise<TodoistGorev[]> => fromStore(store.storeImportant, () => cekirdek.onemliler(jeton()));

export const onemliYap = (id: string, onemli: boolean): Promise<TodoistGorev> =>
  queuedItem(id, (item, c) => q.setImportant(item, onemli, c), () => cekirdek.onemliYap(jeton(), id, onemli));

export const allTasks = (): Promise<TodoistGorev[]> => fromStore(store.storeTasks, () => cekirdek.allTasks(jeton()));

export const recurringTasks = (): Promise<TodoistGorev[]> =>
  fromStore(store.storeRecurring, () => cekirdek.recurringTasks(jeton()));

export const updateTask = (id: string, patch: TodoistTaskPatch): Promise<TodoistGorev> =>
  queuedItem(
    id,
    (item, c) =>
      q.updateItem(
        item.id,
        {
          ...(patch.title !== undefined ? { content: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          // Argos's 1 = P1 is Todoist's 4.
          ...(patch.priority !== undefined ? { priority: 5 - patch.priority } : {}),
        },
        c,
      ),
    () => cekirdek.updateTask(jeton(), id, patch),
  );

export const deleteTask = (id: string): Promise<void> => cekirdek.deleteTask(jeton(), id);

export const deleteProject = (id: string): Promise<void> => cekirdek.deleteProject(jeton(), id);

export const syncChanges = (syncToken: string) => cekirdek.syncChanges(jeton(), syncToken);

export const sendCommands = (commands: Record<string, unknown>[]) => cekirdek.sendCommands(jeton(), commands);

export const isGone = (kind: "tasks" | "projects", id: string): Promise<boolean> => cekirdek.isGone(jeton(), kind, id);

export async function moveTask(id: string, projectId: string): Promise<void> {
  await queuedItem(id, (item, c) => q.moveItem(item.id, projectId, c), async () => {
    await cekirdek.moveTask(jeton(), id, projectId);
    return null;
  });
}

export const setProjectFavorite = (id: string, favorite: boolean): Promise<TodoistProje> =>
  queuedProject(id, (c) => q.updateProject(id, { favorite }, c), () => cekirdek.setProjectFavorite(jeton(), id, favorite));

export function updateProject(id: string, patch: TodoistProjectPatch): Promise<TodoistProje> {
  // Same checks as the direct call: refused here, not silently by Todoist later.
  if (patch.name !== undefined && !patch.name.trim()) return Promise.reject(new Error("Proje adı boş olamaz."));
  if (patch.color !== undefined && !(patch.color in TODOIST_COLORS)) {
    return Promise.reject(new Error(`Bilinmeyen Todoist rengi: ${patch.color}`));
  }
  return queuedProject(
    id,
    (c) => q.updateProject(id, { ...patch, ...(patch.color ? { colorHex: todoistColor(patch.color) } : {}) }, c),
    () => cekirdek.updateProject(jeton(), id, patch),
  );
}

export async function ekle(g: YeniGorev): Promise<TodoistGorev> {
  const view = await readView(dataDir());
  if (!store.storeReady(view) || !q.queueable(g.projeId) || !view.projects[g.projeId]) return cekirdek.ekle(jeton(), g);
  const c = q.addItem(
    {
      content: g.icerik,
      projectId: g.projeId,
      description: g.description?.trim() || undefined,
      priority: g.oncelik,
      labels: g.labels,
      dueText: g.tarihMetni?.trim() || null,
    },
    clock(),
  );
  await enqueue(dataDir(), c);
  queued();
  return store.taskFromStore((c.effect as { item: MirrorItem }).item);
}

export async function kapat(id: string): Promise<void> {
  await queuedItem(
    id,
    (item, c) => {
      recentlyClosed.set(item.id, item);
      return q.closeItem(item, c);
    },
    async () => {
      await cekirdek.kapat(jeton(), id);
      return null;
    },
  );
}

/**
 * Undo of a close. Still queued: the close is just dropped. Already sent:
 * a reopen is queued with the task as it was before the close.
 */
export async function ac(id: string): Promise<void> {
  if (await cancelQueuedClose(dataDir(), id)) {
    queued();
    return;
  }
  const snapshot = recentlyClosed.get(id);
  if (!snapshot) return cekirdek.ac(jeton(), id);
  await enqueue(dataDir(), q.reopenItem(snapshot, clock()));
  queued();
}

export const hizliEkle = (metin: string): Promise<TodoistGorev> => cekirdek.hizliEkle(jeton(), metin);

export const tarihVer = (id: string, tarihMetni: string | null): Promise<TodoistGorev> =>
  queuedItem(
    id,
    (item, c) => q.setItemDue(item.id, tarihMetni?.trim() || null, item, c),
    () => cekirdek.tarihVer(jeton(), id, tarihMetni),
  );
