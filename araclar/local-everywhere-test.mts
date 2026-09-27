/**
 * Argos-local tasks outside the task screen — Telegram snapshot, /kapat,
 * queue closes, "#List" quick add: `node araclar/local-everywhere-test.mts`
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyLocalTaskClose,
  gunMesaji,
  kapatCoz,
  kuyrukOnayi,
  localTasksForDay,
  localTasksSnapshot,
  type Anlik,
  type KuyrukKaydi,
} from "../src/ortak/bot.ts";
import { addTask, emptyTasks, type LocalTask, type TasksFile } from "../src/ortak/local-tasks.ts";
import { localAsTodoist } from "../src/ortak/task.ts";
import { findLocalListTag, quickAddLocal } from "../src/main/local-quick-add.ts";

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

const TODAY = "2026-09-27";
const NOW = "2026-09-27T10:00:00.000Z";

let file: TasksFile = emptyTasks();
const add = (id: string, input: Partial<Parameters<typeof addTask>[1]>) => {
  file = addTask(file, { listId: "l-1", title: id, ...input }, id, NOW);
};
add("overdue", { due: "2026-09-20" });
add("today", { due: "2026-09-27T18:00", priority: 1, important: true });
add("in13", { due: "2026-10-10" });
add("in14", { due: "2026-10-11" });
add("undated", {});
add("weekly", { due: "2026-09-28T09:00", recurrence: { kind: "weekly", interval: 1, days: [0] } });
file = { ...file, tasks: [...file.tasks, { ...file.tasks[0]!, id: "done", title: "done", completedAt: NOW }] };

console.log("Todoist shape");
const shaped = localAsTodoist(file.tasks.find((t) => t.id === "today")!);
eq("fields map across", [shaped.icerik, shaped.tarih, shaped.oncelik, shaped.etiketler, shaped.source], ["today", "2026-09-27T18:00", 4, ["önemli"], "local"]);
eq("recurring text", localAsTodoist(file.tasks.find((t) => t.id === "weekly")!).tarihMetni, "Her pazartesi");

console.log("\nSnapshot for the Worker");
const snap = localTasksSnapshot(file.tasks, TODAY);
eq("dated open tasks within 14 days, overdue included", snap.map((g) => g.id), ["overdue", "today", "in13", "weekly"]);

const anlik: Anlik = { guncellendi: NOW, gunler: {}, yerelGorevler: snap };
eq("today shows overdue and today's", localTasksForDay(anlik, TODAY, TODAY).map((g) => g.id), ["overdue", "today"]);
eq("another day shows only that day", localTasksForDay(anlik, "2026-09-28", TODAY).map((g) => g.id), ["weekly"]);
const pending: KuyrukKaydi[] = [{ id: "u1", tur: "task", zaman: NOW, gorevId: "today", due: "2026-09-27T18:00", ad: "today" }];
eq("tasks waiting in the queue are left out", localTasksForDay(anlik, TODAY, TODAY, pending).map((g) => g.id), ["overdue"]);
eq("old snapshot without local tasks", localTasksForDay({ guncellendi: NOW, gunler: {} }, TODAY, TODAY), []);

console.log("\nTelegram");
const msg = gunMesaji(TODAY, TODAY, anlik, localTasksForDay(anlik, TODAY, TODAY), []);
eq("day message lists local tasks under Görevler", msg.includes("<b>📋 Görevler</b>") && msg.includes("18:00 today"), true);
const hit = kapatCoz("today", [], localTasksForDay(anlik, TODAY, TODAY));
eq("/kapat finds a local task and marks it local", hit.tur === "tek" ? [hit.hedef.id, hit.hedef.local] : hit, ["today", { due: "2026-09-27T18:00" }]);
const todoistHit = kapatCoz("fatura", [], [{ ...shaped, id: "99", icerik: "fatura", source: undefined }]);
eq("a Todoist task has no local mark", todoistHit.tur === "tek" ? todoistHit.hedef.local : "x", undefined);
eq("queue confirmation", kuyrukOnayi(pending[0]!, TODAY), "⏳ today tamamlandı — Argos açılınca işlenecek.");

console.log("\nApplying a close from the queue");
const closeRec = (gorevId: string, due: string | null): Extract<KuyrukKaydi, { tur: "task" }> => ({
  id: "u2", tur: "task", zaman: NOW, gorevId, due, ad: gorevId,
});
const once = applyLocalTaskClose(file, closeRec("today", "2026-09-27T18:00"), TODAY, NOW);
eq("closes a plain task", once.tur === "eklendi" && once.veri.tasks.find((t) => t.id === "today")!.completedAt, NOW);
const twice = applyLocalTaskClose((once as { veri: TasksFile }).veri, closeRec("today", "2026-09-27T18:00"), TODAY, NOW);
eq("the same record again is already applied", twice.tur, "zatenVar");
const rec1 = applyLocalTaskClose(file, closeRec("weekly", "2026-09-28T09:00"), TODAY, NOW);
const moved = rec1.tur === "eklendi" ? rec1.veri.tasks.find((t) => t.id === "weekly") : null;
eq("recurring task moves to its next date", [moved?.due, moved?.completedAt, rec1.tur === "eklendi" ? rec1.not : null], ["2026-10-05T09:00", null, "sıradaki: 2026-10-05"]);
eq("recurring record again does not move it twice", applyLocalTaskClose((rec1 as { veri: TasksFile }).veri, closeRec("weekly", "2026-09-28T09:00"), TODAY, NOW).tur, "zatenVar");
eq("unknown task is rejected", applyLocalTaskClose(file, closeRec("nope", null), TODAY, NOW).tur, "reddet");

console.log("\n#List in quick add");
const lists = [
  { id: "l-1", name: "Başvurular", color: "#fff", favorite: false, order: 0, createdAt: "" },
  { id: "l-2", name: "Kişisel Gelişim", color: "#fff", favorite: false, order: 1, createdAt: "" },
];
eq("exact name, any case", findLocalListTag("vize #başvurular yarın", lists)?.list.id, "l-1");
eq("tag is removed from the line", findLocalListTag("vize #Başvurular yarın", lists)?.rest, "vize yarın");
eq("spaces in the name may be dropped", findLocalListTag("kitap #KişiselGelişim", lists)?.list.id, "l-2");
eq("underscores stand for spaces", findLocalListTag("kitap #kişisel_gelişim", lists)?.list.id, "l-2");
eq("a Todoist project tag is not ours", findLocalListTag("süt al #Ev", lists), null);

const dir = mkdtempSync(join(tmpdir(), "argos-quickadd-"));
try {
  mkdirSync(join(dir, "tasks"));
  writeFileSync(join(dir, "tasks/lists.json"), JSON.stringify({ version: 1, lists }));
  const g = await quickAddLocal(dir, "IELTS kaydı #Başvurular yarın 18:00 p1 @önemli", TODAY, NOW);
  const saved = JSON.parse(readFileSync(join(dir, "tasks/tasks.json"), "utf8")).tasks as LocalTask[];
  eq("writes the task to the Argos list", saved.map((t) => [t.title, t.listId, t.due, t.priority, t.important]), [["IELTS kaydı", "l-1", "2026-09-28T18:00", 1, true]]);
  eq("returns it in the Todoist shape", [g?.icerik, g?.source], ["IELTS kaydı", "local"]);
  eq("a line for Todoist returns null and writes nothing", [await quickAddLocal(dir, "süt al #Ev", TODAY, NOW), JSON.parse(readFileSync(join(dir, "tasks/tasks.json"), "utf8")).tasks.length], [null, 1]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
