/**
 * Argos's Todoist copy: `node araclar/todoist-mirror-test.mts`
 *
 * What Todoist deletes must stay in Argos (as Argos lists and tasks); what
 * Argos deletes must go from Todoist and not come back as "kept".
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLists, emptyTasks } from "../src/ortak/local-tasks.ts";
import { PLAN_PROJESI } from "../src/ortak/tipler.ts";
import {
  MIRROR_PATH,
  applySync,
  emptyMirror,
  keepDeleted,
  resolveVanished,
  type MirrorFile,
  type SyncItem,
  type SyncProject,
  type SyncResponse,
} from "../src/ortak/todoist-mirror.ts";
import { deleteFromArgos, syncOnce } from "../src/main/todoist-sync-core.ts";

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

const proj = (id: string, name: string, extra: Partial<SyncProject> = {}): SyncProject => ({ id, name, color: "berry_red", ...extra });
const item = (id: string, project_id: string, content: string, extra: Partial<SyncItem> = {}): SyncItem => ({ id, project_id, content, priority: 1, ...extra });
const full = (projects: SyncProject[], items: SyncItem[], token = "t1"): SyncResponse => ({ sync_token: token, full_sync: true, projects, items });
const delta = (projects: SyncProject[], items: SyncItem[], token = "t2"): SyncResponse => ({ sync_token: token, full_sync: false, projects, items });

const base = applySync(
  emptyMirror(),
  full(
    [proj("P1", "Okul", { is_favorite: true }), proj("P2", "Ev"), proj(PLAN_PROJESI, "Plan")],
    [
      item("a", "P1", "Ödev", { due: { date: "2026-10-20T14:30:00", string: "oct 20 at 14:30" }, priority: 4, labels: ["Önemli"] }),
      item("b", "P1", "Aidat", { due: { date: "2026-11-01", string: "every 1st", is_recurring: true } }),
      item("c", "P2", "Süt al"),
      item("done", "P2", "Bitti", { checked: true }),
      item("slot", PLAN_PROJESI, "Slot"),
    ],
  ),
).mirror;

console.log("First sync");
eq("projects copied, plan project left out", Object.keys(base.projects).sort(), ["P1", "P2"]);
eq("open items copied, completed and plan items left out", Object.keys(base.items).sort(), ["a", "b", "c"]);
eq("colour stored as hex", base.projects.P1!.color, "#b8256f");
eq("token kept", base.syncToken, "t1");
eq("first sync clears stale Argos deletions", applySync({ ...emptyMirror(), argosDeleted: ["item:x"] }, full([], [])).mirror.argosDeleted, []);

console.log("\nIncremental sync");
let o = applySync(base, delta([], [item("c", "P2", "Süt al (2 lt)")]));
eq("edit updates the copy", o.mirror.items.c!.content, "Süt al (2 lt)");
eq("an edit is not a deletion", [o.deletedItems.length, o.deletedProjects.length], [0, 0]);
o = applySync(base, delta([], [item("c", "P2", "Süt al", { checked: true })]));
eq("completed elsewhere: dropped, not kept", [o.mirror.items.c, o.deletedItems.length], [undefined, 0]);
o = applySync(base, delta([], [{ id: "c", project_id: "2222222222222222", content: "", is_deleted: true }]));
eq("deleted in Todoist: kept with its old data", o.deletedItems.map((i) => [i.id, i.content, i.projectId]), [["c", "Süt al", "P2"]]);
o = applySync({ ...base, argosDeleted: ["item:c"] }, delta([], [{ id: "c", project_id: "x", content: "", is_deleted: true }]));
eq("deleted from Argos: not kept, marker cleared", [o.deletedItems.length, o.mirror.argosDeleted], [0, []]);
o = applySync(base, delta([proj("P1", "Okul", { is_deleted: true })], [
  { id: "a", project_id: "x", content: "", is_deleted: true },
  { id: "b", project_id: "x", content: "", is_deleted: true },
]));
eq("project deleted in Todoist: kept with its items", o.deletedProjects.map((d) => [d.project.name, d.items.map((i) => i.id)]), [["Okul", ["a", "b"]]]);
eq("its items are not also kept one by one", o.deletedItems.length, 0);
o = applySync({ ...base, argosDeleted: ["project:P1"] }, delta([proj("P1", "Okul", { is_deleted: true })], []));
eq("project deleted from Argos: nothing kept", [o.deletedProjects.length, o.mirror.items.a, o.mirror.argosDeleted], [0, undefined, []]);
o = applySync(base, delta([proj("P2", "Ev", { is_archived: true })], []));
eq("archived project: dropped, not kept", [o.deletedProjects.length, o.mirror.projects.P2], [0, undefined]);
o = applySync(base, delta([proj(PLAN_PROJESI, "Plan", { is_deleted: true })], [{ id: "slot", project_id: "x", content: "", is_deleted: true }]));
eq("plan project and slots are never kept", [o.deletedProjects.length, o.deletedItems.length], [0, 0]);
eq("nothing changed → changed false", applySync(base, delta([], [])).changed, false);
o = applySync(base, delta([], [item("n", "P2", "Yeni")]));
eq("new task joins the copy", o.mirror.items.n?.content, "Yeni");

console.log("\nFull re-sync on an existing copy");
o = applySync(base, full([proj("P1", "Okul"), proj("P2", "Ev")], [item("a", "P1", "Ödev")], "t9"));
eq("vanished items reported", o.vanishedItems.sort(), ["b", "c"]);
const r = resolveVanished(base, o, new Set(), new Set(["c"]));
eq("only the 404 one is kept", r.deletedItems.map((i) => i.id), ["c"]);

console.log("\nKeeping in the Argos files");
const out = applySync(base, delta([proj("P1", "Okul", { is_deleted: true })], [{ id: "c", project_id: "x", content: "", is_deleted: true }]));
let kept = keepDeleted(emptyLists(), emptyTasks(), out, "2026-10-10T10:00:00Z");
const list = kept.lists.lists[0]!;
eq("list: same name, colour, favourite", [list.id, list.name, list.color, list.favorite], ["l-td-P1", "Okul", "#b8256f", true]);
const odev = kept.tasks.tasks.find((t) => t.id === "t-td-a")!;
eq("task: time, priority, important", [odev.listId, odev.due, odev.priority, odev.important], ["l-td-P1", "2026-10-20T14:30", 1, true]);
eq("recurring task keeps its rule", kept.tasks.tasks.find((t) => t.id === "t-td-b")!.recurrence, { kind: "monthly", interval: 1, day: 1 });
const sut = kept.tasks.tasks.find((t) => t.id === "t-td-c")!;
eq("single task stays in its Todoist list", [sut.listId, sut.listSource], ["P2", "todoist"]);
eq("summary", kept.summary, { lists: ["Okul"], tasks: 3 });
const again = keepDeleted(kept.lists, kept.tasks, out, "later");
eq("running twice adds nothing", [again.lists.lists.length, again.tasks.tasks.length, again.summary.tasks], [1, 3, 0]);
const later = keepDeleted(kept.lists, kept.tasks, { deletedProjects: [{ project: base.projects.P2!, items: [] }], deletedItems: [] }, "later");
const moved = later.tasks.tasks.find((t) => t.id === "t-td-c")!;
eq("its list deleted later: kept task moves into the new Argos list", [moved.listId, moved.listSource], ["l-td-P2", undefined]);

console.log("\nSync against a data folder");
const root = mkdtempSync(join(tmpdir(), "argos-mirror-"));
try {
  let next: SyncResponse = full([proj("P1", "Okul")], [item("a", "P1", "Ödev")]);
  const api = { sync: async () => next, isGone: async () => true };
  await syncOnce(root, api, "now");
  const copy = JSON.parse(readFileSync(join(root, MIRROR_PATH), "utf8")) as MirrorFile;
  eq("first run writes the copy", [copy.syncToken, Object.keys(copy.items)], ["t1", ["a"]]);
  next = delta([proj("P1", "Okul", { is_deleted: true })], []);
  const { kept: summary, changed } = await syncOnce(root, api, "now");
  eq("deleted project lands in the Argos files", [summary, changed], [{ lists: ["Okul"], tasks: 1 }, true]);
  next = delta([], [], "t3");
  eq("nothing new → unchanged", (await syncOnce(root, api, "now")).changed, false);
  const tasks = JSON.parse(readFileSync(join(root, "tasks/tasks.json"), "utf8"));
  eq("tasks file has the kept task", tasks.tasks.map((t: { title: string }) => t.title), ["Ödev"]);

  let removed = false;
  await deleteFromArgos(root, "item:z", async () => {
    removed = true;
  });
  const marked = JSON.parse(readFileSync(join(root, MIRROR_PATH), "utf8")) as MirrorFile;
  eq("delete from Argos: recorded, then removed", [marked.argosDeleted, removed], [["item:z"], true]);
  const refused = await deleteFromArgos(root, "item:y", async () => {
    throw new Error("Todoist 500");
  }).then(() => false, () => true);
  const after = JSON.parse(readFileSync(join(root, MIRROR_PATH), "utf8")) as MirrorFile;
  eq("Todoist refuses: error passes on, record undone", [refused, after.argosDeleted], [true, ["item:z"]]);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
