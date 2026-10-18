// Explicit .ts extension: this file also runs under plain Node (araclar/yuksek-lisans-test.mts).
import { gunEkle, gunFarki, haftaninGunu } from "./gun.ts";

/**
 * Yüksek Lisans (issue #57): courses, their goals, and the study plan laid
 * on the calendar day by day.
 *
 * A goal is either hours ("20 Kasım'a kadar 20 saat") or a book's pages
 * ("1 Ocak'a kadar Software Requirements Engineering, 700 sayfa"). The
 * plan puts an amount of a goal on a day; ticking it counts it as done.
 * Hours are kept in minutes so sums stay whole. Pages turn into effort
 * with the book's minutes per page, so a week has one effort total.
 */

export const YL_YOLU = "yuksek-lisans.json";

export type HedefTuru = "saat" | "sayfa";

export interface YlHedef {
  id: string;
  tur: HedefTuru;
  /** "Haftalık çalışma", or the book's title. */
  ad: string;
  /** Minutes for an hours goal, pages for a book. */
  miktar: number;
  /** "YYYY-MM-DD". */
  sonTarih: string;
  /** Book only: minutes a page takes, for the effort total. */
  sayfaDk?: number;
}

export interface Ders {
  id: string;
  ad: string;
  renk: string;
  hedefler: YlHedef[];
  arsiv?: boolean;
}

/** One goal's share of a day. */
export interface PlanOgesi {
  id: string;
  hedefId: string;
  /** Minutes or pages, the goal's unit. */
  miktar: number;
  yapildi?: boolean;
}

export interface YlDosyasi {
  version: 1;
  dersler: Ders[];
  /** Plan by ISO date. */
  plan: Record<string, PlanOgesi[]>;
}

export const BOS_YL: YlDosyasi = { version: 1, dersler: [], plan: {} };
export const VARSAYILAN_SAYFA_DK = 2;
export const DERS_RENKLERI = ["#7c8cf8", "#4fb38a", "#e0a34a", "#d9708f", "#4aa8c9", "#a585e0", "#c98a5b"];

const sayi = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);

export function normalizeYl(ham: unknown): YlDosyasi {
  const d = (ham && typeof ham === "object" ? ham : {}) as Record<string, unknown>;
  const dersler = (Array.isArray(d.dersler) ? d.dersler : [])
    .filter((x): x is Ders => Boolean(x) && typeof x.id === "string" && typeof x.ad === "string")
    .map((x, i) => ({
      id: x.id,
      ad: x.ad,
      renk: typeof x.renk === "string" ? x.renk : DERS_RENKLERI[i % DERS_RENKLERI.length]!,
      ...(x.arsiv ? { arsiv: true } : {}),
      hedefler: (Array.isArray(x.hedefler) ? x.hedefler : [])
        .filter(
          (h): h is YlHedef =>
            Boolean(h) && typeof h.id === "string" && (h.tur === "saat" || h.tur === "sayfa") && typeof h.sonTarih === "string",
        )
        .map((h) => ({
          id: h.id,
          tur: h.tur,
          ad: typeof h.ad === "string" ? h.ad : "",
          miktar: sayi(h.miktar),
          sonTarih: h.sonTarih,
          ...(h.tur === "sayfa" ? { sayfaDk: sayi(h.sayfaDk) || VARSAYILAN_SAYFA_DK } : {}),
        })),
    }));
  const hedefVar = new Set(dersler.flatMap((x) => x.hedefler.map((h) => h.id)));
  const plan: Record<string, PlanOgesi[]> = {};
  const hamPlan = d.plan && typeof d.plan === "object" ? (d.plan as Record<string, unknown>) : {};
  for (const [gun, liste] of Object.entries(hamPlan)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gun) || !Array.isArray(liste)) continue;
    const ogeler = liste
      .filter((o): o is PlanOgesi => Boolean(o) && typeof o.id === "string" && hedefVar.has(o.hedefId) && sayi(o.miktar) > 0)
      .map((o) => ({ id: o.id, hedefId: o.hedefId, miktar: o.miktar, ...(o.yapildi ? { yapildi: true } : {}) }));
    if (ogeler.length) plan[gun] = ogeler;
  }
  return { version: 1, dersler, plan };
}

/* --- lookups ------------------------------------------------------------------------ */

export function hedefBul(d: YlDosyasi, hedefId: string): { ders: Ders; hedef: YlHedef } | null {
  for (const ders of d.dersler) {
    const hedef = ders.hedefler.find((h) => h.id === hedefId);
    if (hedef) return { ders, hedef };
  }
  return null;
}

/** Effort of an amount of a goal, in minutes. */
export const eforDk = (hedef: YlHedef, miktar: number): number =>
  hedef.tur === "saat" ? miktar : Math.round(miktar * (hedef.sayfaDk ?? VARSAYILAN_SAYFA_DK));

/** "2 sa 30 dk", "45 dk" for an hours goal; "40 sayfa" for a book. */
export function miktarMetni(tur: HedefTuru, miktar: number): string {
  if (tur === "sayfa") return `${miktar} sayfa`;
  const sa = Math.floor(miktar / 60);
  const dk = Math.round(miktar % 60);
  if (!sa) return `${dk} dk`;
  return dk ? `${sa} sa ${dk} dk` : `${sa} sa`;
}

/* --- progress ----------------------------------------------------------------------- */

export interface HedefDurumu {
  /** Planned in total, on any day (done or not). */
  planli: number;
  yapilan: number;
  /** Not on the calendar yet: goal − planned, never below 0. */
  plansiz: number;
  /** Days left until the deadline, today included; 0 when it has passed. */
  kalanGun: number;
  /** What a day needs from today to finish what is not done yet. */
  gunluk: number;
}

export function hedefDurumu(d: YlDosyasi, hedef: YlHedef, bugun: string): HedefDurumu {
  let planli = 0;
  let yapilan = 0;
  for (const ogeler of Object.values(d.plan)) {
    for (const o of ogeler) {
      if (o.hedefId !== hedef.id) continue;
      planli += o.miktar;
      if (o.yapildi) yapilan += o.miktar;
    }
  }
  const kalanGun = Math.max(0, gunFarki(hedef.sonTarih, bugun) + 1);
  const kalan = Math.max(0, hedef.miktar - yapilan);
  return {
    planli,
    yapilan,
    plansiz: Math.max(0, hedef.miktar - planli),
    kalanGun,
    gunluk: kalanGun ? Math.ceil(kalan / kalanGun) : kalan,
  };
}

/* --- weekly effort --------------------------------------------------------------------- */

export const haftaBasi = (iso: string): string => gunEkle(iso, -haftaninGunu(iso));

export interface HaftaEforu {
  planliDk: number;
  yapilanDk: number;
  /** Per course, for the Hafta screen. */
  dersler: { ders: Ders; planliDk: number; yapilanDk: number }[];
}

/** Effort planned and done in the week starting on Monday `bas`. */
export function haftaEforu(d: YlDosyasi, bas: string): HaftaEforu {
  const derse = new Map<string, { ders: Ders; planliDk: number; yapilanDk: number }>();
  let planliDk = 0;
  let yapilanDk = 0;
  for (let i = 0; i < 7; i++) {
    for (const o of d.plan[gunEkle(bas, i)] ?? []) {
      const b = hedefBul(d, o.hedefId);
      if (!b) continue;
      const dk = eforDk(b.hedef, o.miktar);
      planliDk += dk;
      if (o.yapildi) yapilanDk += dk;
      const x = derse.get(b.ders.id) ?? derse.set(b.ders.id, { ders: b.ders, planliDk: 0, yapilanDk: 0 }).get(b.ders.id)!;
      x.planliDk += dk;
      if (o.yapildi) x.yapilanDk += dk;
    }
  }
  return { planliDk, yapilanDk, dersler: [...derse.values()] };
}

/* --- edits --------------------------------------------------------------------------- */

export const planEkle = (d: YlDosyasi, gun: string, o: PlanOgesi): YlDosyasi =>
  o.miktar > 0 && hedefBul(d, o.hedefId) ? { ...d, plan: { ...d.plan, [gun]: [...(d.plan[gun] ?? []), o] } } : d;

function planDegistir(d: YlDosyasi, gun: string, f: (l: PlanOgesi[]) => PlanOgesi[]): YlDosyasi {
  const liste = f(d.plan[gun] ?? []);
  const plan = { ...d.plan };
  if (liste.length) plan[gun] = liste;
  else delete plan[gun];
  return { ...d, plan };
}

export const planSil = (d: YlDosyasi, gun: string, id: string): YlDosyasi => planDegistir(d, gun, (l) => l.filter((o) => o.id !== id));

export const planIsaretle = (d: YlDosyasi, gun: string, id: string, yapildi: boolean): YlDosyasi =>
  planDegistir(d, gun, (l) => l.map((o) => (o.id === id ? { ...o, yapildi: yapildi || undefined } : o)));

/** Moves a plan item to another day (drag on the calendar). */
export function planTasi(d: YlDosyasi, gun: string, id: string, yeniGun: string): YlDosyasi {
  const o = (d.plan[gun] ?? []).find((x) => x.id === id);
  if (!o || gun === yeniGun) return d;
  return planDegistir(planDegistir(d, gun, (l) => l.filter((x) => x.id !== id)), yeniGun, (l) => [...l, o]);
}

/** Removing a goal also removes its days from the plan. */
export function hedefSil(d: YlDosyasi, dersId: string, hedefId: string): YlDosyasi {
  const dersler = d.dersler.map((x) => (x.id === dersId ? { ...x, hedefler: x.hedefler.filter((h) => h.id !== hedefId) } : x));
  const plan: Record<string, PlanOgesi[]> = {};
  for (const [gun, l] of Object.entries(d.plan)) {
    const kalan = l.filter((o) => o.hedefId !== hedefId);
    if (kalan.length) plan[gun] = kalan;
  }
  return { ...d, dersler, plan };
}

/** Removing a course removes its goals and their days. */
export function dersSil(d: YlDosyasi, dersId: string): YlDosyasi {
  const ders = d.dersler.find((x) => x.id === dersId);
  if (!ders) return d;
  const sonra = ders.hedefler.reduce((acc, h) => hedefSil(acc, dersId, h.id), d);
  return { ...sonra, dersler: sonra.dersler.filter((x) => x.id !== dersId) };
}
