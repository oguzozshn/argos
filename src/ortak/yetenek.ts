// Explicit .ts extension: this file also runs under plain Node (araclar/asistan-duzen-test.mts).
import type { Kurallar } from "./ozet.ts";

/**
 * Skills (issue #56). A skill is an area of `kurallar.json` (İngilizce,
 * Gitar…): the plan already counts time by area and roadmaps belong to
 * one. What the plan has no place for lives in `yetenekler.json`: the
 * dream it serves (K21: an output, not a level), the activities, and the
 * measurements that used to sit in yetenekler/ilerleme.md (IELTS score,
 * pages read…), kept with their dates so the trend shows.
 */

export const YETENEK_YOLU = "yetenekler.json";

export interface Olcum {
  id: string;
  ad: string;
  deger: string;
  /** "YYYY-MM-DD". */
  tarih: string;
}

export interface YetenekKaydi {
  hayal?: string;
  aktiviteler?: string;
  olcumler?: Olcum[];
}

export interface YetenekDosyasi {
  version: 1;
  yetenekler: Record<string, YetenekKaydi>;
}

export const BOS_YETENEKLER: YetenekDosyasi = { version: 1, yetenekler: {} };

export type YetenekRolu = "sabit" | "rotasyon" | "diger";

/** The plan's own areas, make-up time and the weekly close: not skills (see SAYILMAZ in kural.ts). */
export const YETENEK_DISI: readonly string[] = ["Serbest", "Kapanış"];

/** The areas shown as skills: every week first, then the rotation, then the rest, each in the plan's order. */
export function yetenekAlanlari(alanlar: string[], kurallar: Kurallar): string[] {
  const liste = alanlar.filter((a) => !YETENEK_DISI.includes(a));
  return (["sabit", "rotasyon", "diger"] as const).flatMap((rol) => liste.filter((a) => yetenekRolu(a, kurallar) === rol));
}

/** Where an area stands in the weekly plan: every week (K02), in the rotation pool, or neither. */
export function yetenekRolu(alan: string, kurallar: Kurallar): YetenekRolu {
  if ((kurallar.sabitAlanlar ?? []).includes(alan)) return "sabit";
  if ((kurallar.rotasyonHavuzu ?? []).includes(alan)) return "rotasyon";
  return "diger";
}

export function normalizeYetenekler(ham: unknown): YetenekDosyasi {
  const d = (ham && typeof ham === "object" ? ham : {}) as { yetenekler?: unknown };
  const kayitlar = d.yetenekler && typeof d.yetenekler === "object" ? (d.yetenekler as Record<string, unknown>) : {};
  const yetenekler: Record<string, YetenekKaydi> = {};
  for (const [alan, k] of Object.entries(kayitlar)) {
    if (!k || typeof k !== "object") continue;
    const r = k as Record<string, unknown>;
    yetenekler[alan] = {
      ...(typeof r.hayal === "string" ? { hayal: r.hayal } : {}),
      ...(typeof r.aktiviteler === "string" ? { aktiviteler: r.aktiviteler } : {}),
      olcumler: (Array.isArray(r.olcumler) ? r.olcumler : []).filter(
        (o): o is Olcum =>
          Boolean(o) && typeof o.id === "string" && typeof o.ad === "string" && typeof o.deger === "string" && typeof o.tarih === "string",
      ),
    };
  }
  return { version: 1, yetenekler };
}

export const yetenekGuncelle = (d: YetenekDosyasi, alan: string, patch: Partial<YetenekKaydi>): YetenekDosyasi => ({
  ...d,
  yetenekler: { ...d.yetenekler, [alan]: { ...d.yetenekler[alan], ...patch } },
});

export const olcumEkle = (d: YetenekDosyasi, alan: string, o: Olcum): YetenekDosyasi =>
  yetenekGuncelle(d, alan, { olcumler: [...(d.yetenekler[alan]?.olcumler ?? []), o] });

export const olcumSil = (d: YetenekDosyasi, alan: string, id: string): YetenekDosyasi =>
  yetenekGuncelle(d, alan, { olcumler: (d.yetenekler[alan]?.olcumler ?? []).filter((o) => o.id !== id) });

/**
 * The measurements grouped by name, each group newest first: the latest
 * value on top, the earlier ones under it as the trend.
 */
export function olcumGruplari(olcumler: Olcum[]): { ad: string; kayitlar: Olcum[] }[] {
  const gruplar = new Map<string, Olcum[]>();
  for (const o of olcumler) (gruplar.get(o.ad) ?? gruplar.set(o.ad, []).get(o.ad)!).push(o);
  return [...gruplar.entries()]
    .map(([ad, kayitlar]) => ({ ad, kayitlar: [...kayitlar].sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0)) }))
    .sort((a, b) => (a.kayitlar[0]!.tarih < b.kayitlar[0]!.tarih ? 1 : -1));
}

/** Adds an area to the plan's list (a new skill); a name already there is not added again. */
export function alanEkle<K extends { alanlar?: string[] }>(kurallar: K, alan: string): K {
  const ad = alan.trim();
  const alanlar = kurallar.alanlar ?? [];
  if (!ad || alanlar.some((a) => a.toLocaleLowerCase("tr") === ad.toLocaleLowerCase("tr"))) return kurallar;
  return { ...kurallar, alanlar: [...alanlar, ad] };
}
