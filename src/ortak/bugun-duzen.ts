// Explicit .ts extension: this file also runs under plain Node (araclar/bugun-duzen-test.mts).

/**
 * The Bugün screen's layout (issue #48): which cards are on it, where, and
 * how big, on a 12-column grid. Saved in the data folder so it is the same
 * on every machine using the folder. A card left out of the layout is
 * removed from the screen and can be added back.
 */
export const BUGUN_DUZEN_PATH = "bugun-duzen.json";

export const KOLON = 12;
/** Smallest card: a third of the width, a few rows high. */
export const EN_DAR = 3;
export const EN_KISA = 3;

export interface KartYeri {
  /** "<module>:ozet" or "<module>:ust". */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BugunDuzen {
  version: 1;
  kartlar: KartYeri[];
}

/** A card the modules offer. `ust` cards (always-visible strips) default to full width at the top. */
export interface KartTanimi {
  id: string;
  ust: boolean;
}

const tam = (n: unknown, varsayilan: number): number => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : varsayilan);

/** Keeps a card inside the grid and at least the smallest size. */
export function sinirla(k: KartYeri): KartYeri {
  const w = Math.min(KOLON, Math.max(EN_DAR, k.w));
  return { id: k.id, w, h: Math.max(EN_KISA, k.h), x: Math.min(KOLON - w, Math.max(0, k.x)), y: Math.max(0, k.y) };
}

/**
 * The saved layout, or null when there is none yet (the default is used).
 * Cards of modules that no longer exist are dropped; a card listed twice
 * keeps its first place.
 */
export function normalizeDuzen(raw: unknown, bilinenler: string[]): KartYeri[] | null {
  const kartlar = (raw as Partial<BugunDuzen> | null)?.kartlar;
  if (!Array.isArray(kartlar)) return null;
  const bilinen = new Set(bilinenler);
  const gorulen = new Set<string>();
  const sonuc: KartYeri[] = [];
  for (const k of kartlar as Partial<KartYeri>[]) {
    if (typeof k?.id !== "string" || !bilinen.has(k.id) || gorulen.has(k.id)) continue;
    gorulen.add(k.id);
    sonuc.push(sinirla({ id: k.id, x: tam(k.x, 0), y: tam(k.y, 0), w: tam(k.w, 6), h: tam(k.h, 8) }));
  }
  return sonuc;
}

/** Strips first, full width; the other cards two per row, as the screen looked before. */
export function varsayilanDuzen(kartlar: KartTanimi[]): KartYeri[] {
  const sonuc: KartYeri[] = [];
  let y = 0;
  for (const k of kartlar.filter((k) => k.ust)) {
    sonuc.push({ id: k.id, x: 0, y, w: KOLON, h: 5 });
    y += 5;
  }
  kartlar
    .filter((k) => !k.ust)
    .forEach((k, i) => sonuc.push({ id: k.id, x: (i % 2) * 6, y: y + Math.floor(i / 2) * 9, w: 6, h: 9 }));
  return sonuc;
}

/** The row below every card: where an added card goes. */
export const altSinir = (duzen: KartYeri[]): number => duzen.reduce((m, k) => Math.max(m, k.y + k.h), 0);

/** Adds a card at the bottom (half width, or full width for a strip). Already there: unchanged. */
export function kartEkle(duzen: KartYeri[], kart: KartTanimi): KartYeri[] {
  if (duzen.some((k) => k.id === kart.id)) return duzen;
  return [...duzen, { id: kart.id, x: 0, y: altSinir(duzen), w: kart.ust ? KOLON : 6, h: kart.ust ? 5 : 9 }];
}

export const kartKaldir = (duzen: KartYeri[], id: string): KartYeri[] => duzen.filter((k) => k.id !== id);

/** Cards in reading order (top to bottom, left to right): the stacked order on a narrow window. */
export const okumaSirasi = (duzen: KartYeri[]): KartYeri[] => [...duzen].sort((a, b) => a.y - b.y || a.x - b.x);

/** Same cards, same places: no write needed. */
export const ayniDuzen = (a: KartYeri[], b: KartYeri[]): boolean =>
  a.length === b.length &&
  a.every((k) => b.some((m) => m.id === k.id && m.x === k.x && m.y === k.y && m.w === k.w && m.h === k.h));
