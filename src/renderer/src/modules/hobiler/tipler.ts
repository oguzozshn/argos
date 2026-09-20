/**
 * Hobi alanı = bir liste dosyası: `data/hobiler/<slug>.json`.
 * Alanlar kullanıcı tarafından açılır; şema hepsinde aynı.
 *
 * Bilerek yok: oran, seri, tamamlanma yüzdesi. Bu bir envanter, plan değil —
 * bitmemiş oyun sayısı gösteren ekran suçluluk yığını üretir.
 */

import type { HobiNotu } from "@ortak/hobi-not";

export interface Madde {
  id: string;
  ad: string;
  /** Durumun ADI tutulur, sırası değil: sıralama değişince kayıtlar bozulmasın. */
  durum: string;
  not: string;
  eklendi: string;
  /** Alt alta notlar; eski `not` alanı ilk notu taşır. */
  notlar?: HobiNotu[];
  /**
   * İsteğe bağlı kategoriler ("RPG", "Souls"). Yoksa alan hiç yazılmaz; eski
   * kayıtlar ve app.py olduğu gibi çalışır.
   */
  kategoriler?: string[];
}

export interface Durum {
  ad: string;
  renk: string;
}

export interface Alan {
  /** Dosya adıyla aynı: `oyunlar.json` → `oyunlar`. */
  alan: string;
  ad: string;
  durumlar: Durum[];
  maddeler: Madde[];
}

/** Durum renkleri. Sekizi de hem açık hem koyu zeminde okunur. */
export const PALET = [
  "#4c63b6",
  "#847f75",
  "#b8862f",
  "#3f7d58",
  "#a3453c",
  "#7a5aa8",
  "#2f7f8c",
  "#b3607f",
];

export interface Sablon {
  id: string;
  ad: string;
  durumlar: string[];
}

export const SABLONLAR: Sablon[] = [
  { id: "oyun", ad: "Oyun", durumlar: ["oynuyorum", "sırada", "alacağım", "bitti", "bıraktım"] },
  { id: "izleme", ad: "Dizi · Film", durumlar: ["izliyorum", "sırada", "bitti", "bıraktım"] },
  { id: "okuma", ad: "Okuma", durumlar: ["okuyorum", "sırada", "alacağım", "bitti", "bıraktım"] },
  { id: "genel", ad: "Genel", durumlar: ["sırada", "başladım", "bitti", "bıraktım"] },
];

export const durumlarKur = (adlar: string[]): Durum[] =>
  adlar.map((ad, i) => ({ ad, renk: PALET[i % PALET.length]! }));

/**
 * Eski biçimi (`durumlar: string[]`) yeni biçime çevirir. Diskte ne olduğuna
 * bakmadan her okumada uygulanır; ilk yazmada yeni biçim kalıcılaşır, eski
 * hâl `.bak` olarak durur.
 */
export function normalize(ham: unknown, slug: string): Alan | null {
  if (!ham || typeof ham !== "object") return null;
  const a = ham as Partial<Alan> & { durumlar?: unknown };

  const ham_durumlar = Array.isArray(a.durumlar) ? a.durumlar : [];
  const durumlar: Durum[] = ham_durumlar.map((d, i) =>
    typeof d === "string"
      ? { ad: d, renk: PALET[i % PALET.length]! }
      : { ad: String((d as Durum)?.ad ?? ""), renk: (d as Durum)?.renk || PALET[i % PALET.length]! },
  );

  return {
    alan: a.alan || slug,
    ad: a.ad || slug,
    durumlar: durumlar.filter((d) => d.ad),
    maddeler: Array.isArray(a.maddeler) ? (a.maddeler as Madde[]) : [],
  };
}

const HARF: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/** Dosya adı üretir. app.py'deki `slugla` ile aynı mantık. */
export function slugla(ad: string): string {
  return ad
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (h) => HARF[h] ?? h)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function yeniId(): string {
  return "m-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

export const dosyaYolu = (slug: string): string => `hobiler/${slug}.json`;

export const durumRengi = (durumlar: Durum[], ad: string): string =>
  durumlar.find((d) => d.ad === ad)?.renk ?? "#847f75";

/* --- kategoriler ------------------------------------------------------------ */

// Saf yardımcılar ortakta: Node testleri renderer'a bağlanmadan sınasın.
export {
  kategoriCikar,
  kategoriEkle,
  kategorileriAyikla,
  kategorileriYaz,
  kategoriyiEsle,
  kategoriyeGoreGrupla,
  tumKategoriler,
  type KategoriGrubu,
} from "@ortak/hobi-kategori";

export {
  notDegistir,
  notEkle,
  notSil,
  notlariOku,
  yeniNotId,
  type HobiNotu,
} from "@ortak/hobi-not";
