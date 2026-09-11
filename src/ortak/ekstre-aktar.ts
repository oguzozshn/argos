/**
 * Ekstre satırlarını deftere hazır işlemlere çevirir: parmak izi, mükerrer
 * yakalama, kategori kuralları. Kaynağı ExpenseTracker'ın
 * `Services/Import/StatementImporter.cs`, `ImportLine.cs` ve
 * `CategoryRuleService.SeedDefaultsAsync`.
 *
 * Burada hiçbir şey yazılmıyor — kullanıcı önce sonucu görüyor, önizlemenin
 * bütün anlamı bu.
 */

import { hucre, metinIcerir, normalizeMetin, ekstreTarihi, ekstreTutari, borcAlacakKullanir, eslemTam, type EkstreTablosu, type SutunEslemi } from "./ekstre.ts";
import { TRANSFER_KATEGORISI, type HesapTuru, type Islem, type Kategori, type Tur } from "./harcama.ts";

/* --- kalıcı kayıtlar ------------------------------------------------------- */

/**
 * Ekstre metnini bir kategoriye bağlar. Aynı bankanın ikinci ekstresinde
 * kategoriler yeniden elle seçilmesin diye var.
 */
export interface Kural {
  id: string;
  /** Normalleştirilmiş biçimde saklanır; eşleşme de normalleştirilmiş metinde yapılıyor. */
  icerir: string;
  kategoriId: string;
  /** Eşleşen satırlar harcama değil, transfer olarak yazılır. */
  transfer: boolean;
  kullanim: number;
}

/** Bir içe aktarma koşumu. Partinin tamamı tek tıkla geri alınabilsin diye tutuluyor. */
export interface Parti {
  id: string;
  hesapId: string;
  dosya: string;
  /** ISO tarih-saat. */
  zaman: string;
  aktarilan: number;
  atlanan: number;
  ilk: string | null;
  son: string | null;
}

export interface EkstreDosyasi {
  kurallar: Kural[];
  partiler: Parti[];
}

/* --- önizleme satırı -------------------------------------------------------- */

/** Ham metinden önizlemede verilen kararlara kadar tek bir ekstre satırı. */
export interface Satir {
  sira: number;
  hamTarih: string;
  hamAciklama: string;
  hamTutar: string;

  tarih: string;
  aciklama: string;
  /** Eksi, paranın hesaptan çıktığı anlamına gelir. */
  isaretliKurus: number;

  /** Satır ayrıştırılamadıysa dolu; böyle satırlar hiç yazılmaz. */
  hata: string | null;

  iz: string;
  /** Bu satır daha önceki bir aktarmadan deftere girmiş. */
  zatenVar: boolean;

  kategoriId: string;
  transfer: boolean;
  /** İşareti kaldırılan satır partiye girmez. */
  dahil: boolean;
  /** Kategoriyi öneren kural — kullanımı sayılabilsin diye. */
  kuralId: string | null;
}

export const gecerli = (s: Satir): boolean => s.hata === null;

/** Kategori dışındaki bütün kapıları geçti; kategoriyi kullanıcı hâlâ borçlu olabilir. */
export const yazilabilir = (s: Satir): boolean => gecerli(s) && s.dahil && !s.zatenVar;

/** Gerçekten yazılacak. Kategorisi olmayan satır asla yazılmaz. */
export const hazir = (s: Satir): boolean => yazilabilir(s) && s.kategoriId !== "";

export const satirTuru = (s: Satir): Tur => (s.isaretliKurus >= 0 ? "gelir" : "gider");

export const satirTutari = (s: Satir): number => Math.abs(s.isaretliKurus);

export interface OnizlemeOzeti {
  gecerli: number;
  hatali: number;
  mukerrer: number;
  hazir: number;
  kategorisiz: number;
  disarida: number;
  giderToplam: number;
  gelirToplam: number;
  ilk: string | null;
  son: string | null;
}

export function onizlemeOzeti(satirlar: Satir[]): OnizlemeOzeti {
  const gecerliler = satirlar.filter(gecerli);
  const hazirlar = satirlar.filter(hazir);
  const tarihler = gecerliler.map((s) => s.tarih).sort();

  return {
    gecerli: gecerliler.length,
    hatali: satirlar.length - gecerliler.length,
    mukerrer: gecerliler.filter((s) => s.zatenVar).length,
    hazir: hazirlar.length,
    kategorisiz: satirlar.filter((s) => yazilabilir(s) && s.kategoriId === "").length,
    disarida: gecerliler.filter((s) => !s.zatenVar && !s.dahil).length,
    giderToplam: hazirlar.filter((s) => !s.transfer && s.isaretliKurus < 0).reduce((a, s) => a + satirTutari(s), 0),
    gelirToplam: hazirlar.filter((s) => !s.transfer && s.isaretliKurus > 0).reduce((a, s) => a + satirTutari(s), 0),
    ilk: tarihler[0] ?? null,
    son: tarihler[tarihler.length - 1] ?? null,
  };
}

/* --- parmak izi -------------------------------------------------------------- */

/**
 * SHA-256'nın ilk 128 biti, büyük harfli hex. İndekslenecek kadar kısa, burada
 * tekil olmaya fazlasıyla yeter.
 *
 * Algoritma ExpenseTracker'la birebir aynı tutuluyor: taşınan defterdeki
 * `ekstreIzi` değerleri geçerli kalsın, eski uygulamada aktarılmış bir ekstre
 * burada yeniden aktarılmaya çalışılınca mükerrer yakalansın.
 */
export async function parmakIzi(anahtar: string): Promise<string> {
  const ozet = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(anahtar));
  return [...new Uint8Array(ozet).subarray(0, 16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/* --- önizleme ---------------------------------------------------------------- */

export async function onizlemeKur(
  tablo: EkstreTablosu,
  eslem: SutunEslemi,
  mevcutIzler: Set<string>,
  kurallar: Kural[],
  kategoriler: Kategori[],
): Promise<Satir[]> {
  if (!eslemTam(eslem)) return [];

  // Uzun desen daha özeldir: "GETIR YEMEK", "GETIR"i yenmeli.
  const sirali = [...kurallar].sort((a, b) => b.icerir.length - a.icerir.length);

  // Aynı satır bir ekstrede meşru biçimde tekrarlayabilir — aynı gün, aynı yerde,
  // aynı fiyata iki kahve. Sıra numarası parmak izlerini ayırırken aynı dosya
  // yeniden yüklenince de aynı kalıyor.
  const gorulen = new Map<string, number>();

  const satirlar: Satir[] = [];
  let sira = 0;

  for (const ham of tablo.satirlar) {
    sira++;

    const hamTarih = hucre(ham, eslem.tarih);
    const hamAciklama = eslem.aciklama >= 0 ? hucre(ham, eslem.aciklama) : "";
    const hamTutar = borcAlacakKullanir(eslem)
      ? `${hucre(ham, eslem.borc)} / ${hucre(ham, eslem.alacak)}`
      : hucre(ham, eslem.tutar);

    const satir: Satir = {
      sira,
      hamTarih,
      hamAciklama,
      hamTutar,
      tarih: "",
      aciklama: "",
      isaretliKurus: 0,
      hata: null,
      iz: "",
      zatenVar: false,
      kategoriId: "",
      transfer: false,
      dahil: true,
      kuralId: null,
    };

    const tarih = ekstreTarihi(hamTarih);
    if (tarih === null) {
      satir.hata = hamTarih.length === 0 ? "Tarih boş" : `Tarih okunamadı: ${hamTarih}`;
      satirlar.push(satir);
      continue;
    }

    const isaretli = tutarOku(ham, eslem);
    if (isaretli === null) {
      satir.hata = `Tutar okunamadı: ${hamTutar}`;
      satirlar.push(satir);
      continue;
    }

    if (isaretli === 0) {
      satir.hata = "Tutar sıfır";
      satirlar.push(satir);
      continue;
    }

    satir.tarih = tarih;
    satir.aciklama = hamAciklama.length > 0 ? hamAciklama : "(açıklama yok)";
    satir.isaretliKurus = eslem.tersCevir ? -isaretli : isaretli;

    const temel = `${tarih}|${satir.isaretliKurus}|${normalizeMetin(satir.aciklama)}`;
    const sayac = (gorulen.get(temel) ?? 0) + 1;
    gorulen.set(temel, sayac);

    satir.iz = await parmakIzi(`${temel}|${sayac}`);
    satir.zatenVar = mevcutIzler.has(satir.iz);

    const kural = sirali.find((k) => metinIcerir(satir.aciklama, k.icerir));
    if (kural) {
      satir.transfer = kural.transfer;
      satir.kuralId = kural.id;
      satir.kategoriId = kategoriCoz(kategoriler, kural.kategoriId, satirTuru(satir));
    }

    satirlar.push(satir);
  }

  return satirlar;
}

/**
 * "Diğer" diyen bir kural, gelir çıkan bir satırı kategorileyemez: satır bir
 * gider kategorisine yazılmış gelir olurdu ve ikisini birlikte gruplayan her
 * rapor sessizce bozulurdu. Doğru yönde aynı adlı bir ikiz varsa o kullanılır —
 * transfer kuralı hem çıkan hem giren uçta böyle çalışıyor — yoksa satır
 * kategorisiz bırakılıp kullanıcıya devrediliyor.
 */
export function kategoriCoz(kategoriler: Kategori[], onerilenId: string, tur: Tur): string {
  const onerilen = kategoriler.find((k) => k.id === onerilenId);
  if (!onerilen) return "";
  if (onerilen.tur === tur) return onerilen.id;
  return kategoriler.find((k) => k.tur === tur && k.ad === onerilen.ad)?.id ?? "";
}

function tutarOku(ham: string[], eslem: SutunEslemi): number | null {
  if (!borcAlacakKullanir(eslem)) return ekstreTutari(hucre(ham, eslem.tutar));

  const borc = ekstreTutari(hucre(ham, eslem.borc));
  const alacak = ekstreTutari(hucre(ham, eslem.alacak));

  const borcVar = borc !== null && borc !== 0;
  const alacakVar = alacak !== null && alacak !== 0;
  if (!borcVar && !alacakVar) return null;

  // Ayrı sütunlar zaten işaretsiz: borç çıkar, alacak girer.
  return (alacakVar ? Math.abs(alacak!) : 0) - (borcVar ? Math.abs(borc!) : 0);
}

/**
 * Dosya kredi kartı ekstresine benziyor mu: banka harcamaları artı yazmış.
 * İşaret anahtarına varsayılan olarak önerilir, hiç zorlanmaz.
 */
export function tersGorunuyor(satirlar: Satir[], hesapTuru: HesapTuru): boolean {
  if (hesapTuru !== "kredi") return false;
  const gecerliler = satirlar.filter(gecerli);
  if (gecerliler.length === 0) return false;
  return gecerliler.filter((s) => s.isaretliKurus > 0).length > gecerliler.length / 2;
}

/** Hazır satırları deftere yazılacak işlemlere çevirir. Kimliği yazan taraf koyar. */
export function islemeCevir(satirlar: Satir[], hesapId: string, partiId: string, zaman: string): Omit<Islem, "id">[] {
  return satirlar.filter(hazir).map((s) => ({
    kategoriId: s.kategoriId,
    tur: satirTuru(s),
    kurus: satirTutari(s),
    tarih: s.tarih,
    not: "",
    karsiTaraf: s.aciklama.slice(0, 120),
    odeme: "kart" as const,
    hesapId,
    transfer: s.transfer,
    eklendi: zaman.slice(0, 10),
    ekstreIzi: s.iz,
    partiId,
  }));
}

/* --- tohum kurallar ------------------------------------------------------------ */

interface TohumGrubu {
  kategori: string;
  tur: Tur;
  transfer?: boolean;
  desenler: string[];
}

/**
 * Neredeyse her ekstrede görünen Türk işyerleri. Bir kez tohumlanır ki ilk içe
 * aktarma bile çoğu satırı kategorili getirsin; kullanıcı oradan düzenler.
 */
export const TOHUM_KURALLAR: TohumGrubu[] = [
  { kategori: "Market", tur: "gider", desenler: ["MIGROS", "BIM ", "A101", "SOK MARKET", "CARREFOUR", "MACROCENTER", "GETIR", "BIZIM TOPTAN", "TARIM KREDI"] },
  { kategori: "Ulaşım", tur: "gider", desenler: ["SHELL", "OPET", "PETROL OFISI", "BP ", "TOTAL AKARYAKIT", "ISTANBULKART", "UBER", "BITAKSI", "MARTI", "OTOYOL", "HGS", "OGS"] },
  { kategori: "Yeme-İçme", tur: "gider", desenler: ["YEMEKSEPETI", "GETIR YEMEK", "TRENDYOL YEMEK", "STARBUCKS", "DOMINO", "BURGER KING", "MCDONALD", "KAHVE DUNYASI", "SIMIT SARAYI"] },
  { kategori: "Faturalar", tur: "gider", desenler: ["TURKCELL", "VODAFONE", "TURK TELEKOM", "TURKNET", "SUPERONLINE", "BEDAS", "AYEDAS", "IGDAS", "ISKI", "ASKI", "ENERJISA", "AYDEM"] },
  { kategori: "Abonelikler", tur: "gider", desenler: ["NETFLIX", "SPOTIFY", "YOUTUBEPREMIUM", "AMAZON PRIME", "APPLE.COM", "GOOGLE", "ADOBE", "MICROSOFT", "OPENAI", "EXXEN", "BLUTV", "DISNEY"] },
  { kategori: "Sağlık", tur: "gider", desenler: ["ECZANE", "HASTANE", "MEDICAL PARK", "ACIBADEM", "LABORATUVAR", "DIS POLIKLINIK"] },
  { kategori: "Giyim", tur: "gider", desenler: ["LC WAIKIKI", "DEFACTO", "ZARA", "KOTON", "BOYNER", "MAVI", "H&M", "BERSHKA", "PULL BEAR"] },
  { kategori: "Eğlence", tur: "gider", desenler: ["CINEMAXIMUM", "BILETIX", "PASSO", "STEAMGAMES", "STEAM PURCHASE", "PLAYSTATION", "SPOR SALONU", "MACFIT"] },
  { kategori: "Maaş", tur: "gelir", desenler: ["MAAS ODEMESI", "UCRET ODEMESI", "MAAS"] },
  // Kendi hesapları arasındaki para hareketi. Transfer işaretleniyor ki banka ve
  // kart ekstresini birden yüklemek aynı harcamayı iki kez saymasın — bir kez kart
  // ödemesi, bir kez alışverişler olarak. Ters yöne giden satırda gelir ikizi
  // devreye giriyor.
  {
    kategori: TRANSFER_KATEGORISI,
    tur: "gider",
    transfer: true,
    desenler: ["KREDI KARTI ODEMESI", "KREDI KARTI BORC ODEME", "KART BORCU", "ATM PARA CEKME", "NAKIT CEKIM", "HESAPLAR ARASI", "VIRMAN"],
  },
];

/** Tohum kuralları mevcut kategorilere bağlar. Kategorisi olmayan grup atlanır. */
export function tohumKurallari(kategoriler: Kategori[]): Kural[] {
  const kurallar: Kural[] = [];

  for (const grup of TOHUM_KURALLAR) {
    const kategori = kategoriler.find((k) => k.ad === grup.kategori && k.tur === grup.tur);
    if (!kategori) continue;

    for (const desen of grup.desenler) {
      const icerir = normalizeMetin(desen);
      if (icerir.length < 2 || kurallar.some((k) => k.icerir === icerir)) continue;
      kurallar.push({
        id: `tohum-${kurallar.length + 1}`,
        icerir,
        kategoriId: kategori.id,
        transfer: grup.transfer === true,
        kullanim: 0,
      });
    }
  }

  return kurallar;
}

/**
 * Kuralı ekler ya da aynı deseni taşıyanı günceller. Kullanıcı aynı işyerini
 * başka bir kategoriye bağladığında kastettiği şey budur; hata vermek yerine
 * yeniden yönlendiriliyor. Desen çok kısaysa null döner.
 */
export function kuralYerlestir(kurallar: Kural[], yeni: Omit<Kural, "id" | "kullanim">, id: string): Kural[] | null {
  const icerir = normalizeMetin(yeni.icerir);
  if (icerir.length < 2) return null;

  const yeri = kurallar.findIndex((k) => k.icerir === icerir);
  if (yeri >= 0) {
    return kurallar.map((k, i) =>
      i === yeri ? { ...k, kategoriId: yeni.kategoriId, transfer: yeni.transfer } : k,
    );
  }

  return [...kurallar, { id, icerir, kategoriId: yeni.kategoriId, transfer: yeni.transfer, kullanim: 0 }];
}
