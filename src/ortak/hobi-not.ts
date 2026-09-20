/**
 * Hobi kaydının notları. Tek metin yerine alt alta liste: her not ayrı satır,
 * tarihiyle durur, tek tek silinir (kullanıcı kararı, 2026-09-20).
 *
 * Eski `not` alanı korunuyor ve ilk notu taşıyor: app.py ve listelerdeki kısa
 * not onu okuyor. Saf; `araclar/hobi-testi.mts` sınıyor.
 */

export interface HobiNotu {
  id: string;
  metin: string;
  /** Notun eklendiği gün (ISO). */
  eklendi: string;
}

export interface Notlu {
  not?: string;
  notlar?: HobiNotu[];
  eklendi?: string;
}

export const yeniNotId = (d = new Date()): string =>
  "n-" + d.getTime().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

/**
 * Kaydın notları. Eski tek metin, listesi olmayan kayıtta ilk not sayılır —
 * dosya değişmeden önce de doğru görünsün.
 */
export function notlariOku(m: Notlu): HobiNotu[] {
  if (Array.isArray(m.notlar)) return m.notlar.filter((n) => n && typeof n.metin === "string");
  const eski = (m.not ?? "").trim();
  return eski ? [{ id: "n-eski", metin: eski, eklendi: m.eklendi ?? "" }] : [];
}

/** Listeyi kayda yazar; `not` ilk notu taşır (eski okuyucular için). */
function yaz<T extends Notlu>(m: T, notlar: HobiNotu[]): T {
  const { notlar: _e, ...geri } = m;
  return {
    ...geri,
    not: notlar[0]?.metin ?? "",
    ...(notlar.length > 0 ? { notlar } : {}),
  } as T;
}

/** Yeni not en üste eklenir: son yazılan en görünür yerde durur. */
export function notEkle<T extends Notlu>(m: T, metin: string, bugun: string, id = yeniNotId()): T {
  const t = metin.trim();
  if (!t) return m;
  return yaz(m, [{ id, metin: t, eklendi: bugun }, ...notlariOku(m)]);
}

export function notSil<T extends Notlu>(m: T, id: string): T {
  return yaz(m, notlariOku(m).filter((n) => n.id !== id));
}

export function notDegistir<T extends Notlu>(m: T, id: string, metin: string): T {
  const t = metin.trim();
  const notlar = notlariOku(m);
  return yaz(m, t ? notlar.map((n) => (n.id === id ? { ...n, metin: t } : n)) : notlar.filter((n) => n.id !== id));
}
