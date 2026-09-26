/**
 * Takvim ekseninde bir göreve saat verme mantığı. Saf: React'e, Electron'a ve
 * Todoist istemcisine bağlı değil, düz Node ile test edilebiliyor
 * (araclar/takvim-testi.mts).
 *
 * Buraya toplanmasının sebebi, aynı aritmetiğin üç yere dağılmış olması:
 * slot taşıma, çift tıkla slot ekleme ve artık göreve saat verme. Piksel →
 * dakika çevrimi bir kez burada duruyor.
 */

/** Eksenin saat penceresi ve bir saatin piksel yüksekliği. */
export interface EksenOlcusu {
  ilkSaat: number;
  sonSaat: number;
  saatYuksekligi: number;
  adimDk: number;
}

export const sinirla = (x: number, alt: number, ust: number): number =>
  Math.min(ust, Math.max(alt, x));

/** Gün içi dakika → "SS:DD". */
export const dakikaMetni = (dk: number): string =>
  `${String(Math.floor(dk / 60)).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;

/** "SS:DD" → gün içi dakika. Biçim bozuksa NaN yerine null. */
export function metinDakikasi(saat: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(saat.trim());
  if (!m) return null;
  const dk = Number(m[1]) * 60 + Number(m[2]);
  return dk >= 0 && dk <= 24 * 60 ? dk : null;
}

/**
 * Eksenin üstünden ölçülen piksel uzaklığını, adıma oturtulmuş ve pencereye
 * sıkıştırılmış gün içi dakikaya çevirir.
 *
 * Üst sınır `sonSaat` değil bir adım öncesi: eksenin en altına bırakılan bir
 * iş 24:00'a düşerse ertesi güne taşmış olur.
 */
export function saateOtur(yOfset: number, o: EksenOlcusu): number {
  const ham = (yOfset / o.saatYuksekligi) * 60 + o.ilkSaat * 60;
  const oturmus = Math.round(ham / o.adimDk) * o.adimDk;
  return sinirla(oturmus, o.ilkSaat * 60, o.sonSaat * 60 - o.adimDk);
}

/**
 * Todoist görevinin saati; saatsizse (gün boyu) null.
 *
 * Todoist tarihi ya "2026-09-26" ya da "2026-09-26T14:30:00" biçiminde gelir;
 * uzunluk ikisini ayırmaya yetiyor.
 */
export const gorevSaati = (tarih: string | null | undefined): string | null =>
  tarih && tarih.length > 10 ? tarih.slice(11, 16) : null;

/**
 * Todoist'e yazılacak tarih metni (`due_string`). Doğal dil değil düz tarih:
 * sürükleme kullanıcının yazdığı bir şey değil, bizim ürettiğimiz kesin değer.
 */
export const todoistTarihi = (iso: string, saat: string | null): string =>
  saat ? `${iso} ${saat}` : iso;

/** İyimser güncellemede listeye konacak tarih — Todoist'in döneceği biçimde. */
export const iyimserTarih = (iso: string, saat: string | null): string =>
  saat ? `${iso}T${saat}:00` : iso;

/**
 * Bırakma anahtarı: hangi güne, hangi saate. Sürükle-bırak altyapısı hedefi
 * tek bir dizgeyle tanıyor (bkz. src/renderer/src/ui/surukle.ts), o yüzden
 * saat de anahtarın içinde taşınıyor.
 *
 *   "2026-09-26"            → yalnız gün; görevin saati korunur
 *   "2026-09-26T14:30"      → gün ve saat
 *   "2026-09-26#gunboyu"    → gün, saat silinir
 */
export type BirakmaSaati = { tur: "koru" } | { tur: "ver"; saat: string } | { tur: "sil" };

export interface Birakma {
  iso: string;
  saat: BirakmaSaati;
}

export const gunAnahtari = (iso: string): string => iso;
export const saatAnahtari = (iso: string, saat: string): string => `${iso}T${saat}`;
export const gunBoyuAnahtari = (iso: string): string => `${iso}#gunboyu`;

/** Anahtarı çözer; tanınmayan anahtar için null (çağıran sessizce yok sayar). */
export function birakmayiCoz(anahtar: string): Birakma | null {
  const iso = anahtar.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const kalan = anahtar.slice(10);
  if (kalan === "") return { iso, saat: { tur: "koru" } };
  if (kalan === "#gunboyu") return { iso, saat: { tur: "sil" } };
  if (kalan.startsWith("T") && metinDakikasi(kalan.slice(1)) !== null) {
    return { iso, saat: { tur: "ver", saat: kalan.slice(1) } };
  }
  return null;
}

/**
 * Bir görevin hedef saati ne olacak. `koru` için görevin kendi saati kalır.
 */
export function hedefSaat(mevcutTarih: string | null | undefined, istek: BirakmaSaati): string | null {
  if (istek.tur === "ver") return istek.saat;
  if (istek.tur === "sil") return null;
  return gorevSaati(mevcutTarih);
}

/**
 * Taşımanın bir şeyi değiştirip değiştirmediği. Gün de saat de aynıysa istek
 * atmaya gerek yok.
 *
 * Eskiden yalnız gün karşılaştırılıyordu; o yüzden aynı gün içinde saat
 * değiştirmek hiç çalışmıyordu.
 */
export function tasimaGereksiz(
  mevcutTarih: string | null | undefined,
  iso: string,
  istek: BirakmaSaati,
): boolean {
  return (
    (mevcutTarih ?? "").slice(0, 10) === iso &&
    gorevSaati(mevcutTarih) === hedefSaat(mevcutTarih, istek)
  );
}
