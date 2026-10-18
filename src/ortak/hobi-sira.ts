// Explicit .ts extension: this file also runs under plain Node (araclar/hobi-sira-test.mts).

/**
 * The order of the Hobiler lists in the left column (issue #37). Kept in the
 * data folder, outside hobiler/ (every .json there is read as a list), so it
 * survives restarts and follows the folder to other machines. List files
 * are never renamed.
 */
export const HOBI_SIRA_PATH = "hobiler-sira.json";

export interface HobiSira {
  version: 1;
  /** List slugs (file names without .json), first to last. */
  sira: string[];
}

export const normalizeSira = (raw: unknown): string[] => {
  const sira = (raw as Partial<HobiSira> | null)?.sira;
  return Array.isArray(sira) ? sira.filter((s): s is string => typeof s === "string") : [];
};

/**
 * Lists in the saved order. Lists the order does not know yet (added later,
 * or before any reordering) follow at the end in their file-name order; a
 * deleted list's slug is simply skipped, so it leaves no gap.
 */
export function orderLists<T extends { slug: string }>(lists: T[], sira: string[]): T[] {
  const rank = new Map(sira.map((slug, i) => [slug, i]));
  return lists
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (rank.get(a.l.slug) ?? sira.length + a.i) - (rank.get(b.l.slug) ?? sira.length + b.i))
    .map((x) => x.l);
}

/**
 * The order after `moved` is dropped before (or after) `target`, from the
 * order on screen. Only lists that exist are written: the saved order holds
 * no deleted ones.
 */
export function moveList(onScreen: string[], moved: string, target: string, before: boolean): string[] {
  if (moved === target || !onScreen.includes(moved) || !onScreen.includes(target)) return onScreen;
  const rest = onScreen.filter((s) => s !== moved);
  const at = rest.indexOf(target) + (before ? 0 : 1);
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** One step up or down (Alt + arrow); unchanged at either end. */
export function stepList(onScreen: string[], slug: string, up: boolean): string[] {
  const i = onScreen.indexOf(slug);
  const neighbour = onScreen[up ? i - 1 : i + 1];
  if (i < 0 || neighbour === undefined) return onScreen;
  return moveList(onScreen, slug, neighbour, up);
}
