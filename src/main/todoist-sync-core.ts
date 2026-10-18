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
import {
  OUTBOX_PATH,
  cancelPendingClose,
  forgetUnsent,
  isTempId,
  normalizeOutbox,
  replay,
  settle,
  wireCommand,
  type CommandStatus,
  type OutboxCommand,
  type OutboxFile,
} from "../ortak/todoist-outbox.ts";
import { REMINDERS_PATH, normalizeReminders, type RemindersFile } from "../ortak/reminders.ts";
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

export interface SyncResult {
  kept: KeptSummary;
  /** Whether the copy's content changed, i.e. the screens have something new to show. */
  changed: boolean;
}

export async function syncOnce(root: string, api: SyncApi, now: string): Promise<SyncResult> {
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
  return { kept: summary, changed: outcome.changed };
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

/* --- the outbox ------------------------------------------------------------------ */

/** The Sync API's answer to a batch of commands. */
export interface CommandsResponse {
  sync_status: Record<string, CommandStatus>;
  temp_id_mapping: Record<string, string>;
}

export interface OutboxApi extends SyncApi {
  send(commands: Record<string, unknown>[]): Promise<CommandsResponse>;
}

export async function readOutbox(root: string): Promise<{ outbox: OutboxFile; mtime: number | null }> {
  const r = await oku<OutboxFile>(root, OUTBOX_PATH);
  return { outbox: normalizeOutbox(r.veri), mtime: r.mtime };
}

/**
 * Read → change → write on the outbox, again on the new state if someone
 * wrote meanwhile (a queued write and a send can cross).
 */
export async function changeOutbox(root: string, f: (o: OutboxFile) => OutboxFile): Promise<OutboxFile> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { outbox, mtime } = await readOutbox(root);
    const next = f(outbox);
    const w = await yaz(root, OUTBOX_PATH, next, mtime);
    if (w.ok) return next;
    if (w.sebep === "hata") throw new Error(w.mesaj);
  }
  throw new Error("Bekleyen işler dosyası yazılırken sürekli değişti");
}

/** What the screens see: the server copy with the queued writes on top. */
export async function readView(root: string): Promise<MirrorFile> {
  const [{ mirror }, { outbox }] = await Promise.all([readMirror(root), readOutbox(root)]);
  return replay(mirror, outbox);
}

export const enqueue = (root: string, c: OutboxCommand): Promise<OutboxFile> =>
  changeOutbox(root, (o) => ({ ...o, commands: [...o.commands, c] }));

/** Commands per request; the Sync API takes up to 100. */
const BATCH = 50;

export interface FlushResult {
  sync: SyncResult;
  sent: number;
  /** Tasks added offline that Todoist named in this send. */
  named: number;
  rejected: { command: OutboxCommand; error: string }[];
}

/**
 * Sends what is queued, then syncs. Order matters for what the screens see
 * meanwhile: new Todoist ids are recorded first, then the copy is synced
 * (it now holds the confirmed writes), and only then do the confirmed
 * commands leave the queue, so no write ever blinks off the screen.
 * A network failure throws with everything still queued.
 */
export async function flushAndSync(root: string, api: OutboxApi, now: string): Promise<FlushResult> {
  const { outbox } = await readOutbox(root);
  const batch = outbox.commands.slice(0, BATCH);
  let statuses: Record<string, CommandStatus> = {};
  let named = 0;
  if (batch.length > 0) {
    const res = await api.send(batch.map((c) => wireCommand(outbox, c)));
    statuses = res.sync_status ?? {};
    const mapping = res.temp_id_mapping ?? {};
    named = Object.keys(mapping).length;
    if (named > 0) {
      await changeOutbox(root, (o) => ({ ...o, tempIds: { ...o.tempIds, ...mapping } }));
      await rekeyReminders(root, mapping);
    }
  }

  const sync = await syncOnce(root, api, now);
  if (batch.length === 0) return { sync, sent: 0, named: 0, rejected: [] };

  let rejected: FlushResult["rejected"] = [];
  await changeOutbox(root, (o) => {
    const r = settle(o, batch.map((c) => c.uuid), statuses, {});
    rejected = r.rejected;
    return r.outbox;
  });
  // A refused delete is not a deletion to expect any more.
  const refusedDeletes = rejected
    .filter((r) => r.command.type === "item_delete" || r.command.type === "project_delete")
    .map((r) => `${r.command.type === "item_delete" ? "item" : "project"}:${String(r.command.args.id)}`);
  if (refusedDeletes.length > 0) {
    const m = await readMirror(root);
    await writeMirror(root, cancelDeletion(m.mirror, refusedDeletes), m.mtime);
  }
  const sent = batch.filter((c) => statuses[c.uuid] === "ok").length;
  return { sync: { ...sync, changed: sync.changed || sent > 0 || rejected.length > 0 }, sent, named, rejected };
}

/** Argos's reminders on a task added offline follow it to its Todoist id. */
async function rekeyReminders(root: string, mapping: Record<string, string>): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await oku<RemindersFile>(root, REMINDERS_PATH);
    const file = normalizeReminders(r.veri);
    if (!Object.keys(mapping).some((t) => file.todoist[t])) return;
    const todoist = { ...file.todoist };
    for (const [temp, id] of Object.entries(mapping)) {
      if (!todoist[temp]) continue;
      todoist[id] = todoist[temp]!;
      delete todoist[temp];
    }
    const w = await yaz(root, REMINDERS_PATH, { ...file, todoist }, r.mtime);
    if (w.ok || w.sebep === "hata") return;
  }
}

/**
 * Deletes a task or project from Argos. It leaves the view at once and is
 * queued for Todoist; the copy records the id first so the sync that
 * reports the deletion does not keep it. A task Todoist never saw (added
 * offline) is just forgotten.
 */
export async function deleteFromArgos(root: string, kind: "item" | "project", id: string, command: OutboxCommand): Promise<void> {
  const { outbox } = await readOutbox(root);
  const realId = outbox.tempIds[id] ?? id;
  if (kind === "item" && isTempId(realId)) {
    await changeOutbox(root, (o) => forgetUnsent(o, realId));
    return;
  }
  const m = await readMirror(root);
  await writeMirror(root, expectDeletion(m.mirror, [`${kind}:${realId}`]), m.mtime);
  await enqueue(root, command);
}

/** Undo of a close: drops it if still queued; otherwise false, and the caller queues a reopen. */
export async function cancelQueuedClose(root: string, id: string): Promise<boolean> {
  let cancelled = false;
  await changeOutbox(root, (o) => {
    const next = cancelPendingClose(o, id);
    cancelled = next !== null;
    return next ?? o;
  });
  return cancelled;
}
