/**
 * Bir kartın henüz başlamamış dönem için ne borçlanacağı.
 * Kaynağı ExpenseTracker'ın `Services/ForecastService.cs` dosyası.
 *
 * Bilerek tek sayı değil aralık: birkaç aylık yükselen bir eğilime dayanan
 * tahmin gerçekten belirsizdir ve iki kestirici faydalı biçimde ayrışır —
 * yakın döneme ağırlık veren ortalama eğilimin gerisinde kalır, en küçük
 * kareler doğrusu yavaşlayan bir eğilimi aşar. Doğru sayı ikisinin arasında
 * durduğu için ikisini de göstermek, birini seçip kuruşuna kadar yazmaktan
 * dürüsttür.
 */

import { donemIcerir, donemKaydir, donemIceren, sonrakiDonem, type Donem } from "./donem.ts";
import { gunEkle, yuvarla } from "./gun.ts";
import { sonrakiTekrar } from "./duzenli.ts";
import type { Duzenli, HesapBakiyesi, Islem } from "./harcama.ts";

/** En fazla okunan tam dönem sayısı. Altı, mevsimsel salınımı görünür tutar. */
const GERIYE_BAKIS = 6;

/**
 * Tek dönemle ölçülecek eğilim yoktur; iki kestirici aynı sayıya çöker ve bu,
 * verinin hak etmediği bir kesinlik gibi görünür.
 */
const EN_AZ_DONEM = 2;

export interface KartTahmini {
  bakiye: HesapBakiyesi;
  donem: Donem;
  mevcutBorc: number;
  duzenli: number;
  degiskenAlt: number;
  degiskenUst: number;
  gecmis: { donem: Donem; gider: number }[];
  alt: number;
  ust: number;
  /** Manşet sayı. Orta nokta bir sunum tercihi, kesinlik iddiası değil. */
  orta: number;
  donemSayisi: number;
}

/**
 * Yeterli geçmişi olan her kredi kartı için bir tahmin. Tek hesap türü kart:
 * banka bakiyesi dönem boyunca biriken bir borç değil, onu öngörmek kimsenin
 * sormadığı soruyu cevaplamak olurdu.
 */
export function kartTahmini(
  bakiyeler: HesapBakiyesi[],
  islemler: Islem[],
  kurallar: Duzenli[],
  bugun: string,
  donemBaslangicGunu: number,
): KartTahmini[] {
  const mevcutDonem = donemIceren(bugun, donemBaslangicGunu);
  const hedef = sonrakiDonem(mevcutDonem);

  const kartlar = bakiyeler.filter((b) => b.hesap.tur === "kredi");
  if (kartlar.length === 0) return [];

  // İçinde bulunulan dönem bilerek dışarıda: yarısı geçmiş bir ay ortalamaya
  // katılınca bütün kestirimleri aşağı çeker.
  const donemler = Array.from({ length: GERIYE_BAKIS }, (_, i) =>
    donemKaydir(mevcutDonem, -(GERIYE_BAKIS - i)),
  );
  const pencere: Donem = { bas: donemler[0]!.bas, son: donemler[donemler.length - 1]!.son };

  const kartIdleri = new Set(kartlar.map((k) => k.hesap.id));

  // Düzenli satırlar buradan çıkarılıp aşağıda kurallardan geri ekleniyor.
  // Geçmiş ortalamada da sayılsalardı bildirilen her abonelik iki kez fatura edilirdi.
  const satirlar = islemler.filter(
    (i) =>
      i.hesapId !== null &&
      kartIdleri.has(i.hesapId) &&
      i.tur === "gider" &&
      !i.transfer &&
      !i.duzenliId &&
      donemIcerir(pencere, i.tarih),
  );

  const kartKurallari = kurallar.filter(
    (k) => !k.durdu && k.hesapId !== null && kartIdleri.has(k.hesapId) && k.tur === "gider",
  );

  const sonuc: KartTahmini[] = [];

  for (const bakiye of kartlar) {
    const kendi = satirlar.filter((i) => i.hesapId === bakiye.hesap.id);

    // Kaydı olmayan bir dönem "harcamasız ay" değildir — kartın deftere
    // girmediği ya da ekstresi hiç yüklenmemiş bir aydır. O sıfırlar ortalamaya
    // katılsa tahmini yarıya indirirdi; sayılmak yerine düşürülüyorlar.
    const gecmis = donemler
      .map((donem) => ({
        donem,
        gider: kendi.filter((i) => donemIcerir(donem, i.tarih)).reduce((a, i) => a + i.kurus, 0),
      }))
      .filter((x) => x.gider > 0);

    if (gecmis.length < EN_AZ_DONEM) continue;

    const seri = gecmis.map((g) => g.gider);
    const agirlikli = agirlikliOrtalama(seri);
    const dogrusal = dogrusalTahmin(seri);

    const duzenli = kartKurallari
      .filter((k) => k.hesapId === bakiye.hesap.id)
      .reduce((a, k) => a + donemdekiTekrarSayisi(k, hedef) * k.kurus, 0);

    const degiskenAlt = yuvarla(Math.min(agirlikli, dogrusal));
    const degiskenUst = yuvarla(Math.max(agirlikli, dogrusal));
    const alt = duzenli + degiskenAlt;
    const ust = duzenli + degiskenUst;

    sonuc.push({
      bakiye,
      donem: hedef,
      mevcutBorc: bakiye.kartBorcu,
      duzenli,
      degiskenAlt,
      degiskenUst,
      gecmis,
      alt,
      ust,
      orta: Math.trunc((alt + ust) / 2),
      donemSayisi: gecmis.length,
    });
  }

  return sonuc;
}

/**
 * Yakınlığa göre 1..n ağırlıklı ortalama. Eğilimi izler ama son gözlemin
 * ötesine geçmez; aralığın ihtiyatlı ucu budur.
 */
export function agirlikliOrtalama(degerler: number[]): number {
  let toplam = 0;
  let agirlik = 0;
  for (let i = 0; i < degerler.length; i++) {
    const a = i + 1;
    toplam += degerler[i]! * a;
    agirlik += a;
  }
  return agirlik === 0 ? 0 : toplam / agirlik;
}

/**
 * Seriden geçen en küçük kareler doğrusunun bir adım sonrası. Eğilimin
 * gerisinde kalmaz, düzleşen bir eğilimi ise aşar — zaten bu yüzden tek başına
 * değil, ağırlıklı ortalamayla birlikte kullanılır. Sıfırın altına inmez:
 * yeterince dik bir düşüş, kullanıcıya para ödeyen bir kart öngörürdü.
 */
export function dogrusalTahmin(degerler: number[]): number {
  const n = degerler.length;
  if (n === 0) return 0;
  if (n === 1) return degerler[0]!;

  const ortX = (n + 1) / 2;
  const ortY = degerler.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = i + 1 - ortX;
    sxy += dx * (degerler[i]! - ortY);
    sxx += dx * dx;
  }

  if (sxx === 0) return ortY;

  const egim = sxy / sxx;
  return Math.max(0, ortY + egim * (n + 1 - ortX));
}

/**
 * Bir kuralın dönem içinde kaç kez çalıştığı. Normalde bir — aylık kural, ay
 * uzunluğunda dönem — ama ay sınırını aşan bir dönem aynı gün numarasını iki
 * kez yakalayabilir; ikincisi atlanırsa eksik faturalanır.
 */
export function donemdekiTekrarSayisi(kural: Duzenli, donem: Donem): number {
  let sayi = 0;
  let tarih = sonrakiTekrar(kural, donem.bas);
  while (tarih !== null && tarih <= donem.son) {
    sayi++;
    tarih = sonrakiTekrar(kural, gunEkle(tarih, 1));
  }
  return sayi;
}
