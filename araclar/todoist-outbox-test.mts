/**
 * Argos's queued Todoist writes: `node araclar/todoist-outbox-test.mts`
 *
 * Writes must work offline (applied to the view at once, sent later), and
 * when the phone changed the same task meanwhile, Argos's fields win while
 * the phone's other fields stay.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySync, emptyMirror, MIRROR_PATH, type MirrorFile, type SyncResponse } from "../src/ortak/todoist-mirror.ts";
import {
  addItem,
  cancelPendingClose,
  closeItem,
  deleteItem,
  emptyOutbox,
  forgetUnsent,
  moveItem,
  replay,
  setImportant,
  setItemDue,
  settle,
  updateItem,
  updateProject,
  wireCommand,
  type OutboxFile,
} from "../src/ortak/todoist-outbox.ts";
import { deleteFromArgos, enqueue, flushAndSync, readOutbox, readView, type OutboxApi } from "../src/main/todoist-sync-core.ts";
import { REMINDERS_PATH } from "../src/ortak/reminders.ts";

let passed = 0;
let failed = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
  }
}

let n = 0;
const clock = { uuid: () => `u${++n}`, now: "2026-10-10T10:00:00Z", today: "2026-10-10" };
const server = (items: { id: string; content: string; due?: string; string?: string; recurring?: boolean; labels?: string[] }[], token = "t1"): MirrorFile =>
  applySync(emptyMirror(), {
    sync_token: token,
    full_sync: true,
    projects: [{ id: "P1", name: "Inbox", inbox_project: true }, { id: "P2", name: "Okul", color: "red" }],
    items: items.map((i) => ({
      id: i.id, project_id: "P1", content: i.content, priority: 1, labels: i.labels ?? [],
      due: i.due ? { date: i.due, string: i.string ?? i.due, is_recurring: i.recurring === true } : null,
    })),
  } satisfies SyncResponse).mirror;
const box = (...commands: OutboxFile["commands"]): OutboxFile => ({ ...emptyOutbox(), commands });

const m = server([{ id: "a", content: "Fatura öde", due: "2026-10-12" }, { id: "b", content: "Aidat", due: "2026-11-01", string: "every 1st", recurring: true }]);

console.log("Writes show at once");
const due = setItemDue("a", "yarın 18:00", m.items.a, clock);
eq("Turkish date text: view and Todoist arg", [replay(m, box(due)).items.a!.due, due.args.due], ["2026-10-11T18:00:00", { string: "tomorrow at 18:00", lang: "en" }]);
eq("clearing the date", replay(m, box(setItemDue("a", null, m.items.a, clock))).items.a!.due, null);
eq("text Argos cannot read keeps the old date on screen", replay(m, box(setItemDue("a", "every 3rd friday", m.items.a, clock))).items.a!.due, "2026-10-12");
eq("rename", replay(m, box(updateItem("a", { content: " Faturayı öde " }, clock))).items.a!.content, "Faturayı öde");
eq("important label added, others kept", replay(server([{ id: "a", content: "x", labels: ["iş"] }]), box(setImportant(server([{ id: "a", content: "x", labels: ["iş"] }]).items.a!, true, clock))).items.a!.labels, ["iş", "önemli"]);
eq("move", replay(m, box(moveItem("a", "P2", clock))).items.a!.projectId, "P2");
eq("one-off close leaves the view", replay(m, box(closeItem(m.items.a!, clock))).items.a, undefined);
eq("recurring close moves to the next date", replay(m, box(closeItem(m.items.b!, clock))).items.b!.due, "2026-12-01");
eq("delete", replay(m, box(deleteItem("a", clock))).items.a, undefined);
eq("project rename", replay(m, box(updateProject("P2", { name: "Ders" }, clock))).projects.P2!.name, "Ders");

console.log("\nAdded offline");
const add = addItem({ content: "Süt al", projectId: "P1", dueText: "cuma", priority: 4 }, clock);
const v = replay(m, box(add));
const temp = add.tempId!;
eq("appears with a temp id and its date", [temp.startsWith("tmp-"), v.items[temp]!.content, v.items[temp]!.due], [true, "Süt al", "2026-10-16"]);
const closeTemp = closeItem(v.items[temp]!, clock);
eq("commands on it reference the temp id until Todoist names it", wireCommand(box(add, closeTemp), closeTemp).args, { id: temp });
const named: OutboxFile = { ...box(add, closeTemp), tempIds: { [temp]: "real1" } };
eq("then the real id", wireCommand(named, closeTemp).args, { id: "real1" });
eq("add is sent with temp_id", wireCommand(box(add), add).temp_id, temp);
const synced = server([{ id: "a", content: "Fatura öde" }, { id: "real1", content: "Süt al" }], "t2");
eq("named and synced back: shown once, under its real id", Object.keys(replay(synced, { ...box(add), tempIds: { [temp]: "real1" } }).items).sort(), ["a", "real1"]);
eq("named but not synced yet: still shown, under its real id", Object.keys(replay(m, { ...box(add), tempIds: { [temp]: "real1" } }).items).sort(), ["a", "b", "real1"]);
eq("deleting it before it was sent forgets every command about it", forgetUnsent(box(add, closeTemp, updateItem("a", { content: "x" }, clock)), temp).commands.length, 1);

console.log("\nConflicts: Argos's fields win, the phone's other fields stay");
const phone = server([{ id: "a", content: "Fatura öde (telefon)", due: "2026-10-20" }, { id: "b", content: "Aidat", due: "2026-11-01", string: "every 1st", recurring: true }], "t3");
const merged = replay(phone, box(setItemDue("a", "2026-10-15", m.items.a, clock)));
eq("date from Argos, title from the phone", [merged.items.a!.due, merged.items.a!.content], ["2026-10-15", "Fatura öde (telefon)"]);
eq("deleted on the phone: Argos's edit has nothing to patch", replay(server([]), box(updateItem("a", { content: "x" }, clock))).items.a, undefined);

console.log("\nUndo and answers");
const c1 = closeItem(m.items.a!, clock);
eq("undo of a queued close drops it", cancelPendingClose(box(c1), "a")?.commands.length, 0);
eq("nothing queued: null", cancelPendingClose(box(), "a"), null);
const u1 = updateItem("a", { content: "1" }, clock);
const u2 = updateItem("a", { content: "2" }, clock);
const u3 = updateItem("a", { content: "3" }, clock);
const late = updateItem("a", { content: "late" }, clock);
const s = settle(box(u1, u2, u3, late), [u1.uuid, u2.uuid, u3.uuid], { [u1.uuid]: "ok", [u2.uuid]: { error: "Item not found" } }, { x: "y" });
eq("ok leaves, refused is reported, unanswered and later ones stay", [s.outbox.commands.map((c) => c.uuid), s.rejected.map((r) => r.error)], [[u3.uuid, late.uuid], ["Item not found"]]);

console.log("\nSending, against a data folder");
const root = mkdtempSync(join(tmpdir(), "argos-outbox-"));
try {
  mkdirSync(join(root, "sync"), { recursive: true });
  mkdirSync(join(root, "tasks"), { recursive: true });
  writeFileSync(join(root, MIRROR_PATH), JSON.stringify(m));
  const sentBatches: Record<string, unknown>[][] = [];
  let online = false;
  let syncResponse: SyncResponse = { sync_token: "t9", full_sync: false, projects: [], items: [] };
  const api: OutboxApi = {
    send: async (commands) => {
      if (!online) throw new TypeError("fetch failed");
      sentBatches.push(commands);
      const status: Record<string, "ok" | { error: string }> = {};
      const mapping: Record<string, string> = {};
      for (const c of commands) {
        status[c.uuid as string] = (c.args as { id?: string }).id === "gone" ? { error: "Item not found" } : "ok";
        if (c.temp_id) mapping[c.temp_id as string] = "real-new";
      }
      return { sync_status: status, temp_id_mapping: mapping };
    },
    sync: async () => {
      if (!online) throw new TypeError("fetch failed");
      return syncResponse;
    },
    isGone: async () => false,
  };

  const newTask = addItem({ content: "Kitap iade", projectId: "P1" }, clock);
  await enqueue(root, newTask);
  await enqueue(root, setItemDue("a", "2026-10-30", m.items.a, clock));
  writeFileSync(join(root, REMINDERS_PATH), JSON.stringify({ version: 1, todoist: { [newTask.tempId!]: { title: "Kitap iade", due: null, reminders: [{ id: "r1", kind: "absolute", at: "2026-10-11T09:00" }] } } }));
  const offline = await flushAndSync(root, api, "now").then(() => "sent", (e: Error) => e.message);
  const view1 = await readView(root);
  eq("offline: send fails, everything stays queued and visible", [offline, (await readOutbox(root)).outbox.commands.length, view1.items[newTask.tempId!]?.content, view1.items.a!.due], ["fetch failed", 2, "Kitap iade", "2026-10-30"]);

  online = true;
  syncResponse = {
    sync_token: "t10",
    full_sync: false,
    projects: [],
    items: [
      { id: "real-new", project_id: "P1", content: "Kitap iade", priority: 1 },
      { id: "a", project_id: "P1", content: "Fatura öde", priority: 1, due: { date: "2026-10-30", string: "2026-10-30" } },
    ],
  };
  const r = await flushAndSync(root, api, "now");
  const view2 = await readView(root);
  const reminders = JSON.parse(readFileSync(join(root, REMINDERS_PATH), "utf8")).todoist;
  eq("online: both sent in one request, queue empty", [sentBatches.length, sentBatches[0]!.length, (await readOutbox(root)).outbox.commands.length, r.sent], [1, 2, 0, 2]);
  eq("the new task now has its Todoist id, once", [view2.items["real-new"]?.content, Object.keys(view2.items).filter((k) => k.startsWith("tmp-")).length], ["Kitap iade", 0]);
  eq("its reminders followed it to the new id", Object.keys(reminders), ["real-new"]);

  await deleteFromArgos(root, "item", "gone", deleteItem("gone", clock));
  const r2 = await flushAndSync(root, api, "now");
  const copy = JSON.parse(readFileSync(join(root, MIRROR_PATH), "utf8")) as MirrorFile;
  eq("refused delete: reported, and no longer expected", [r2.rejected.map((x) => x.error), copy.argosDeleted], [["Item not found"], []]);

  const offlineAdd = addItem({ content: "Geçici", projectId: "P1" }, clock);
  await enqueue(root, offlineAdd);
  await deleteFromArgos(root, "item", offlineAdd.tempId!, deleteItem(offlineAdd.tempId!, clock));
  eq("deleting a task Todoist never saw: nothing left to send", (await readOutbox(root)).outbox.commands.length, 0);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
