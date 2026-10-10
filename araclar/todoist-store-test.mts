/**
 * The screens' Todoist queries answered from Argos's copy: `node araclar/todoist-store-test.mts`
 *
 * Each query must return what the Todoist endpoint it replaces returned, so
 * the screens look the same online and offline. (A live parity check against
 * the real endpoints was run when this was written; these pin the rules.)
 */

import { applySync, emptyMirror, normalizeMirror, type SyncItem } from "../src/ortak/todoist-mirror.ts";
import {
  storeImportant,
  storeProjects,
  storeRange,
  storeReady,
  storeRecurring,
  storeTasks,
  storeTodayAndOverdue,
} from "../src/ortak/todoist-store.ts";

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

const item = (id: string, date: string | null, extra: Partial<SyncItem> = {}): SyncItem => ({
  id, project_id: "P1", content: id, priority: 1, child_order: Number(id.replace(/\D/g, "")) || 0,
  due: date ? { date, string: date } : null, ...extra,
});

const m = applySync(emptyMirror(), {
  sync_token: "t1",
  full_sync: true,
  projects: [
    { id: "P2", name: "Okul", color: "blue", child_order: 2 },
    { id: "P1", name: "Inbox", inbox_project: true, child_order: 0 },
  ],
  items: [
    item("t3", "2026-10-12"),
    item("t1", "2026-10-09T14:30:00"),
    item("t2", "2026-10-10"),
    item("t4", null, { labels: ["önemli"] }),
    item("t5", "2026-11-01", { due: { date: "2026-11-01", string: "every 1st", is_recurring: true } }),
    item("t6", null, { parent_id: "t4" }),
  ],
}).mirror;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

console.log("Projects and tasks");
eq("projects in sidebar order", storeProjects(m).map((p) => p.ad), ["Inbox", "Okul"]);
eq("project shape", storeProjects(m)[1], { id: "P2", ad: "Okul", inbox: false, color: "#4073ff", favorite: false, order: 2 });
eq("tasks in Todoist order", ids(storeTasks(m)), ["t1", "t2", "t3", "t4", "t5", "t6"]);
const t5 = storeTasks(m).find((t) => t.id === "t5")!;
eq("recurring task shape (Turkish text, due string)", [t5.tekrarli, t5.tarihMetni, t5.dueString], [true, "her ayın 1. günü", "every 1st"]);
eq("sub-task flag", storeTasks(m).find((t) => t.id === "t6")!.altGorev, true);

console.log("\nQueries");
eq("today | overdue (10 Oct)", ids(storeTodayAndOverdue(m, "2026-10-10")), ["t1", "t2"]);
eq("range excludes both ends", ids(storeRange(m, "2026-10-09", "2026-10-12")), ["t2"]);
eq("range with padded ends", ids(storeRange(m, "2026-10-08", "2026-10-13")), ["t1", "t2", "t3"]);
eq("important", ids(storeImportant(m)), ["t4"]);
eq("recurring", ids(storeRecurring(m)), ["t5"]);

console.log("\nReadiness and migration");
eq("filled copy is ready", storeReady(m), true);
eq("empty copy is not", storeReady(emptyMirror()), false);
const v1 = normalizeMirror({ ...m, version: 1 });
eq("old version: data kept, token dropped", [v1.syncToken, Object.keys(v1.items).length], [null, 6]);
const re = applySync(v1, { sync_token: "t2", full_sync: true, projects: [{ id: "P1", name: "Inbox", inbox_project: true }], items: [item("t1", null)] });
eq("migrated copy re-syncs with vanished checks", re.vanishedItems.sort(), ["t2", "t3", "t4", "t5", "t6"].filter((id) => id !== "t1").sort());

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
