/**
 * Harcama defterinin tipleri ve raporları. Kaynağı ExpenseTracker'ın
 * `Data/Entities.cs`, `Services/TransactionService.cs`, `Services/BudgetService.cs`
 * ve `Services/AccountService.cs` dosyaları.
 *
 * Hepsi saf: dosya okumaz, bugünü ve veriyi dışarıdan alır.
 *
 * İki kural bütün raporların altında yatıyor:
 *
 * - **İşlemin türü satırda taşınır.** `tur` kategoriden yazarken kopyalanır.
 *   Bir kategoriyi sonradan gider'den gelir'e çevirmek geçmiş ayları yeniden
 *   yazamasın diye.
 * - **Transferler toplamlara girmez.** Kart borcu ödemek ya da ATM'den para
 *   çekmek harcama değildir; bakiyeyi etkiler, gelir/gider raporlarına girmez.
 *   Girseydi hem banka hem kart ekstresi yüklenince aynı para iki kez sayılırdı.
 */

import { donemGunSayisi, donemIcerir, donemKaydir, gecenGunler, type Donem } from "./donem.ts";
import { gunEkle } from "./gun.ts";
import { paraGiris } from "./para.ts";

export type Tur = "gider" | "gelir";
export type Odeme = "nakit" | "kart" | "havale" | "diger";
export type HesapTuru = "nakit" | "banka" | "kredi";

/** Hem gider hem gelir tarafında bulunur: transferin iki ucu iki ayrı yöndedir. */
export const TRANSFER_KATEGORISI = "Hesaplar arası";

export interface Kategori {
  id: string;
  ad: string;
  tur: Tur;
  /** Grafiklerin ve kategori rozetinin rengi. */
  renk: string;
  /** Tek emoji. Süs; boş olabilir. */
  simge: string;
  /** Seçiciden gizlenir ama geçmişi olduğu gibi kalır. */
  arsiv: boolean;
  sira: number;
}

export interface Hesap {
  id: string;
  ad: string;
  tur: HesapTuru;
  renk: string;
  simge: string;
  /** İlk kayıttan önceki bakiye. Borcu olan kartta eksi. */
  acilisKurus: number;
  /** IBAN ya da kartın son dört hanesi. Yalnızca iki hesabı ayırmak için. */
  referans: string;
  arsiv: boolean;
  sira: number;
}

export interface Islem {
  id: string;
  kategoriId: string;
  /** Kategoriden kopyalanır; sonradan kategori yön değiştirse geçmiş bozulmasın. */
  tur: Tur;
  /** Her zaman artı; yönü `tur` taşır. */
  kurus: number;
  tarih: string;
  not: string;
  /** İşyeri, kişi ya da işveren. Arama kutusu buna bakar. */
  karsiTaraf: string;
  odeme: Odeme;
  /** Paranın geçtiği hesap. Hesaplar var olmadan girilmiş satırların cevabı yok. */
  hesapId: string | null;
  /** Kendi hesapları arasında para hareketi. Bakiyeye girer, raporlara girmez. */
  transfer: boolean;
  eklendi?: string;
  /** Düzenli bir kuraldan üretildiyse o kuralın kimliği. */
  duzenliId?: string | null;
  /** Ekstre satırının parmak izi — elle girilende yok. İçe aktarma için saklanır. */
  ekstreIzi?: string | null;
  partiId?: string | null;
}

export interface Butce {
  kategoriId: string;
  sinirKurus: number;
}

export interface Duzenli {
  id: string;
  ad: string;
  kategoriId: string;
  tur: Tur;
  kurus: number;
  /** 1-31. Her ay o ayın gerçek uzunluğuna kırpılır. */
  ayinGunu: number;
  karsiTaraf: string;
  odeme: Odeme;
  hesapId: string | null;
  baslangic: string;
  /** Dâhil. Null ise açık uçlu. */
  bitis: string | null;
  durdu: boolean;
  /**
   * Üretilip sonra silinen ya da tarihi kaydırılan tekrarlar. Bunlar olmadan
   * `(kural, tarih)` çifti defterde bulunamaz ve kayıt bir sonraki açılışta
   * yeniden yazılırdı.
   */
  atlananlar?: string[];
  /** A subscription (issue #43): listed under Abonelikler, not Düzenli. Absent on older rules. */
  abonelik?: boolean;
  /** "yillik": once a year, on `ayinGunu` of month `ay`. Absent: every month. */
  periyot?: "aylik" | "yillik";
  /** 1-12, the month of a yearly rule. */
  ay?: number;
}

export interface Ayarlar {
  simge: string;
  donemBaslangicGunu: number;
}

export interface Tanimlar {
  ayarlar: Ayarlar;
  kategoriler: Kategori[];
  hesaplar: Hesap[];
  butceler: Butce[];
  duzenliler: Duzenli[];
}

export const ODEME_ADLARI: Record<Odeme, string> = {
  nakit: "Nakit",
  kart: "Kart",
  havale: "Havale",
  diger: "Diğer",
};

export const HESAP_TURU_ADLARI: Record<HesapTuru, string> = {
  nakit: "Nakit",
  banka: "Banka",
  kredi: "Kredi kartı",
};

export const TUR_ADLARI: Record<Tur, string> = { gider: "Gider", gelir: "Gelir" };

/* --- dönem özeti ------------------------------------------------------- */

export interface KategoriToplam {
  kategoriId: string;
  ad: string;
  renk: string;
  simge: string;
  tur: Tur;
  kurus: number;
  adet: number;
}

export interface GunToplam {
  tarih: string;
  gider: number;
  gelir: number;
}

export interface DonemOzeti {
  donem: Donem;
  gider: number;
  gelir: number;
  net: number;
  adet: number;
  kategoriler: KategoriToplam[];
  gunluk: GunToplam[];
}

export const donemIslemleri = (islemler: Islem[], donem: Donem): Islem[] =>
  islemler.filter((i) => donemIcerir(donem, i.tarih));

/** Silinmiş bir kategoriye bakan satır rapora yine de girer; sayı kaybolmasın. */
const SILINMIS: Pick<Kategori, "ad" | "renk" | "simge"> = {
  ad: "Silinmiş kategori",
  renk: "#8b93a3",
  simge: "",
};

export function donemOzeti(islemler: Islem[], donem: Donem, kategoriler: Kategori[]): DonemOzeti {
  const sayilan = donemIslemleri(islemler, donem).filter((i) => !i.transfer);
  const dizin = new Map(kategoriler.map((k) => [k.id, k]));

  const toplamlar = new Map<string, KategoriToplam>();
  for (const i of sayilan) {
    const anahtar = `${i.kategoriId}|${i.tur}`;
    let t = toplamlar.get(anahtar);
    if (!t) {
      const k = dizin.get(i.kategoriId);
      t = {
        kategoriId: i.kategoriId,
        ad: k?.ad ?? SILINMIS.ad,
        renk: k?.renk ?? SILINMIS.renk,
        simge: k?.simge ?? SILINMIS.simge,
        tur: i.tur,
        kurus: 0,
        adet: 0,
      };
      toplamlar.set(anahtar, t);
    }
    t.kurus += i.kurus;
    t.adet += 1;
  }

  const kategoriToplam = [...toplamlar.values()].sort((a, b) => b.kurus - a.kurus);

  // Gün gün dolduruluyor: harcama olmayan günler eksenden düşmesin, çizgi düz kalsın.
  const gunlukDizin = new Map<string, GunToplam>();
  for (const i of sayilan) {
    let g = gunlukDizin.get(i.tarih);
    if (!g) {
      g = { tarih: i.tarih, gider: 0, gelir: 0 };
      gunlukDizin.set(i.tarih, g);
    }
    if (i.tur === "gider") g.gider += i.kurus;
    else g.gelir += i.kurus;
  }

  const gunluk: GunToplam[] = [];
  for (let t = donem.bas; t <= donem.son; t = gunEkle(t, 1)) {
    gunluk.push(gunlukDizin.get(t) ?? { tarih: t, gider: 0, gelir: 0 });
  }

  const gider = kategoriToplam.filter((t) => t.tur === "gider").reduce((a, t) => a + t.kurus, 0);
  const gelir = kategoriToplam.filter((t) => t.tur === "gelir").reduce((a, t) => a + t.kurus, 0);

  return {
    donem,
    gider,
    gelir,
    net: gelir - gider,
    adet: sayilan.length,
    kategoriler: kategoriToplam,
    gunluk,
  };
}

/** Geçmiş günlere bölünmüş günlük ortalama harcama. */
export function gunlukHiz(ozet: DonemOzeti, bugun: string): number {
  const gun = gecenGunler(ozet.donem, bugun);
  return gun <= 0 ? 0 : Math.trunc(ozet.gider / gun);
}

/** Bu hız dönem sonuna kadar sürerse harcama nereye varır. */
export const donemSonuTahmini = (ozet: DonemOzeti, bugun: string): number =>
  gunlukHiz(ozet, bugun) * donemGunSayisi(ozet.donem);

export interface TrendSatiri {
  donem: Donem;
  gider: number;
  gelir: number;
}

/** `son` dönemiyle biten `adet` dönemin toplamları, eskiden yeniye. */
export function trend(islemler: Islem[], son: Donem, adet: number): TrendSatiri[] {
  const ilk = donemKaydir(son, -(adet - 1));
  const sayilan = islemler.filter((i) => !i.transfer);
  const satirlar: TrendSatiri[] = [];
  for (let i = 0; i < adet; i++) {
    const donem = donemKaydir(ilk, i);
    const icinde = sayilan.filter((x) => donemIcerir(donem, x.tarih));
    satirlar.push({
      donem,
      gider: icinde.filter((x) => x.tur === "gider").reduce((a, x) => a + x.kurus, 0),
      gelir: icinde.filter((x) => x.tur === "gelir").reduce((a, x) => a + x.kurus, 0),
    });
  }
  return satirlar;
}

/** Dönem içinde kategori başına gider. Bütçe sayfası bunu kullanır. */
export function kategoriHarcamasi(islemler: Islem[], donem: Donem): Map<string, number> {
  const toplam = new Map<string, number>();
  for (const i of islemler) {
    if (i.transfer || i.tur !== "gider" || !donemIcerir(donem, i.tarih)) continue;
    toplam.set(i.kategoriId, (toplam.get(i.kategoriId) ?? 0) + i.kurus);
  }
  return toplam;
}

/* --- hesap bakiyeleri --------------------------------------------------- */

export interface HesapBakiyesi {
  hesap: Hesap;
  bakiye: number;
  adet: number;
  sonHareket: string | null;
  /** Kredi kartı borcu yokken sıfırdadır; borç eksi tarafta durur. */
  kartBorcu: number;
}

/**
 * Açılış bakiyesi artı hesaba yazılan her şey. Transferler burada **sayılır**:
 * para gerçekten yer değiştirir, sadece harcama değildir.
 */
export function hesapBakiyeleri(hesaplar: Hesap[], islemler: Islem[]): HesapBakiyesi[] {
  return hesaplar.map((hesap) => {
    const kendi = islemler.filter((i) => i.hesapId === hesap.id);
    const giren = kendi.filter((i) => i.tur === "gelir").reduce((a, i) => a + i.kurus, 0);
    const cikan = kendi.filter((i) => i.tur === "gider").reduce((a, i) => a + i.kurus, 0);
    const bakiye = hesap.acilisKurus + giren - cikan;
    const sonHareket = kendi.reduce<string | null>((a, i) => (a === null || i.tarih > a ? i.tarih : a), null);
    return {
      hesap,
      bakiye,
      adet: kendi.length,
      sonHareket,
      kartBorcu: hesap.tur === "kredi" && bakiye < 0 ? -bakiye : 0,
    };
  });
}

/* --- bütçeler ----------------------------------------------------------- */

export interface ButceDurumu {
  kategori: Kategori;
  sinir: number;
  harcanan: number;
  kalan: number;
  /** 0-1 arası, çubuğun genişliği. */
  doluluk: number;
  /** Ham oran; etiket 1'in üstünü de göstermeli. */
  oran: number;
  asti: boolean;
  /** %85 geçildi ama sınır henüz kırılmadı. */
  yaklasti: boolean;
  /** Bu hızla dönem sonunda nerede biter. Çıplak çubuğun söyleyemediği şey. */
  tahmin: number;
}

export function butceDurumu(
  butceler: Butce[],
  kategoriler: Kategori[],
  islemler: Islem[],
  donem: Donem,
  bugun: string,
): ButceDurumu[] {
  const harcama = kategoriHarcamasi(islemler, donem);
  const dizin = new Map(kategoriler.map((k) => [k.id, k]));
  const gecen = gecenGunler(donem, bugun);
  const gunSayisi = donemGunSayisi(donem);

  return butceler
    .flatMap((b) => {
      const kategori = dizin.get(b.kategoriId);
      if (!kategori) return [];
      const harcanan = harcama.get(b.kategoriId) ?? 0;
      const oran = b.sinirKurus <= 0 ? 0 : harcanan / b.sinirKurus;
      const asti = b.sinirKurus > 0 && harcanan > b.sinirKurus;
      return [
        {
          kategori,
          sinir: b.sinirKurus,
          harcanan,
          kalan: b.sinirKurus - harcanan,
          doluluk: Math.min(1, Math.max(0, oran)),
          oran,
          asti,
          yaklasti: !asti && oran >= 0.85,
          tahmin: gecen <= 0 ? 0 : Math.trunc(harcanan / gecen) * gunSayisi,
        },
      ];
    })
    .sort((a, b) => b.oran - a.oran);
}

/** Bir kategorinin olağan aylık harcaması ve karşısındaki sınır. */
export interface KategoriHarcamasi {
  kategori: Kategori;
  aylikOrtalama: number;
  sinir: number | null;
  butceli: boolean;
  /** Hiç harcama olmayan bir kategoriye konmuş sınır: toplamı şişirir, bir şey izlemez. */
  atil: boolean;
}

/**
 * Harcamanın ne kadarı gerçekten bir bütçenin altında. Bu olmadan sayfa
 * bütün çubuklar yeşilken paranın çoğunun sınırsız kategorilerden çıktığını
 * gizler — ki bütçenin var olma sebebi tam olarak budur.
 */
export interface ButceKapsami {
  kategoriler: KategoriHarcamasi[];
  /** Ortalamanın alındığı, defterin gerçekten işlediği dönem sayısı. */
  donemSayisi: number;
  butceliOrtalama: number;
  toplamOrtalama: number;
  kapsamaDisi: number;
  /** 0-1. Olağan aylık harcamanın bütçe altındaki payı. */
  oran: number;
}

/** Sınır önerirken ortalaması alınan tam dönem sayısı. */
export const GERIYE_BAKIS = 6;

export function butceKapsami(
  kategoriler: Kategori[],
  butceler: Butce[],
  islemler: Islem[],
  mevcut: Donem,
): ButceKapsami {
  // İçinde bulunulan dönem yarım: ortalamaya katılsa her kategoriyi olduğundan
  // düşük gösterir ve bir ayı çıkaramayacak kadar dar sınırlar önerir.
  const donemler = Array.from({ length: GERIYE_BAKIS }, (_, i) => donemKaydir(mevcut, -(GERIYE_BAKIS - i)));
  const pencere: Donem = { bas: donemler[0]!.bas, son: donemler[donemler.length - 1]!.son };

  const satirlar = islemler.filter(
    (i) => i.tur === "gider" && !i.transfer && donemIcerir(pencere, i.tarih),
  );

  const sinirlar = new Map(butceler.map((b) => [b.kategoriId, b.sinirKurus]));
  const toplamlar = new Map<string, number>();
  for (const i of satirlar) toplamlar.set(i.kategoriId, (toplamlar.get(i.kategoriId) ?? 0) + i.kurus);

  // Kategorinin göründüğü döneme değil, defterin işlediği döneme bölünür:
  // bütçe aylık bir izindir, beş ayda bir kez alınan şey bunun beşte biri eder.
  const etkin = donemler.filter((d) => satirlar.some((i) => donemIcerir(d, i.tarih))).length;

  return kapsamOzeti(
    kategoriler
      .filter((k) => k.tur === "gider" && !k.arsiv)
      .map((kategori) =>
        kategoriHarcamaSatiri(
          kategori,
          etkin === 0 ? 0 : Math.trunc((toplamlar.get(kategori.id) ?? 0) / etkin),
          sinirlar.get(kategori.id) ?? null,
        ),
      ),
    etkin,
  );
}

/** Bir satırın türetilen alanlarını tek yerde kurar. */
export function kategoriHarcamaSatiri(
  kategori: Kategori,
  aylikOrtalama: number,
  sinir: number | null,
): KategoriHarcamasi {
  const butceli = sinir !== null && sinir > 0;
  return { kategori, aylikOrtalama, sinir, butceli, atil: butceli && aylikOrtalama === 0 };
}

/** Toplamlar satırlardan türer; ayrı durması testlerin satırları elle kurabilmesi için. */
export function kapsamOzeti(kategoriler: KategoriHarcamasi[], donemSayisi: number): ButceKapsami {
  const butceliOrtalama = kategoriler.filter((h) => h.butceli).reduce((a, h) => a + h.aylikOrtalama, 0);
  const toplamOrtalama = kategoriler.reduce((a, h) => a + h.aylikOrtalama, 0);
  return {
    kategoriler,
    donemSayisi,
    butceliOrtalama,
    toplamOrtalama,
    kapsamaDisi: toplamOrtalama - butceliOrtalama,
    oran: toplamOrtalama <= 0 ? 0 : butceliOrtalama / toplamOrtalama,
  };
}

/** Sınırı olmayan ama gerçekten para götüren kategoriler, pahalıdan ucuza. */
export const kapsamaDisiOlanlar = (k: ButceKapsami): KategoriHarcamasi[] =>
  k.kategoriler.filter((h) => !h.butceli && h.aylikOrtalama > 0).sort((a, b) => b.aylikOrtalama - a.aylikOrtalama);

export const atilButceler = (k: ButceKapsami): KategoriHarcamasi[] => k.kategoriler.filter((h) => h.atil);

/* --- defter özeti · dışa aktarma --------------------------------------- */

export interface DefterOzeti {
  islem: number;
  kategori: number;
  kural: number;
  ilk: string | null;
  son: string | null;
}

export function defterOzeti(islemler: Islem[], tanimlar: Tanimlar): DefterOzeti {
  const tarihler = islemler.map((i) => i.tarih).sort();
  return {
    islem: islemler.length,
    kategori: tanimlar.kategoriler.length,
    kural: tanimlar.duzenliler.length,
    ilk: tarihler[0] ?? null,
    son: tarihler[tarihler.length - 1] ?? null,
  };
}

const csvAlan = (deger: string): string =>
  /[;"\n]/.test(deger) ? `"${deger.replace(/"/g, '""')}"` : deger;

/**
 * Noktalı virgülle ayrılmış: Türkçe yerel ayarlı Excel bu dosyayı içe aktarma
 * sihirbazı olmadan açar. BOM'u indiren taraf ekler.
 */
export function csvUret(islemler: Islem[], kategoriler: Kategori[], hesaplar: Hesap[]): string {
  const kDizin = new Map(kategoriler.map((k) => [k.id, k.ad]));
  const hDizin = new Map(hesaplar.map((h) => [h.id, h.ad]));

  const satirlar = [...islemler].sort((a, b) => (a.tarih === b.tarih ? kIsimSirasi(a, b) : a.tarih < b.tarih ? -1 : 1));

  const govde = satirlar.map((i) =>
    [
      i.tarih,
      i.transfer ? "Transfer" : TUR_ADLARI[i.tur],
      csvAlan(i.hesapId ? (hDizin.get(i.hesapId) ?? "") : ""),
      csvAlan(kDizin.get(i.kategoriId) ?? ""),
      paraGiris(i.kurus),
      ODEME_ADLARI[i.odeme],
      csvAlan(i.karsiTaraf),
      csvAlan(i.not),
    ].join(";"),
  );

  return ["Tarih;Tür;Hesap;Kategori;Tutar;Ödeme;Karşı Taraf;Not", ...govde, ""].join("\n");
}

const kIsimSirasi = (a: Islem, b: Islem): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
