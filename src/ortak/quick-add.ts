// Explicit .ts extension: this file also runs under plain Node (araclar/quick-add-test.mts).
import type { Priority } from "./local-tasks.ts";
import { ONEMLI_ETIKETI } from "./tipler.ts";
import { hizliMetniCevir } from "./todoist-tarih.ts";

/**
 * Splits a one-line task entry — "IELTS kaydı yarın 18:00 p1 @önemli" — into
 * its parts. The date phrase is found with the quick-capture rules
 * (hizliMetniCevir), so the add box behaves like Ctrl+Alt+N does.
 */
export interface QuickAdd {
  title: string;
  /** The Turkish date phrase as typed ("yarın 18:00"), or null. */
  dateText: string | null;
  priority: Priority | null;
  important: boolean;
}

const PRIORITY = /^p([1-4])$/i;
const isImportantTag = (w: string): boolean =>
  w.startsWith("@") && w.slice(1).toLocaleLowerCase("tr-TR") === ONEMLI_ETIKETI;

export function splitQuickAdd(line: string, today?: string): QuickAdd {
  let priority: Priority | null = null;
  let important = false;
  const words = line
    .trim()
    .split(/\s+/)
    .filter((w) => {
      if (!w) return false;
      const p = w.match(PRIORITY);
      if (p) {
        priority = Number(p[1]) as Priority;
        return false;
      }
      if (isImportantTag(w)) {
        important = true;
        return false;
      }
      return true;
    });

  const text = words.join(" ");
  const { tarih } = hizliMetniCevir(text, today);
  if (!tarih) return { title: text, dateText: null, priority, important };

  // The phrase is a run of whole words; the rightmost match is the one picked.
  const at = text.lastIndexOf(tarih);
  const title = `${text.slice(0, at)} ${text.slice(at + tarih.length)}`.replace(/\s+/g, " ").trim();
  return { title, dateText: tarih, priority, important };
}
