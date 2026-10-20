// Explicit .ts extensions: this file also runs under plain Node (araclar/todoist-outbox-test.mts).
import { parseEnglishDue } from "./date-parse.ts";
import { nextDueAfterCompletion } from "./recurrence.ts";
import { ruleFromTodoist } from "./date-parse.ts";
import { ONEMLI_ETIKETI, PLAN_PROJESI } from "./tipler.ts";
import { todoistTarihMetni } from "./todoist-tarih.ts";
import type { MirrorFile, MirrorItem, MirrorProject } from "./todoist-mirror.ts";

/**
 * Argos's writes to Todoist, queued. Every write is applied to what the
 * screens see at once and waits here until Todoist confirms it, so writing
 * works offline exactly like reading.
 *
 * What the screens see is the server copy (todoist-mirror.ts) with the
 * pending commands replayed on top. A phone edit that arrives meanwhile
 * lands in the server copy and the replay puts Argos's own fields back over
 * it: field by field, Argos wins, and fields Argos did not touch keep the
 * phone's value.
 *
 * Each command carries both what Todoist gets (`args`, Sync API format) and
 * what it does to the view (`effect`), worked out once when it was queued:
 * "tomorrow" stays the day it meant.
 */

export const OUTBOX_PATH = "sync/outbox.json";

export type Effect =
  | { kind: "addItem"; item: MirrorItem }
  | { kind: "patchItem"; id: string; patch: Partial<MirrorItem> }
  | { kind: "removeItem"; id: string }
  | { kind: "restoreItem"; item: MirrorItem }
  | { kind: "patchProject"; id: string; patch: Partial<MirrorProject> }
  | { kind: "removeProject"; id: string }
  | { kind: "none" };

export type CommandType =
  | "item_add"
  | "item_update"
  | "item_close"
  | "item_uncomplete"
  | "item_delete"
  | "item_move"
  | "project_update"
  | "project_delete";

export interface OutboxCommand {
  uuid: string;
  type: CommandType;
  /** Sent as is; ids may be temp ids of items added in this queue. */
  args: Record<string, unknown>;
  /** item_add only: the id the new item has in Argos until Todoist names it. */
  tempId?: string;
  effect: Effect;
  at: string;
}

export interface OutboxFile {
  version: 1;
  commands: OutboxCommand[];
  /** Temp id → Todoist id, for commands queued against an item before it was created. */
  tempIds: Record<string, string>;
}

export const emptyOutbox = (): OutboxFile => ({ version: 1, commands: [], tempIds: {} });

export function normalizeOutbox(raw: unknown): OutboxFile {
  const o = raw as Partial<OutboxFile> | null;
  if (!o || typeof o !== "object") return emptyOutbox();
  return {
    version: 1,
    commands: Array.isArray(o.commands) ? o.commands : [],
    tempIds: o.tempIds && typeof o.tempIds === "object" ? o.tempIds : {},
  };
}

export const isTempId = (id: string): boolean => id.startsWith("tmp-");

/* --- the view ---------------------------------------------------------------------- */

/** Resolves a temp id once Todoist has named the item. */
const real = (o: OutboxFile, id: string): string => o.tempIds[id] ?? id;

/** The server copy with the pending commands applied: what every screen reads. */
export function replay(m: MirrorFile, o: OutboxFile): MirrorFile {
  if (o.commands.length === 0) return m;
  const items = { ...m.items };
  const projects = { ...m.projects };
  for (const c of o.commands) {
    const e = c.effect;
    switch (e.kind) {
      case "addItem": {
        const id = real(o, e.item.id);
        // Already created and synced back: the server copy has it.
        if (!items[id]) items[id] = { ...e.item, id, projectId: real(o, e.item.projectId) };
        break;
      }
      case "patchItem": {
        const id = real(o, e.id);
        const cur = items[id];
        // Deleted on the phone meanwhile: nothing to patch; Todoist will refuse the command.
        if (cur) items[id] = { ...cur, ...e.patch, ...(e.patch.projectId ? { projectId: real(o, e.patch.projectId) } : {}) };
        break;
      }
      case "removeItem":
        delete items[real(o, e.id)];
        break;
      case "restoreItem": {
        const id = real(o, e.item.id);
        items[id] = { ...e.item, id };
        break;
      }
      case "patchProject": {
        const cur = projects[e.id];
        if (cur) projects[e.id] = { ...cur, ...e.patch };
        break;
      }
      case "removeProject":
        delete projects[e.id];
        for (const i of Object.values(items)) if (i.projectId === e.id) delete items[i.id];
        break;
      case "none":
        break;
    }
  }
  return { ...m, items, projects };
}

/* --- building commands --------------------------------------------------------------- */

export interface Clock {
  uuid: () => string;
  now: string;
  today: string;
}

/** Turkish or English date text → the local fields and the Todoist `due` arg. Null text clears the date. */
function dueFor(text: string | null, today: string, current?: MirrorItem) {
  if (text === null) {
    return { patch: { due: null, dueString: null, recurring: false }, arg: null };
  }
  const english = todoistTarihMetni(text, today).metin;
  const parsed = parseEnglishDue(english, today);
  const arg = { string: english, lang: "en" };
  if (!parsed) {
    // Outside Argos's vocabulary: Todoist works it out; until then the old date stays on screen.
    return { patch: { dueString: english, ...(current ? {} : { due: null }) }, arg };
  }
  const due = parsed.time ? `${parsed.date}T${parsed.time}:00` : parsed.date;
  return { patch: { due, dueString: english, recurring: parsed.rule !== null }, arg };
}

export interface NewItem {
  content: string;
  projectId: string;
  description?: string;
  /** Todoist scale, 4 = P1. */
  priority?: number;
  labels?: string[];
  dueText?: string | null;
}

export function addItem(input: NewItem, clock: Clock): OutboxCommand {
  const tempId = `tmp-${clock.uuid()}`;
  const due = input.dueText ? dueFor(input.dueText, clock.today) : null;
  const item: MirrorItem = {
    id: tempId,
    projectId: input.projectId,
    content: input.content.trim(),
    description: input.description ?? "",
    due: null,
    dueString: null,
    recurring: false,
    priority: input.priority ?? 1,
    labels: input.labels ?? [],
    parentId: null,
    // After everything already in the project, like Todoist adds it.
    order: Number.MAX_SAFE_INTEGER,
    addedAt: clock.now,
    ...(due ? due.patch : {}),
  };
  return {
    uuid: clock.uuid(),
    type: "item_add",
    tempId,
    args: {
      content: item.content,
      project_id: input.projectId,
      ...(input.description ? { description: input.description } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.labels?.length ? { labels: input.labels } : {}),
      ...(due ? { due: due.arg } : {}),
    },
    effect: { kind: "addItem", item },
    at: clock.now,
  };
}

export interface ItemPatch {
  content?: string;
  description?: string;
  priority?: number;
  labels?: string[];
}

export function updateItem(id: string, patch: ItemPatch, clock: Clock): OutboxCommand {
  const local: Partial<MirrorItem> = {};
  if (patch.content !== undefined) local.content = patch.content.trim();
  if (patch.description !== undefined) local.description = patch.description;
  if (patch.priority !== undefined) local.priority = patch.priority;
  if (patch.labels !== undefined) local.labels = patch.labels;
  return {
    uuid: clock.uuid(),
    type: "item_update",
    args: { id, ...patch, ...(local.content !== undefined ? { content: local.content } : {}) },
    effect: { kind: "patchItem", id, patch: local },
    at: clock.now,
  };
}

export function setItemDue(id: string, text: string | null, current: MirrorItem | undefined, clock: Clock): OutboxCommand {
  const due = dueFor(text, clock.today, current);
  return {
    uuid: clock.uuid(),
    type: "item_update",
    args: { id, due: due.arg },
    effect: { kind: "patchItem", id, patch: due.patch },
    at: clock.now,
  };
}

/** Adds or removes the "önemli" label, leaving the others. */
export function setImportant(item: MirrorItem, important: boolean, clock: Clock): OutboxCommand {
  const others = item.labels.filter((l) => l.toLocaleLowerCase("tr") !== ONEMLI_ETIKETI);
  return updateItem(item.id, { labels: important ? [...others, ONEMLI_ETIKETI] : others }, clock);
}

/**
 * Completing: a one-off task leaves the view; a recurring one moves to its
 * next date as Todoist will move it (a rule Argos cannot read stays put
 * until the sync brings Todoist's answer).
 */
export function closeItem(item: MirrorItem, clock: Clock): OutboxCommand {
  let effect: Effect = { kind: "removeItem", id: item.id };
  if (item.recurring && item.due) {
    const rule = item.dueString ? ruleFromTodoist(item.dueString, item.due.slice(0, 10)) : null;
    const next = rule ? nextDueAfterCompletion(rule, item.due.slice(0, 10), clock.today) : null;
    effect = next ? { kind: "patchItem", id: item.id, patch: { due: next + item.due.slice(10) } } : { kind: "none" };
  }
  return { uuid: clock.uuid(), type: "item_close", args: { id: item.id }, effect, at: clock.now };
}

/** Undo of a close that already reached Todoist: the task comes back as it was. */
export function reopenItem(snapshot: MirrorItem, clock: Clock): OutboxCommand {
  return {
    uuid: clock.uuid(),
    type: "item_uncomplete",
    args: { id: snapshot.id },
    effect: { kind: "restoreItem", item: snapshot },
    at: clock.now,
  };
}

export function deleteItem(id: string, clock: Clock): OutboxCommand {
  return { uuid: clock.uuid(), type: "item_delete", args: { id }, effect: { kind: "removeItem", id }, at: clock.now };
}

export function moveItem(id: string, projectId: string, clock: Clock): OutboxCommand {
  return {
    uuid: clock.uuid(),
    type: "item_move",
    args: { id, project_id: projectId },
    effect: { kind: "patchItem", id, patch: { projectId } },
    at: clock.now,
  };
}

export function updateProject(id: string, patch: { name?: string; color?: string; colorHex?: string; favorite?: boolean }, clock: Clock): OutboxCommand {
  const local: Partial<MirrorProject> = {};
  const args: Record<string, unknown> = { id };
  if (patch.name !== undefined) {
    local.name = patch.name.trim();
    args.name = local.name;
  }
  if (patch.color !== undefined) {
    args.color = patch.color;
    if (patch.colorHex) local.color = patch.colorHex;
  }
  if (patch.favorite !== undefined) {
    local.favorite = patch.favorite;
    args.is_favorite = patch.favorite;
  }
  return { uuid: clock.uuid(), type: "project_update", args, effect: { kind: "patchProject", id, patch: local }, at: clock.now };
}

export function deleteProject(id: string, clock: Clock): OutboxCommand {
  return { uuid: clock.uuid(), type: "project_delete", args: { id }, effect: { kind: "removeProject", id }, at: clock.now };
}

/* --- queue edits that never need Todoist --------------------------------------------- */

/**
 * Deleting an item Todoist has not seen yet (added offline) just forgets
 * every queued command about it: nothing ever reaches Todoist.
 */
export function forgetUnsent(o: OutboxFile, tempId: string): OutboxFile {
  const about = (c: OutboxCommand) =>
    c.tempId === tempId || c.args.id === tempId || ("id" in c.effect && c.effect.id === tempId);
  return { ...o, commands: o.commands.filter((c) => !about(c)) };
}

/**
 * Undo of a close still waiting in the queue: the close is dropped instead
 * of sending a close and an uncomplete. False when there is none.
 */
export function cancelPendingClose(o: OutboxFile, id: string): OutboxFile | null {
  const i = o.commands.findLastIndex((c) => c.type === "item_close" && c.args.id === id);
  if (i < 0) return null;
  return { ...o, commands: o.commands.filter((_, j) => j !== i) };
}

/* --- sending ------------------------------------------------------------------------- */

const mapId = (o: OutboxFile, v: unknown): unknown => (typeof v === "string" ? real(o, v) : v);

/** A command as the Sync API takes it, ids resolved through earlier creations. */
export function wireCommand(o: OutboxFile, c: OutboxCommand): Record<string, unknown> {
  const args = { ...c.args };
  if ("id" in args) args.id = mapId(o, args.id);
  if ("project_id" in args) args.project_id = mapId(o, args.project_id);
  return { type: c.type, uuid: c.uuid, args, ...(c.tempId ? { temp_id: c.tempId } : {}) };
}

export type CommandStatus = "ok" | { error: string; error_code?: number };

export interface SendResult {
  outbox: OutboxFile;
  sent: string[];
  rejected: { command: OutboxCommand; error: string }[];
}

/**
 * Takes Todoist's answer for the commands that were sent: the confirmed and
 * refused ones leave the queue, new temp ids are remembered. Commands queued
 * while the request was out stay.
 */
export function settle(
  o: OutboxFile,
  sentUuids: string[],
  statuses: Record<string, CommandStatus>,
  tempIdMapping: Record<string, string>,
): SendResult {
  const sent = new Set(sentUuids);
  const rejected: SendResult["rejected"] = [];
  const keep: OutboxCommand[] = [];
  for (const c of o.commands) {
    if (!sent.has(c.uuid)) {
      keep.push(c);
      continue;
    }
    const s = statuses[c.uuid];
    if (s === "ok") continue;
    // No answer for a sent command: try it again next time.
    if (s === undefined) {
      keep.push(c);
      continue;
    }
    rejected.push({ command: c, error: s.error });
  }
  return { outbox: { ...o, commands: keep, tempIds: { ...o.tempIds, ...tempIdMapping } }, sent: sentUuids, rejected };
}

/** The plan project is the Asistan's: its tasks are never queued here. */
export const queueable = (projectId: string): boolean => projectId !== PLAN_PROJESI;
