/**
 * Ekstre okuma: bankanın verdiği dosyayı bir tabloya çevirir, tarih ve tutar
 * sütunlarını okur. Kaynağı ExpenseTracker'ın `Services/Import/` altındaki
 * `StatementText`, `StatementReader`, `StatementValues` ve `ColumnMap` dosyaları.
 *
 * Bankalar hiçbir konuda anlaşmıyor: ayraç noktalı virgül de olabilir virgül de,
 * dosya UTF-8 da olabilir windows-1254 de, gerçek başlık satırı da genelde hesap
 * bilgisi bloğunun birkaç satır altında. Üçü de ayarlanmıyor, seziliyor — çünkü
 * kullanıcının bunları bilmesi beklenemez.
 */

import { paraCoz } from "./para.ts";
import { AY_TAM } from "./gun.ts";

/** Yanlış dosyayı yükleyen birine karşı sınır. */
export const EN_FAZLA_BAYT = 12 * 1024 * 1024;

export interface EkstreTablosu {
  sutunlar: string[];
  satirlar: string[][];
}

export const BOS_TABLO: EkstreTablosu = { sutunlar: [], satirlar: [] };

export const hucre = (satir: string[], sutun: number): string =>
  sutun < 0 || sutun >= satir.length ? "" : (satir[sutun] ?? "").trim();

/* --- metin normalleştirme ------------------------------------------------ */

const KATLAMA: Record<string, string> = {
  ı: "I", İ: "I", i: "I", I: "I",
  ş: "S", Ş: "S",
  ğ: "G", Ğ: "G",
  ü: "U", Ü: "U",
  ö: "O", Ö: "O",
  ç: "C", Ç: "C",
  â: "A", Â: "A",
  î: "I", Î: "I",
  û: "U", Û: "U",
};

/**
 * Büyük harf, Türkçe harfler ASCII'ye katlanmış, boşluk dizileri tek boşluğa
 * indirilmiş.
 *
 * Katlama elle yapılıyor: `toUpperCase` 'ı'yı 'I' yapmaz, 'İ'yi de 'İ' bırakır —
 * o zaman "MİGROS" ile "MIGROS" iki ayrı işyeri olurdu. Hem kural eşleşmesi hem
 * mükerrer parmak izi normalleştirilmiş biçimi karşılaştırıyor.
 */
export function normalizeMetin(metin?: string | null): string {
  if (!metin || metin.trim() === "") return "";

  let sonuc = "";
  let oncekiBosluk = false;

  for (const ham of metin.trim()) {
    const c = KATLAMA[ham] ?? ham;
    if (/\s/.test(c)) {
      if (!oncekiBosluk) sonuc += " ";
      oncekiBosluk = true;
      continue;
    }
    oncekiBosluk = false;
    sonuc += c.toUpperCase();
  }

  return sonuc.trim();
}

export function metinIcerir(saman?: string | null, igne?: string | null): boolean {
  const i = normalizeMetin(igne);
  return i.length !== 0 && normalizeMetin(saman).includes(i);
}

/* --- kodlama ------------------------------------------------------------- */

/** Bayt gerçekten UTF-8 ise UTF-8, değilse windows-1254. */
export function metinCoz(bayt: Uint8Array): string {
  const govde = bomsuz(bayt);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(govde);
  } catch {
    // Eski banka çıktıları windows-1254; UTF-8 okunsa Türkçe harfler bozulurdu.
    return new TextDecoder("windows-1254").decode(bayt);
  }
}

const bomsuz = (b: Uint8Array): Uint8Array =>
  b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;

/* --- ayraçlı dosya -------------------------------------------------------- */

const ADAY_AYRACLAR = [";", ",", "\t", "|"];

/** Dosya boyunca en tutarlı biçimde en çok sütun veren ayraç. */
export function ayraciSez(satirlar: string[]): string {
  const ornek = satirlar.filter((s) => s.trim().length > 0).slice(0, 30);
  if (ornek.length === 0) return ";";

  let enIyi = ";";
  let enIyiPuan = -1;

  for (const aday of ADAY_AYRACLAR) {
    const sayilar = ornek.map((s) => satirBol(s, aday).length);

    // Tutarlılık ham sütun sayısından önemli: açıklamanın içindeki ya da
    // başlık bloğundaki birkaç virgül gerçek noktalı virgülü yenmesin. En çok
    // satırda tekrarlanan sütun sayısı (eşitlikte büyüğü) esas alınır.
    const siklik = new Map<number, number>();
    for (const n of sayilar) if (n >= 2) siklik.set(n, (siklik.get(n) ?? 0) + 1);
    if (siklik.size === 0) continue;
    const [alan, tutarli] = [...siklik].reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && b[0] > a[0]) ? b : a));
    const puan = tutarli * 1000 + Math.min(alan, 999);

    if (puan > enIyiPuan) {
      enIyiPuan = puan;
      enIyi = aday;
    }
  }

  return enIyi;
}

/** RFC 4180 biçimi: tırnak ayracı korur, `""` gerçek tırnaktır. */
export function satirBol(satir: string, ayrac: string): string[] {
  const alanlar: string[] = [];
  let simdiki = "";
  let tirnakta = false;

  for (let i = 0; i < satir.length; i++) {
    const c = satir[i]!;

    if (tirnakta) {
      if (c === '"') {
        if (satir[i + 1] === '"') {
          simdiki += '"';
          i++;
        } else {
          tirnakta = false;
        }
      } else {
        simdiki += c;
      }
    } else if (c === '"') {
      tirnakta = true;
    } else if (c === ayrac) {
      alanlar.push(simdiki.trim());
      simdiki = "";
    } else {
      simdiki += c;
    }
  }

  alanlar.push(simdiki.trim());
  return alanlar;
}

export function tabloOku(metin: string): EkstreTablosu {
  const satirlar = metin.split("\n").map((s) => s.replace(/\r$/, ""));
  const ayrac = ayraciSez(satirlar);
  return tabloKur(satirlar.filter((s) => s.trim().length > 0).map((s) => satirBol(s, ayrac)));
}

/** Gerçek tablonun başladığını gösteren başlık kelimeleri. */
const BASLIK_IPUCLARI = [
  "TARIH", "DATE", "ACIKLAMA", "DESCRIPTION", "TUTAR", "AMOUNT", "ISLEM",
  "BORC", "ALACAK", "DEBIT", "CREDIT", "BAKIYE", "BALANCE", "REFERANS",
];

/**
 * Başlık satırını seçer ve üstündeki banka antetini atar. Tanıdık bir şey
 * bulunmazsa baştaki en geniş satıra düşer — kullanıcı yine de elle eşleyebilsin.
 */
export function tabloKur(satirlar: string[][]): EkstreTablosu {
  if (satirlar.length === 0) return BOS_TABLO;

  let baslikYeri = -1;
  for (let i = 0; i < Math.min(satirlar.length, 25); i++) {
    const dolu = satirlar[i]!.filter((c) => c.length > 0).length;
    if (dolu < 2) continue;

    const isabet = satirlar[i]!.filter((c) =>
      BASLIK_IPUCLARI.some((h) => normalizeMetin(c).includes(h)),
    ).length;
    if (isabet >= 2) {
      baslikYeri = i;
      break;
    }
  }

  if (baslikYeri < 0) baslikYeri = satirlar.findIndex((r) => r.filter((c) => c.length > 0).length >= 2);
  if (baslikYeri < 0) return BOS_TABLO;

  return {
    sutunlar: satirlar[baslikYeri]!.map((c, i) => (c.length > 0 ? c : `Sütun ${i + 1}`)),
    satirlar: satirlar.slice(baslikYeri + 1).filter((r) => r.some((c) => c.length > 0)),
  };
}

/* --- tarih ve tutar -------------------------------------------------------- */

const GUN_AY_YIL = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
const YIL_AY_GUN = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const KISA_YIL = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/;
const AY_ADIYLA = /^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})$/;

/** Bankaların kullandığı tarih biçimleri. ISO döner, okunamazsa null. */
export function ekstreTarihi(metin?: string | null): string | null {
  if (!metin || metin.trim() === "") return null;

  const deger = metin.trim();
  // "03.08.2026 14:22:10" ve "2026-08-03T00:00:00" ikisi de tarih kısmına iner.
  const kesim = deger.search(/[ Tt]/);
  const bas = kesim > 0 ? deger.slice(0, kesim) : deger;

  // Önce kesilmiş hâl, sonra tamamı: "3 Ağustos 2026" kesilince "3" kalırdı.
  for (const aday of [bas, deger]) {
    const iso = tarihCoz(aday);
    if (iso) return iso;
  }
  return null;
}

function tarihCoz(deger: string): string | null {
  let e = GUN_AY_YIL.exec(deger);
  if (e) return isoKur(Number(e[3]), Number(e[2]), Number(e[1]));

  e = YIL_AY_GUN.exec(deger);
  if (e) return isoKur(Number(e[1]), Number(e[2]), Number(e[3]));

  e = KISA_YIL.exec(deger);
  if (e) return isoKur(2000 + Number(e[3]), Number(e[2]), Number(e[1]));

  e = AY_ADIYLA.exec(deger);
  if (e) {
    const ay = ayNosu(e[2]!);
    if (ay > 0) return isoKur(Number(e[3]), ay, Number(e[1]));
  }

  return null;
}

/** "Ağustos" ve "Ağu" ikisi de sekizinci ay. */
function ayNosu(ad: string): number {
  const aranan = normalizeMetin(ad);
  const yer = AY_TAM.findIndex((a) => {
    const tam = normalizeMetin(a);
    return tam === aranan || (aranan.length >= 3 && tam.startsWith(aranan));
  });
  return yer + 1;
}

function isoKur(yil: number, ay: number, gun: number): string | null {
  if (ay < 1 || ay > 12 || gun < 1) return null;
  if (gun > new Date(Date.UTC(yil, ay, 0)).getUTCDate()) return null;
  return `${String(yil).padStart(4, "0")}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
}

const PARA_ISARETLERI = ["TL", "TRY", "₺", "TRL"];

/**
 * İşaretli kuruş; eksi, paranın hesaptan çıktığı anlamına gelir. Ekstrelerin
 * negatifi yazmak için kullandığı üç yolu da okur: baştaki eksi, sondaki eksi
 * ("1.234,56-") ve muhasebe parantezi ("(1.234,56)").
 */
export function ekstreTutari(metin?: string | null): number | null {
  if (!metin || metin.trim() === "") return null;

  // U+2212 matematik eksisi: uygulamanın kendi tutar metni onu yazıyor.
  let deger = metin.trim().replace(/−/g, "-");
  let eksi = false;

  // Para birimi işaretleri gürültü; parantez ve işaretlere bakmadan önce
  // temizlenir — "(1.234,56) TL" de negatiftir.
  for (const isaret of PARA_ISARETLERI) {
    deger = deger.replace(new RegExp(isaret.replace("₺", "\\u20ba"), "gi"), "");
  }
  deger = deger.trim();

  if (deger.startsWith("(") && deger.endsWith(")")) {
    eksi = true;
    deger = deger.slice(1, -1).trim();
  }

  if (deger.endsWith("-")) {
    eksi = true;
    deger = deger.slice(0, -1).trim();
  } else if (deger.startsWith("-")) {
    eksi = true;
    deger = deger.slice(1).trim();
  } else if (deger.startsWith("+")) {
    deger = deger.slice(1).trim();
  }

  const buyukluk = paraCoz(deger);
  if (buyukluk === null) return null;

  return eksi ? -Math.abs(buyukluk) : Math.abs(buyukluk);
}

/* --- sütun eşlemesi --------------------------------------------------------- */

/**
 * Hangi sütunda ne var. Başlık metninden tahmin edilip kullanıcıya gösteriliyor:
 * her banka bunları başka türlü adlandırıyor ve yanlış bir tahmin hiçbir şey
 * yazılmadan önce görünür olmak zorunda.
 */
export interface SutunEslemi {
  tarih: number;
  aciklama: number;
  /** Tek işaretli sütun. Borç/Alacak ile birlikte kullanılmaz. */
  tutar: number;
  /** Çıkan para. */
  borc: number;
  /** Giren para. */
  alacak: number;
  /**
   * Kredi kartı ekstrelerinde harcamalar artı yazılır — banka hesabının tersi.
   * Kullanıcı önizlemeye bakarak çeviriyor.
   */
  tersCevir: boolean;
}

export const BOS_ESLEM: SutunEslemi = {
  tarih: -1, aciklama: -1, tutar: -1, borc: -1, alacak: -1, tersCevir: false,
};

export const borcAlacakKullanir = (e: SutunEslemi): boolean => e.borc >= 0 || e.alacak >= 0;

export const eslemTam = (e: SutunEslemi): boolean => e.tarih >= 0 && (e.tutar >= 0 || borcAlacakKullanir(e));

const BAKIYE_KELIMELERI = ["BAKIYE", "BALANCE", "KALAN", "LIMIT"];

export function sutunTahmini(sutunlar: string[]): SutunEslemi {
  const n = sutunlar.map(normalizeMetin);
  const eslem: SutunEslemi = { ...BOS_ESLEM };

  eslem.tarih = enIyisiniBul(n, ["ISLEM TARIHI", "TARIH", "DATE"], ["VALOR", "VADE", "SON ODEME"]);
  eslem.aciklama = enIyisiniBul(
    n,
    ["ACIKLAMA", "ISLEM ACIKLAMASI", "DESCRIPTION", "ISYERI", "ODEME YERI", "MERCHANT", "DETAY", "ISLEM"],
    [],
  );

  eslem.borc = enIyisiniBul(n, ["BORC", "DEBIT", "CIKAN", "HARCAMA TUTARI"], BAKIYE_KELIMELERI);
  eslem.alacak = enIyisiniBul(n, ["ALACAK", "CREDIT", "GIREN", "ODEME TUTARI"], BAKIYE_KELIMELERI);

  // Tek işaretli sütun yalnızca banka ikiye ayırmadıysa kullanılır.
  if (!borcAlacakKullanir(eslem)) {
    eslem.tutar = enIyisiniBul(n, ["ISLEM TUTARI", "TUTAR", "AMOUNT", "MIKTAR"], BAKIYE_KELIMELERI);
  }

  return eslem;
}

/**
 * Öndeki anahtar kelime kazanır: ikisi birden varsa "İşlem Tarihi", yalın
 * "Tarih"i yener. Dışlanan kelimeyi taşıyan sütun hiç seçilmez — makul sayılarla
 * dolu bir bakiye sütunu, tutar sanılması en kolay şeydir.
 */
function enIyisiniBul(sutunlar: string[], anahtarlar: string[], dislanan: string[]): number {
  for (const anahtar of anahtarlar) {
    for (let i = 0; i < sutunlar.length; i++) {
      if (dislanan.some((x) => sutunlar[i]!.includes(x))) continue;
      if (sutunlar[i]!.includes(anahtar)) return i;
    }
  }
  return -1;
}
