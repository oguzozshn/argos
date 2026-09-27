// Uzantı açıkça yazılı: bu dosya düz Node ile de koşuyor (araclar/geri-sayim-testi.mts).
import { AY_TAM, GUN_ADLARI, gunFarki, haftaninGunu } from "./gun.ts";

/**
 * Önemli görevlerin (sınav, başvuru) geri sayımı. Saf; Bugün kartı ve test
 * aynı kuralı okur.
 *
 * Kural kullanıcının: iki haftadan uzaksa "2 hafta 6 gün", iki hafta ve
 * altında yalnız gün ("14 gün"). Yakınken hafta bölmek kalan süreyi
 * olduğundan uzak gösteriyor.
 */

/** Todoist tarihinden (saatli olabilir) bugüne kalan takvim günü. Geçmişse eksi. */
export const kalanGun = (tarih: string, bugunIso: string): number =>
  gunFarki(tarih.slice(0, 10), bugunIso);

export function kalanMetni(gun: number): string {
  if (gun < 0) return `${-gun} gün geçti`;
  if (gun === 0) return "Bugün";
  if (gun === 1) return "Yarın";
  if (gun <= 14) return `${gun} gün`;
  const hafta = Math.floor(gun / 7);
  const artan = gun % 7;
  return artan === 0 ? `${hafta} hafta` : `${hafta} hafta ${artan} gün`;
}

export type Aciliyet = "sakin" | "yakin" | "acil";

/** Renk yalnız bunu okur: bir hafta içi turuncu, üç gün ve geçmiş kırmızı. */
export function aciliyet(gun: number): Aciliyet {
  if (gun <= 3) return "acil";
  if (gun <= 7) return "yakin";
  return "sakin";
}

/** "17 Ekim Cumartesi" — yıl yalnız bu yıldan değilse eklenir. */
export function tarihEtiketi(tarih: string, bugunIso: string): string {
  const iso = tarih.slice(0, 10);
  const [y, a, g] = iso.split("-").map(Number);
  const yil = iso.slice(0, 4) === bugunIso.slice(0, 4) ? "" : ` ${y}`;
  const saat = tarih.length > 10 ? ` · ${tarih.slice(11, 16)}` : "";
  return `${g} ${AY_TAM[a! - 1]}${yil} ${GUN_ADLARI[haftaninGunu(iso)]}${saat}`;
}

/** En yakın tarih önce; tarihsizler sonda, kendi aralarında ada göre. */
export function tariheGoreSirala<T extends { tarih: string | null; icerik: string }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => {
    if (a.tarih && b.tarih) return a.tarih.slice(0, 10).localeCompare(b.tarih.slice(0, 10));
    if (a.tarih) return -1;
    if (b.tarih) return 1;
    return a.icerik.localeCompare(b.icerik, "tr");
  });
}
