/**
 * Local lists and tasks, and the shared Task model: `node araclar/local-tasks-test.mts`
 */

import {
  addList,
  addTask,
  completeTask,
  deleteList,
  deleteTask,
  emptyLists,
  emptyTasks,
  normalizeLists,
  normalizeTasks,
  restoreTask,
  tasksInRange,
  tasksOfList,
  updateList,
  updateTask,
  LIST_COLORS,
} from "../src/ortak/local-tasks.ts";
import {
  fromLocal,
  fromTodoist,
  priorityFromTodoist,
  priorityToTodoist,
  todoistColor,
} from "../src/ortak/task.ts";

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

const NOW = "2026-09-27T10:00:00.000Z";
const TODAY = "2026-09-27";

console.log("Lists");
let lists = addList(emptyLists(), { name: "  Başvurular " }, "l-1", NOW);
lists = addList(lists, { name: "Okul" }, "l-2", NOW);
eq("name is trimmed", lists.lists[0]!.name, "Başvurular");
eq("each list gets an unused colour", [lists.lists[0]!.color, lists.lists[1]!.color], [LIST_COLORS[0], LIST_COLORS[1]]);
eq("order increases", lists.lists.map((l) => l.order), [0, 1]);
lists = updateList(lists, "l-2", { favorite: true, name: " Okul 2 " });
eq("update sets favorite and trims name", [lists.lists[1]!.favorite, lists.lists[1]!.name], [true, "Okul 2"]);

console.log("\nTasks");
let tasks = addTask(emptyTasks(), { listId: "l-1", title: " IELTS sınavı ", due: "2026-10-17T14:00", important: true }, "t-1", NOW);
tasks = addTask(tasks, { listId: "l-1", title: "Portfolyo" }, "t-2", NOW);
tasks = addTask(tasks, { listId: "l-2", title: "Ödev", recurrence: { kind: "daily", interval: 1 } }, "t-3", NOW);
eq("defaults: P4, open, no reminders", [tasks.tasks[1]!.priority, tasks.tasks[1]!.completedAt, tasks.tasks[1]!.reminders], [4, null, []]);
eq("a rule without a date is dropped", tasks.tasks[2]!.recurrence, null);
eq("tasks of a list in order", tasksOfList(tasks, "l-1").map((t) => t.id), ["t-1", "t-2"]);
eq("tasks in range", tasksInRange(tasks, "2026-10-01", "2026-10-31").map((t) => t.id), ["t-1"]);

tasks = updateTask(tasks, "t-2", { due: "2026-09-28", recurrence: { kind: "weekly", interval: 1, days: [0] } });
eq("update sets date and rule", [tasks.tasks[1]!.due, tasks.tasks[1]!.recurrence?.kind], ["2026-09-28", "weekly"]);
tasks = updateTask(tasks, "t-2", { due: null });
eq("clearing the date clears the rule", tasks.tasks[1]!.recurrence, null);

console.log("\nCompleting");
const single = completeTask(tasks, "t-1", NOW, TODAY);
eq("non-recurring: marked done, stays in file", [single.file.tasks[0]!.completedAt, single.nextDue], [NOW, null]);
eq("done task leaves the list", tasksOfList(single.file, "l-1").map((t) => t.id), ["t-2"]);

let rec = addTask(emptyTasks(), { listId: "l-1", title: "Haftalık kontrol", due: "2026-09-21T09:00", recurrence: { kind: "weekly", interval: 1, days: [0] } }, "t-9", NOW);
const r1 = completeTask(rec, "t-9", NOW, TODAY);
eq("recurring overdue: next Monday after today, time kept", r1.nextDue, "2026-09-28T09:00");
eq("recurring stays open", r1.file.tasks[0]!.completedAt, null);
rec = restoreTask(r1.file, rec.tasks[0]!);
eq("restore puts the old due back (undo)", rec.tasks[0]!.due, "2026-09-21T09:00");

console.log("\nDeleting");
eq("delete task", deleteTask(tasks, "t-2").tasks.map((t) => t.id), ["t-1", "t-3"]);
const removed = restoreTask(deleteTask(tasks, "t-2"), tasks.tasks[1]!);
eq("restore after delete brings it back", removed.tasks.some((t) => t.id === "t-2"), true);
const both = deleteList(lists, tasks, "l-1");
eq("deleting a list removes its tasks", [both.lists.lists.map((l) => l.id), both.tasks.tasks.map((t) => t.id)], [["l-2"], ["t-3"]]);

console.log("\nReading old or damaged files");
eq("null file → empty", normalizeTasks(null), emptyTasks());
eq("missing array → empty", normalizeLists({ version: 1 }), emptyLists());
const norm = normalizeTasks({ tasks: [{ id: "x", listId: "l", title: "T", priority: 9 }, { title: "no id" }] });
eq("broken rows dropped, defaults filled", norm.tasks.map((t) => [t.id, t.priority, t.important, t.due]), [["x", 4, false, null]]);

console.log("\nShared Task model");
eq("Todoist priority 4 = P1", priorityFromTodoist(4), 1);
eq("Todoist priority 1 = P4", priorityFromTodoist(1), 4);
eq("P2 → Todoist 3", priorityToTodoist(2), 3);
const fromT = fromTodoist({
  id: "42", icerik: "Fatura", aciklama: "", projeId: "P", tarih: "2026-10-01", tarihMetni: "her ay",
  tekrarli: true, oncelik: 3, etiketler: ["Önemli"], altGorev: false,
});
eq("from Todoist", [fromT.key, fromT.priority, fromT.important, fromT.recurrenceText], ["todoist:42", 2, true, "her ay"]);
const fromL = fromLocal(rec.tasks[0]!);
eq("from local", [fromL.key, fromL.recurring, fromL.recurrenceText], ["local:t-9", true, "Her pazartesi"]);
eq("Todoist colour name → hex", todoistColor("berry_red"), "#b8256f");
eq("unknown colour → charcoal", todoistColor("nope"), "#808080");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
