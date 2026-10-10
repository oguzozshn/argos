// Explicit .ts extensions: this file also runs under plain Node (araclar/todoist-mirror-test.mts).
import { LISTS_PATH, TASKS_PATH, normalizeLists, normalizeTasks, type ListsFile, type TasksFile } from "../ortak/local-tasks.ts";
import {
  MIRROR_PATH,
  applySync,
  cancelDeletion,
  expectDeletion,
  keepDeleted,
  normalizeMirror,
  resolveVanished,
  type KeptSummary,
  type MirrorFile,
  type SyncResponse,
} from "../ortak/todoist-mirror.ts";
import { oku, yaz } from "./veri-cekirdek.ts";

/**
 * Runs one sync of Argos's Todoist copy against the data folder. The
 * Todoist calls come in as functions so tests can stand in for them.
 */
export interface SyncApi {
  sync(syncToken: string): Promise<SyncResponse>;
  isGone(kind: "tasks" | "projects", id: string): Promise<boolean>;
}

/** More vanished ids than this after a token reset is not a deletion spree; it is left alone. */
const MAX_VANISHED_CHECKS = 30;

async function readMirror(root: string): Promise<{ mirror: MirrorFile; mtime: number | null }> {
  const r = await oku<MirrorFile>(root, MIRROR_PATH);
  return { mirror: normalizeMirror(r.veri), mtime: r.mtime };
}

async function writeMirror(root: string, mirror: MirrorFile, mtime: number | null): Promise<void> {
  const w = await yaz(root, MIRROR_PATH, mirror, mtime);
  if (!w.ok) throw new Error(w.sebep === "hata" ? w.mesaj : "Todoist kopyası yazılırken değişti");
}

export async function syncOnce(root: string, api: SyncApi, now: string): Promise<KeptSummary> {
  const { mirror: prev, mtime } = await readMirror(root);
  let outcome = applySync(prev, await api.sync(prev.syncToken ?? "*"));

  const vanished = [...outcome.vanishedProjects, ...outcome.vanishedItems];
  if (vanished.length > 0 && vanished.length <= MAX_VANISHED_CHECKS) {
    const goneProjects = new Set<string>();
    const goneItems = new Set<string>();
    for (const id of outcome.vanishedProjects) if (await api.isGone("projects", id)) goneProjects.add(id);
    for (const id of outcome.vanishedItems) if (await api.isGone("tasks", id)) goneItems.add(id);
    outcome = resolveVanished(prev, outcome, goneProjects, goneItems);
  }

  // What Todoist deleted goes into the Argos files before the copy forgets it.
  let summary: KeptSummary = { lists: [], tasks: 0 };
  if (outcome.deletedProjects.length > 0 || outcome.deletedItems.length > 0) {
    summary = await writeKept(root, outcome, now);
  }

  if (outcome.changed) await writeMirror(root, outcome.mirror, mtime);
  return summary;
}

/**
 * Read → add → write for both Argos files. A conflict (the task screen wrote
 * meanwhile) retries on the new state; kept ids are fixed, so a retry after
 * one file was already written adds nothing twice.
 */
async function writeKept(root: string, outcome: Parameters<typeof keepDeleted>[2], now: string): Promise<KeptSummary> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const listsRead = await oku<ListsFile>(root, LISTS_PATH);
    const tasksRead = await oku<TasksFile>(root, TASKS_PATH);
    const next = keepDeleted(normalizeLists(listsRead.veri), normalizeTasks(tasksRead.veri), outcome, now);
    const t = await yaz(root, TASKS_PATH, next.tasks, tasksRead.mtime);
    if (!t.ok) {
      if (t.sebep === "hata") throw new Error(t.mesaj);
      continue;
    }
    const l = await yaz(root, LISTS_PATH, next.lists, listsRead.mtime);
    if (l.ok) return next.summary;
    if (l.sebep === "hata") throw new Error(l.mesaj);
  }
  throw new Error("Argos dosyaları yazılırken sürekli değişti");
}

/**
 * Deletes something in Todoist from Argos: the copy records it first so the
 * sync that reports the deletion does not keep it, and forgets it again if
 * Todoist refuses.
 */
export async function deleteFromArgos(root: string, key: string, remove: () => Promise<void>): Promise<void> {
  const before = await readMirror(root);
  await writeMirror(root, expectDeletion(before.mirror, [key]), before.mtime);
  try {
    await remove();
  } catch (e) {
    const now = await readMirror(root);
    await writeMirror(root, cancelDeletion(now.mirror, [key]), now.mtime).catch(() => undefined);
    throw e;
  }
}
