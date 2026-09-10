/**
 * Bütçe dönemi: normalde takvim ayı, ama ayın 28'ine kadar herhangi bir günde
 * başlayabilir — maaşı 15'inde yatan biri kendi döngüsünü görsün diye.
 *
 * Kaynağı ExpenseTracker'ın `Services/Period.cs` dosyası. Ay sınırı hesabı
 * yalnızca burada yapılır; harcama tarafında elle ay aritmetiği yok.
 */

import { AY_ADLARI, AY_TAM, ayAl, gunAl, gunEkle, gunFarki, yilAl } from "./gun.ts";

export interface Donem {
  /** Dâhil, "YYYY-MM-DD". */
  bas: string;
  /** Dâhil. */
  son: string;
}

/** Ayın 28'inden sonraki günler Şubat'ta yok; başlangıç günü orada kırpılır. */
export function baslangicGunuDuzelt(gun: number): number {
  if (!Number.isFinite(gun)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(gun)));
}

export const ayGunSayisi = (yil: number, ay: number): number => new Date(Date.UTC(yil, ay, 0)).getUTCDate();

/** Ay ekler; gün o ayda yoksa ayın son gününe kırpılır (31 Ocak + 1 ay = 28 Şubat). */
export function ayEkle(iso: string, n: number): string {
  const toplamAy = yilAl(iso) * 12 + (ayAl(iso) - 1) + n;
  const yil = Math.floor(toplamAy / 12);
  const ay = toplamAy - yil * 12 + 1;
  const gun = Math.min(gunAl(iso), ayGunSayisi(yil, ay));
  return `${String(yil).padStart(4, "0")}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
}

const donemKur = (bas: string): Donem => ({ bas, son: gunEkle(ayEkle(bas, 1), -1) });

/** Verilen tarihi içeren dönem. */
export function donemIceren(iso: string, baslangicGunu: number): Donem {
  const gun = baslangicGunuDuzelt(baslangicGunu);
  const bas = `${iso.slice(0, 7)}-${String(gun).padStart(2, "0")}`;
  return donemKur(gunAl(iso) < gun ? ayEkle(bas, -1) : bas);
}

export const donemKaydir = (d: Donem, ay: number): Donem => donemKur(ayEkle(d.bas, ay));

export const sonrakiDonem = (d: Donem): Donem => donemKaydir(d, 1);

export const oncekiDonem = (d: Donem): Donem => donemKaydir(d, -1);

export const donemIcerir = (d: Donem, iso: string): boolean => iso >= d.bas && iso <= d.son;

export const donemGunSayisi = (d: Donem): number => gunFarki(d.son, d.bas) + 1;

/** Geçmiş gün sayısı, döneme kırpılmış. Bütçe hızı bunun üzerinden hesaplanır. */
export function gecenGunler(d: Donem, bugun: string): number {
  if (bugun < d.bas) return 0;
  if (bugun > d.son) return donemGunSayisi(d);
  return gunFarki(bugun, d.bas) + 1;
}

/** Takvim ayıysa "Ağustos 2026", değilse açık aralık. */
export function donemEtiketi(d: Donem): string {
  if (gunAl(d.bas) === 1) return `${AY_TAM[ayAl(d.bas) - 1]} ${yilAl(d.bas)}`;
  return `${gunAl(d.bas)} ${AY_ADLARI[ayAl(d.bas) - 1]} – ${gunAl(d.son)} ${AY_ADLARI[ayAl(d.son) - 1]} ${yilAl(d.son)}`;
}

/** "Ağu 26" — dar sütunlar için. */
export const donemKisaEtiketi = (d: Donem): string =>
  `${AY_ADLARI[ayAl(d.bas) - 1]} ${String(yilAl(d.bas)).slice(2)}`;

/** Dönemin dokunduğu takvim ayları, "YYYY-MM" olarak. Ay dosyalarını seçmek için. */
export function donemAylari(d: Donem): string[] {
  const aylar: string[] = [];
  for (let iso = `${d.bas.slice(0, 7)}-01`; iso.slice(0, 7) <= d.son.slice(0, 7); iso = ayEkle(iso, 1)) {
    aylar.push(iso.slice(0, 7));
  }
  return aylar;
}
