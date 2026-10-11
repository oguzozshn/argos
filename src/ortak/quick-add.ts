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

/** "Kişisel Gelişim" and "#KişiselGelişim" or "#kisisel_gelisim"-style tags meet here. */
const simplify = (s: string): string => s.toLocaleLowerCase("tr-TR").replace(/[\s_-]+/g, "");

/**
 * The first "#tag" that names a project, and the line without it. Null when
 * no tag matches (Todoist then reads the line as typed).
 */
export function findProjectTag(
  line: string,
  projects: { id: string; name: string }[],
): { projectId: string; rest: string } | null {
  const words = line.trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (!w.startsWith("#") || w.length < 2) continue;
    const hit = projects.find((p) => simplify(p.name) === simplify(w.slice(1)));
    if (hit) return { projectId: hit.id, rest: [...words.slice(0, i), ...words.slice(i + 1)].join(" ") };
  }
  return null;
}

export interface TodoistQuickAdd {
  content: string;
  /** The project a "#tag" named, or null for Inbox. */
  projectId: string | null;
  labels: string[];
  /** Todoist's scale (4 = P1), or null. */
  priority: number | null;
  dueText: string | null;
}

/**
 * Argos's own reading of a Todoist quick-add line, for when Todoist cannot
 * be reached: "#Proje" (a project in the copy), "@etiket", "p1"–"p4" and a
 * Turkish date phrase. Online, Todoist's Quick Add reads the line itself.
 */
export function parseTodoistQuickAdd(
  line: string,
  projects: { id: string; name: string }[],
  today?: string,
): TodoistQuickAdd {
  let projectId: string | null = null;
  const labels: string[] = [];
  const rest = line
    .trim()
    .split(/\s+/)
    .filter((w) => {
      if (w.startsWith("#") && w.length > 1 && projectId === null) {
        const hit = projects.find((p) => simplify(p.name) === simplify(w.slice(1)));
        if (hit) {
          projectId = hit.id;
          return false;
        }
      }
      if (w.startsWith("@") && w.length > 1) {
        labels.push(w.slice(1));
        return false;
      }
      return true;
    })
    .join(" ");
  const q = splitQuickAdd(rest, today);
  return {
    content: q.title,
    projectId,
    labels,
    priority: q.priority ? 5 - q.priority : null,
    dueText: q.dateText,
  };
}
