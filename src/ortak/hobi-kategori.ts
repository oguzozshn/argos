/**
 * Hobi kayıtlarının isteğe bağlı kategorileri. Saf; kaydın geri kalanını
 * bilmez, yalnızca `kategoriler` alanına bakar. `araclar/hobi-testi.mts` sınıyor.
 */

export interface Kategorili {
  kategoriler?: string[];
}

/** Karşılaştırma anahtarı: "rpg" ile "RPG" aynı kategori. */
const kAnahtar = (k: string): string => k.trim().toLocaleLowerCase("tr");

/** Kategori ekler; boşsa ya da (büyük/küçük harf farkıyla) zaten varsa listeyi değiştirmez. */
export function kategoriEkle(liste: string[] | undefined, yeni: string): string[] {
  const mevcut = liste ?? [];
  const k = yeni.trim().replace(/\s+/g, " ");
  if (!k || mevcut.some((x) => kAnahtar(x) === kAnahtar(k))) return mevcut;
  return [...mevcut, k];
}

export const kategoriCikar = (liste: string[] | undefined, k: string): string[] =>
  (liste ?? []).filter((x) => kAnahtar(x) !== kAnahtar(k));

/** Kategorisiz kayıtta alan silinir: dosyada boş dizi birikmesin. */
export function kategorileriYaz<T extends Kategorili>(m: T, liste: string[]): T {
  const { kategoriler: _eski, ...geri } = m;
  return (liste.length > 0 ? { ...geri, kategoriler: liste } : geri) as T;
}

/** Alandaki bütün kategoriler, tekil (ilk yazılış), alfabetik. Öneri listesi ve görünüm için. */
export function tumKategoriler(maddeler: Kategorili[]): string[] {
  const gorulen = new Map<string, string>();
  for (const m of maddeler) for (const k of m.kategoriler ?? []) if (!gorulen.has(kAnahtar(k))) gorulen.set(kAnahtar(k), k.trim());
  return [...gorulen.values()].sort((a, b) => a.localeCompare(b, "tr"));
}

/**
 * Eklerken yazılan "#RPG" parçalarını ayıklar: "Elden Ring #RPG #açık_dünya"
 * → ad "Elden Ring", kategoriler ["RPG", "açık dünya"]. Alt çizgi boşluk olur.
 * "#" tek başına ya da sözcük ortasında ("C#") kategori sayılmaz.
 */
export function kategorileriAyikla(metin: string): { ad: string; kategoriler: string[] } {
  let kategoriler: string[] = [];
  const ad = metin
    .replace(/(^|\s)#([^\s#]+)/g, (_t, bas: string, k: string) => {
      kategoriler = kategoriEkle(kategoriler, k.replace(/_/g, " "));
      return bas;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { ad, kategoriler };
}

/**
 * Alanda aynı kategori başka yazımla varsa onun yazımını verir ("açık dünya"
 * → "Açık dünya"). Aynı kategori iki farklı yazımla görünmesin.
 */
export const kategoriyiEsle = (k: string, mevcutlar: string[]): string =>
  mevcutlar.find((x) => kAnahtar(x) === kAnahtar(k)) ?? k.trim().replace(/\s+/g, " ");

export interface KategoriGrubu<T extends Kategorili = Kategorili> {
  /** null: kategorisiz kayıtlar. */
  kategori: string | null;
  maddeler: T[];
}

/**
 * Kategoriye göre gruplar. Birden çok kategorisi olan kayıt her grubunda
 * görünür; kategorisizler en sonda. Grup içinde dosyadaki sıra korunur.
 */
export function kategoriyeGoreGrupla<T extends Kategorili>(maddeler: T[]): KategoriGrubu<T>[] {
  const gruplar: KategoriGrubu<T>[] = tumKategoriler(maddeler).map((k) => ({
    kategori: k,
    maddeler: maddeler.filter((m) => (m.kategoriler ?? []).some((x) => kAnahtar(x) === kAnahtar(k))),
  }));
  const kategorisiz = maddeler.filter((m) => !(m.kategoriler ?? []).some((x) => x.trim()));
  if (kategorisiz.length > 0) gruplar.push({ kategori: null, maddeler: kategorisiz });
  return gruplar;
}
