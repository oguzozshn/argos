import { useEffect, useRef } from "react";
import { addMinutes, syncTodoistReminders, upcomingReminders } from "@ortak/reminders";
import { dueLabel } from "@ortak/task-dates";
import { kopru, useBugun } from "@/veri/kanca";
import { useLocalTasks } from "@/veri/local-tasks";
import { useTodoistReminders } from "@/veri/reminders";

/**
 * Desktop side of reminders: while Argos runs (the window may be hidden in
 * the tray), a Windows notification appears when a reminder's moment comes.
 * The phone gets the same reminder from the Telegram Worker.
 *
 * A reminder missed by up to ten minutes (sleep, a slow start) still shows;
 * older ones are skipped. Shown ones are remembered so a reload does not
 * repeat them.
 */

const TICK_MS = 20_000;
/** How often the Todoist copy (titles, dates) behind Todoist reminders is refreshed. */
const TODOIST_SYNC_MS = 10 * 60_000;
const LATE_MINUTES = 10;
const SHOWN_KEY = "argos.hatirlatici.gosterilen";

const localMoment = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function readShown(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Keeps only keys whose moment ("…@YYYY-MM-DDTHH:MM") is within the last two days. */
function writeShown(shown: Set<string>, now: string): void {
  const floor = addMinutes(now, -2 * 1440);
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown].filter((k) => (k.split("@")[1] ?? "") >= floor)));
  } catch {
    // Without storage a reload may repeat a reminder once; nothing else breaks.
  }
}

export function ReminderBackground() {
  const local = useLocalTasks();
  const { file, change } = useTodoistReminders();
  const today = useBugun();
  const latest = useRef({ tasks: local.tasks, file, today });
  latest.current = { tasks: local.tasks, file, today };

  useEffect(() => {
    const tick = () => {
      const { tasks, file: rem, today: day } = latest.current;
      const now = localMoment(new Date());
      const due = upcomingReminders(tasks, rem, addMinutes(now, -LATE_MINUTES), now);
      if (due.length === 0) return;
      const shown = readShown();
      for (const h of due) {
        if (shown.has(h.key)) continue;
        shown.add(h.key);
        const when = h.due ? dueLabel(h.due, day).label : "Hatırlatıcı";
        void kopru()?.bildirimGoster(`⏰ ${h.title}`, when);
      }
      writeShown(shown, now);
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // A Todoist task moved in Takvim or on the phone must move its reminders
  // too: re-read Todoist now and then, but only when there is something to keep current.
  const hasTodoistReminders = Object.keys(file.todoist).length > 0;
  useEffect(() => {
    if (!hasTodoistReminders) return;
    const k = kopru();
    if (!k) return;
    const sync = async () => {
      try {
        if (!(await k.todoist.durum()).anahtarVar) return;
        const open = await k.todoist.allTasks();
        const live = open.map((g) => ({ id: g.id, title: g.icerik, due: g.tarih }));
        // Checked on the last known state, applied to the current one: a
        // reminder added meanwhile is not overwritten.
        if (syncTodoistReminders(latest.current.file, live)) {
          await change((current) => syncTodoistReminders(current, live) ?? current);
        }
      } catch {
        // Offline: the last known dates stay; the next round tries again.
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), TODOIST_SYNC_MS);
    const unsubscribe = k.todoistDegisimDinle(() => void sync());
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [hasTodoistReminders, change]);

  return null;
}
