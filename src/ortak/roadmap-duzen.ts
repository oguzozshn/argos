// Explicit .ts extension: this file also runs under plain Node (araclar/asistan-duzen-test.mts).
import type { Roadmap, RoadmapAdim, RoadmapAsama } from "./ozet.ts";

/**
 * Editing a roadmap (issue #56): pure steps the Yol haritaları screen
 * applies to `roadmap/<slug>.json`. Fields this code does not know
 * (`baslangic`, `bittiSayilir`, what app.py adds) are carried over as they
 * are, so the old app keeps reading the same file.
 */

export type DuzenAsama = RoadmapAsama & { bittiSayilir?: string };
export type DuzenRoadmap = Omit<Roadmap, "asamalar"> & { baslangic?: string; asamalar: DuzenAsama[] };

const ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };

/** File name for a new roadmap: "Ses ve diksiyon" → "ses-ve-diksiyon", unique among `mevcut`. */
export function roadmapSlug(alan: string, mevcut: string[]): string {
  const kok =
    alan
      .toLocaleLowerCase("tr")
      .replace(/[çğıİöşü]/g, (c) => ASCII[c] ?? c)
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-|-$/g, "") || "harita";
  let slug = kok;
  for (let i = 2; mevcut.includes(slug); i++) slug = `${kok}-${i}`;
  return slug;
}

/** A new roadmap starts with stage 0, finding the current level (the rule of the old app). */
export function yeniRoadmap(alan: string, hedef: string, slug: string): DuzenRoadmap {
  return {
    slug,
    alan,
    hedef,
    baslangic: "",
    suAnAsama: 0,
    asamalar: [{ ad: "Seviye tespiti", tahminiSaat: 2, adimlar: [], bittiSayilir: "" }],
  };
}

const asamaDegistir = (rm: DuzenRoadmap, i: number, f: (a: DuzenAsama) => DuzenAsama): DuzenRoadmap =>
  i < 0 || i >= rm.asamalar.length ? rm : { ...rm, asamalar: rm.asamalar.map((a, k) => (k === i ? f(a) : a)) };

export const asamaEkle = (rm: DuzenRoadmap, ad: string): DuzenRoadmap => ({
  ...rm,
  asamalar: [...rm.asamalar, { ad: ad.trim() || `Aşama ${rm.asamalar.length}`, tahminiSaat: 0, adimlar: [], bittiSayilir: "" }],
});

export const asamaGuncelle = (rm: DuzenRoadmap, i: number, patch: Partial<Omit<DuzenAsama, "adimlar">>): DuzenRoadmap =>
  asamaDegistir(rm, i, (a) => ({ ...a, ...patch }));

/** Removes a stage; the "current" mark stays on the same stage, or the one that takes its place. */
export function asamaSil(rm: DuzenRoadmap, i: number): DuzenRoadmap {
  if (i < 0 || i >= rm.asamalar.length) return rm;
  const asamalar = rm.asamalar.filter((_, k) => k !== i);
  const su = rm.suAnAsama ?? 0;
  const yeniSu = su > i ? su - 1 : Math.min(su, Math.max(0, asamalar.length - 1));
  return { ...rm, asamalar, suAnAsama: yeniSu };
}

/** Moves a stage one place up (-1) or down (+1); the "current" mark follows its stage. */
export function asamaTasi(rm: DuzenRoadmap, i: number, yon: -1 | 1): DuzenRoadmap {
  const j = i + yon;
  if (i < 0 || j < 0 || i >= rm.asamalar.length || j >= rm.asamalar.length) return rm;
  const asamalar = [...rm.asamalar];
  [asamalar[i], asamalar[j]] = [asamalar[j]!, asamalar[i]!];
  const su = rm.suAnAsama ?? 0;
  return { ...rm, asamalar, suAnAsama: su === i ? j : su === j ? i : su };
}

export const suAnYap = (rm: DuzenRoadmap, i: number): DuzenRoadmap =>
  i < 0 || i >= rm.asamalar.length ? rm : { ...rm, suAnAsama: i };

export const adimEkle = (rm: DuzenRoadmap, i: number, metin: string): DuzenRoadmap =>
  metin.trim() ? asamaDegistir(rm, i, (a) => ({ ...a, adimlar: [...a.adimlar, { metin: metin.trim(), yapildi: false }] })) : rm;

export const adimGuncelle = (rm: DuzenRoadmap, i: number, j: number, patch: Partial<RoadmapAdim>): DuzenRoadmap =>
  asamaDegistir(rm, i, (a) => ({ ...a, adimlar: a.adimlar.map((x, k) => (k === j ? { ...x, ...patch } : x)) }));

export const adimSil = (rm: DuzenRoadmap, i: number, j: number): DuzenRoadmap =>
  asamaDegistir(rm, i, (a) => ({ ...a, adimlar: a.adimlar.filter((_, k) => k !== j) }));

export function adimTasi(rm: DuzenRoadmap, i: number, j: number, yon: -1 | 1): DuzenRoadmap {
  return asamaDegistir(rm, i, (a) => {
    const k = j + yon;
    if (j < 0 || k < 0 || j >= a.adimlar.length || k >= a.adimlar.length) return a;
    const adimlar = [...a.adimlar];
    [adimlar[j], adimlar[k]] = [adimlar[k]!, adimlar[j]!];
    return { ...a, adimlar };
  });
}
