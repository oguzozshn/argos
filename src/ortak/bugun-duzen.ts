// Explicit .ts extension: this file also runs under plain Node (araclar/bugun-duzen-test.mts).

/**
 * The Bugün screen's layout (issue #48): which cards are on it, where, and
 * how big, on a 12-column grid. Saved in the data folder so it is the same
 * on every machine using the folder. A card left out of the layout is
 * removed from the screen and can be added back.
 *
 * A card is an instance of a card type a module offers ("hobiler:liste").
 * Types that take settings (which list, week/month/year) can be added more
 * than once, each copy with its own settings.
 */
export const BUGUN_DUZEN_PATH = "bugun-duzen.json";

export const KOLON = 12;
/** Smallest card: a quarter of the width, a few rows high. */
export const EN_DAR = 3;
export const EN_KISA = 3;

/** A card's settings: setting key → chosen value (a list's slug, "hafta"…). */
export type KartAyari = Record<string, string>;

export interface KartYeri {
  /** This card's id: its type for a one-of-a-kind card, "<type>#<suffix>" for a copy. */
  id: string;
  /** The card type: "<module>:<kind>" ("yapilacak:ozet", "hobiler:liste"). */
  tur: string;
  ayar?: KartAyari;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BugunDuzen {
  version: 1;
  kartlar: KartYeri[];
}

/** A card type the modules offer, as the layout rules need it. */
export interface KartTanimi {
  id: string;
  /** An always-visible strip: full width at the top by default. */
  ust: boolean;
  /** Can be on the screen more than once (types with settings). */
  coklu?: boolean;
  w?: number;
  h?: number;
}

const tam = (n: unknown, varsayilan: number): number => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : varsayilan);

/** Keeps a card inside the grid and at least the smallest size. */
export function sinirla(k: KartYeri): KartYeri {
  const w = Math.min(KOLON, Math.max(EN_DAR, k.w));
  return {
    id: k.id,
    tur: k.tur,
    ...(k.ayar ? { ayar: k.ayar } : {}),
    w,
    h: Math.max(EN_KISA, k.h),
    x: Math.min(KOLON - w, Math.max(0, k.x)),
    y: Math.max(0, k.y),
  };
}

const ayarOku = (raw: unknown): KartAyari | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const sonuc: KartAyari = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") sonuc[k] = v;
  return Object.keys(sonuc).length ? sonuc : undefined;
};

/**
 * The saved layout, or null when there is none yet (the default is used).
 * Cards of types that no longer exist are dropped; a card id listed twice
 * keeps its first place. Layouts saved before card types existed have no
 * `tur`: their id is the type.
 */
export function normalizeDuzen(raw: unknown, bilinenTurler: string[]): KartYeri[] | null {
  const kartlar = (raw as Partial<BugunDuzen> | null)?.kartlar;
  if (!Array.isArray(kartlar)) return null;
  const bilinen = new Set(bilinenTurler);
  const gorulen = new Set<string>();
  const sonuc: KartYeri[] = [];
  for (const k of kartlar as (Partial<KartYeri> & { ayar?: unknown })[]) {
    if (typeof k?.id !== "string" || gorulen.has(k.id)) continue;
    const tur = typeof k.tur === "string" ? k.tur : k.id;
    if (!bilinen.has(tur)) continue;
    gorulen.add(k.id);
    const ayar = ayarOku(k.ayar);
    sonuc.push(sinirla({ id: k.id, tur, ...(ayar ? { ayar } : {}), x: tam(k.x, 0), y: tam(k.y, 0), w: tam(k.w, 6), h: tam(k.h, 8) }));
  }
  return sonuc;
}

const boyut = (k: KartTanimi) => ({ w: k.w ?? (k.ust ? KOLON : 6), h: k.h ?? (k.ust ? 5 : 9) });

/** Strips first, full width; the other one-of-a-kind cards two per row, as the screen looked before. */
export function varsayilanDuzen(kartlar: KartTanimi[]): KartYeri[] {
  const sonuc: KartYeri[] = [];
  let y = 0;
  for (const k of kartlar.filter((k) => k.ust && !k.coklu)) {
    sonuc.push({ id: k.id, tur: k.id, x: 0, y, w: KOLON, h: boyut(k).h });
    y += boyut(k).h;
  }
  kartlar
    .filter((k) => !k.ust && !k.coklu)
    .forEach((k, i) => sonuc.push({ id: k.id, tur: k.id, x: (i % 2) * 6, y: y + Math.floor(i / 2) * 9, w: 6, h: 9 }));
  return sonuc;
}

/** The row below every card: where an added card goes. */
export const altSinir = (duzen: KartYeri[]): number => duzen.reduce((m, k) => Math.max(m, k.y + k.h), 0);

/**
 * Where a new w×h card goes: beside the cards of the last row when there is
 * room, else below everything. Adding several cards then fills the row
 * instead of stacking them in one column.
 */
function bosYer(duzen: KartYeri[], w: number, h: number): { x: number; y: number } {
  const alt = altSinir(duzen);
  const sonSatir = duzen.reduce((m, k) => Math.max(m, k.y), 0);
  const cakisir = (x: number, y: number) =>
    duzen.some((k) => x < k.x + k.w && k.x < x + w && y < k.y + k.h && k.y < y + h);
  for (let y = sonSatir; y < alt; y++) {
    for (let x = 0; x + w <= KOLON; x++) if (!cakisir(x, y)) return { x, y };
  }
  return { x: 0, y: alt };
}

/**
 * Adds a card in the first free place of the last row (see `bosYer`). A
 * one-of-a-kind type already on the screen is not added again; a type that
 * can repeat gets the given copy id and settings.
 */
export function kartEkle(duzen: KartYeri[], kart: KartTanimi, kopyaId?: string, ayar?: KartAyari): KartYeri[] {
  if (!kart.coklu && duzen.some((k) => k.tur === kart.id)) return duzen;
  const id = kart.coklu ? (kopyaId ?? `${kart.id}#${duzen.length + 1}`) : kart.id;
  if (duzen.some((k) => k.id === id)) return duzen;
  const { w, h } = boyut(kart);
  return [...duzen, { id, tur: kart.id, ...(ayar && Object.keys(ayar).length ? { ayar } : {}), ...bosYer(duzen, w, h), w, h }];
}

export const kartKaldir = (duzen: KartYeri[], id: string): KartYeri[] => duzen.filter((k) => k.id !== id);

/** Changes one card's settings, keeping its place. */
export const kartAyarla = (duzen: KartYeri[], id: string, ayar: KartAyari): KartYeri[] =>
  duzen.map((k) => (k.id === id ? { ...k, ayar } : k));

/** Cards in reading order (top to bottom, left to right): the stacked order on a narrow window. */
export const okumaSirasi = (duzen: KartYeri[]): KartYeri[] => [...duzen].sort((a, b) => a.y - b.y || a.x - b.x);

const ayarAnahtari = (a?: KartAyari) => JSON.stringify(Object.entries(a ?? {}).sort());

/** Same cards, same places, same settings: no write needed. */
export const ayniDuzen = (a: KartYeri[], b: KartYeri[]): boolean =>
  a.length === b.length &&
  a.every((k) =>
    b.some(
      (m) => m.id === k.id && m.tur === k.tur && m.x === k.x && m.y === k.y && m.w === k.w && m.h === k.h && ayarAnahtari(m.ayar) === ayarAnahtari(k.ayar),
    ),
  );
