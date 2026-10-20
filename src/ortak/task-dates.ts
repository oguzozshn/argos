// Explicit .ts extension: this file also runs under plain Node (araclar/task-dates-test.mts).
import { AY_ADLARI, GUN_ADLARI, gunFarki, haftaninGunu } from "./gun.ts";

/**
 * How a task's date reads in a list: "Bugün 18:00", "Perşembe", "13 Ağu".
 * Pure, so the screen and the tests agree on the wording.
 */

export type DateTone = "overdue" | "today" | "tomorrow" | "later";

export function dueLabel(due: string, today: string): { label: string; tone: DateTone } {
  const iso = due.slice(0, 10);
  const time = due.length > 10 ? due.slice(11, 16) : null;
  const diff = gunFarki(iso, today);
  let label: string;
  if (diff === 0) label = "Bugün";
  else if (diff === 1) label = "Yarın";
  else if (diff === -1) label = "Dün";
  else if (diff > 1 && diff < 7) label = GUN_ADLARI[haftaninGunu(iso)]!;
  else {
    const [y, m, d] = iso.split("-").map(Number);
    label = `${d} ${AY_ADLARI[m! - 1]}${iso.slice(0, 4) !== today.slice(0, 4) ? ` ${y}` : ""}`;
  }
  if (time) label += ` ${time}`;
  const tone: DateTone = diff < 0 ? "overdue" : diff === 0 ? "today" : diff === 1 ? "tomorrow" : "later";
  return { label, tone };
}

export type DateGroup = "Gecikmiş" | "Bugün" | "Yarın" | "Bu hafta" | "Sonra" | "Tarihsiz";

export const DATE_GROUPS: DateGroup[] = ["Gecikmiş", "Bugün", "Yarın", "Bu hafta", "Sonra", "Tarihsiz"];

export function dateGroup(due: string | null, today: string): DateGroup {
  if (!due) return "Tarihsiz";
  const diff = gunFarki(due.slice(0, 10), today);
  if (diff < 0) return "Gecikmiş";
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  return diff <= 7 ? "Bu hafta" : "Sonra";
}

/** Earlier date first (all-day before timed on the same day), then higher priority, then title. */
export function compareTasks(
  a: { due: string | null; priority: number; title: string },
  b: { due: string | null; priority: number; title: string },
): number {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.title.localeCompare(b.title, "tr");
}

/** Groups tasks in display order, leaving out empty groups. */
export function groupByDate<T extends { due: string | null; priority: number; title: string }>(
  tasks: T[],
  today: string,
): { group: DateGroup; tasks: T[] }[] {
  const by = new Map<DateGroup, T[]>();
  for (const t of tasks) {
    const g = dateGroup(t.due, today);
    (by.get(g) ?? by.set(g, []).get(g)!).push(t);
  }
  return DATE_GROUPS.filter((g) => by.has(g)).map((g) => ({ group: g, tasks: by.get(g)!.sort(compareTasks) }));
}

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/**
 * When a task was added, in local time: "18 Ekim 2026 · 14:32 · 2 gün önce".
 * `now` is passed in so the screen and the tests agree; an unreadable date gives null.
 */
export function addedLabel(iso: string, now: Date): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayOf = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((dayOf(now) - dayOf(d)) / 86400000);
  const ago =
    days <= 0 ? "bugün" : days === 1 ? "dün" : days < 14 ? `${days} gün önce` : days < 60 ? `${Math.floor(days / 7)} hafta önce` : days < 730 ? `${Math.floor(days / 30)} ay önce` : `${Math.floor(days / 365)} yıl önce`;
  return `${when} · ${ago}`;
}
