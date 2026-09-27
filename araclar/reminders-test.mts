/**
 * Reminder moments and the upcoming list: `node araclar/reminders-test.mts`
 */

import { dueTaskReminders, taskReminderMessage, type Anlik } from "../src/ortak/bot.ts";
import { addTask, emptyTasks, type TasksFile } from "../src/ortak/local-tasks.ts";
import {
  addMinutes,
  describeReminder,
  emptyReminders,
  normalizeReminders,
  reminderMoment,
  setTodoistReminders,
  syncTodoistReminders,
  upcomingReminders,
} from "../src/ortak/reminders.ts";

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

const rel = (m: number) => ({ id: `r${m}`, kind: "relative" as const, minutesBefore: m });
const abs = (at: string) => ({ id: "ra", kind: "absolute" as const, at });

console.log("Minute arithmetic");
eq("back across midnight", addMinutes("2026-10-01T00:10", -30), "2026-09-30T23:40");
eq("back across a year", addMinutes("2027-01-01T09:00", -1440), "2026-12-31T09:00");

console.log("\nMoments");
eq("at the due time", reminderMoment("2026-10-17T14:00", rel(0)), "2026-10-17T14:00");
eq("1 hour before", reminderMoment("2026-10-17T14:00", rel(60)), "2026-10-17T13:00");
eq("Todoist seconds are ignored", reminderMoment("2026-10-17T14:00:00", rel(10)), "2026-10-17T13:50");
eq("all-day task counts from 09:00", reminderMoment("2026-10-17", rel(0)), "2026-10-17T09:00");
eq("all-day, 1 day before", reminderMoment("2026-10-17", rel(1440)), "2026-10-16T09:00");
eq("relative without a date → none", reminderMoment(null, rel(10)), null);
eq("absolute ignores the date", reminderMoment(null, abs("2026-10-02T08:30")), "2026-10-02T08:30");

console.log("\nLabels");
eq("zamanında", describeReminder(rel(0)), "Zamanında");
eq("10 dk", describeReminder(rel(10)), "10 dk önce");
eq("1 saat", describeReminder(rel(60)), "1 saat önce");
eq("90 dk", describeReminder(rel(90)), "1 sa 30 dk önce");
eq("1 gün", describeReminder(rel(1440)), "1 gün önce");
eq("absolute tomorrow", describeReminder(abs("2026-09-28T08:30"), "2026-09-27"), "Yarın 08:30");
eq("absolute later", describeReminder(abs("2026-10-02T08:30"), "2026-09-27"), "2 Eki 08:30");

console.log("\nUpcoming");
let tasks: TasksFile = emptyTasks();
tasks = addTask(tasks, { listId: "l", title: "IELTS", due: "2026-10-17T14:00", reminders: [rel(1440), rel(60)] }, "t1", "");
tasks = addTask(tasks, { listId: "l", title: "Undated", reminders: [rel(10), abs("2026-09-28T08:00")] }, "t2", "");
tasks = { ...tasks, tasks: [...tasks.tasks, { ...tasks.tasks[0]!, id: "done", completedAt: "x" }] };
let rem = setTodoistReminders(emptyReminders(), "99", { title: "Fatura", due: "2026-09-30", reminders: [rel(0)] });
const up = upcomingReminders(tasks.tasks, rem, "2026-09-27T00:00", "2026-10-31T00:00");
eq(
  "all sources, earliest first, done and dateless-relative skipped",
  up.map((i) => [i.at, i.title, i.source]),
  [
    ["2026-09-28T08:00", "Undated", "local"],
    ["2026-09-30T09:00", "Fatura", "todoist"],
    ["2026-10-16T14:00", "IELTS", "local"],
    ["2026-10-17T13:00", "IELTS", "local"],
  ],
);
eq("window is respected", upcomingReminders(tasks.tasks, rem, "2026-09-29T00:00", "2026-10-01T00:00").map((i) => i.title), ["Fatura"]);
eq("keys are unique per reminder and moment", new Set(up.map((i) => i.key)).size, up.length);

console.log("\nTodoist entries");
eq("removing the last reminder drops the entry", setTodoistReminders(rem, "99", { title: "Fatura", due: null, reminders: [] }).todoist, {});
eq("sync: nothing changed → null", syncTodoistReminders(rem, [{ id: "99", title: "Fatura", due: "2026-09-30" }]), null);
const synced = syncTodoistReminders(rem, [{ id: "99", title: "Fatura öde", due: "2026-10-01T10:00:00" }]);
eq("sync updates title and due (minutes precision)", synced?.todoist["99"], { title: "Fatura öde", due: "2026-10-01T10:00", reminders: [rel(0)] });
eq("sync drops closed tasks", syncTodoistReminders(rem, [])?.todoist, {});
eq("normalize drops empty and broken entries", normalizeReminders({ todoist: { a: { reminders: [] }, b: null, c: { title: "x", reminders: [rel(5)] } } }).todoist, { c: { title: "x", due: null, reminders: [rel(5)] } });

console.log("\nTelegram");
const item = (at: string, title: string) => ({ key: `local:t:${at}`, at, title, source: "local" as const, taskId: "t", due: "2026-10-17T14:00" });
const anlik: Anlik = {
  guncellendi: "",
  gunler: {},
  hatirlatmalar: [item("2026-10-17T08:30", "old"), item("2026-10-17T09:00", "due"), item("2026-10-17T09:05", "now"), item("2026-10-17T09:10", "later")],
};
eq("due now and up to 20 min late, not older, not future", dueTaskReminders(anlik, "2026-10-17T09:05").map((h) => h.title), ["due", "now"]);
eq("old snapshot without reminders", dueTaskReminders({ guncellendi: "", gunler: {} }, "2026-10-17T09:05"), []);
eq("message with day and time", taskReminderMessage(item("2026-10-17T13:00", "IELTS <sınav>")), "⏰ <b>IELTS &lt;sınav&gt;</b>\n📅 Cumartesi 17 Ekim · 14:00");
eq("message for an undated task", taskReminderMessage({ ...item("2026-10-17T13:00", "Ara"), due: null }), "⏰ <b>Ara</b>");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
