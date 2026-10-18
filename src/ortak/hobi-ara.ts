// Explicit .ts extension: this file also runs under plain Node (araclar/hobi-ara-test.mts).

/**
 * Search inside a Hobiler list (issue #34). Case-insensitive, and Turkish
 * letters match their plain forms, so "sekiro" finds "Şekiro" and "isik"
 * finds "Işık": people type both ways.
 */

const PLAIN: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ç: "c", ö: "o", ü: "u" };

export const plain = (s: string): string =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/[ışğçöü]/g, (c) => PLAIN[c] ?? c)
    // Other accents ("é", "â") read as their base letter too.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** The searchable text of an entry: its name and its notes. */
export interface Searchable {
  ad: string;
  not: string;
  notlar?: { metin: string }[];
}

/** Whether the entry matches every word of the query. An empty query matches all. */
export function matches(entry: Searchable, query: string): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = plain([entry.ad, entry.not, ...(entry.notlar ?? []).map((n) => n.metin)].join(" "));
  return words.every((w) => text.includes(w));
}

/* --- existing entries while adding (issue #38) ------------------------------- */

const wordsOf = (s: string): string[] => plain(s).split(/[\s\-–—:.,;!?'’"()/]+/).filter(Boolean);

export interface ExistingMatch<T> {
  entry: T;
  /** Same name as typed (ignoring case and Turkish letters). */
  exact: boolean;
}

/**
 * Entries of the list that the name being typed may already be: every typed
 * word must start a word of the entry's name ("metro" and "metro 20" find
 * "Metro 2033", "metro e" does not). "#category" words are left out, as
 * they are not part of the name. Exact matches come first.
 */
export function existingMatches<T extends { ad: string }>(entries: T[], typed: string, limit = 5): ExistingMatch<T>[] {
  const name = typed
    .split(/\s+/)
    .filter((w) => !w.startsWith("#"))
    .join(" ");
  const query = wordsOf(name);
  if (query.length === 0) return [];
  const exactName = query.join(" ");
  const found: ExistingMatch<T>[] = [];
  for (const entry of entries) {
    const words = wordsOf(entry.ad);
    if (query.every((q) => words.some((w) => w.startsWith(q)))) {
      found.push({ entry, exact: words.join(" ") === exactName });
    }
  }
  return found.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, limit);
}
