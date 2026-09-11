import { AY_ADLARI } from "@ortak/gun";
import type { EkstreDosyasi, Kural, Parti } from "@ortak/ekstre-aktar";
import type { Ayarlar, Duzenli, Hesap, Islem, Kategori, Tanimlar } from "@ortak/harcama";

/**
 * Dosya düzeni ve okuma sağlamlaştırması. Alan tipleri `@ortak/harcama`'da;
 * burada yalnızca diskle ilgili olan var.
 *
 *   harcama/tanimlar.json    ayarlar · kategoriler · hesaplar · bütçeler · düzenli kurallar
 *   harcama/2026-09.json     o takvim ayının işlemleri
 *
 * İşlemler neden aylık: defter yıllarla büyür, tek dosya her düzenlemede
 * baştan yazılırdı. Aylık bölününce yazma küçük kalıyor, çakışma penceresi
 * daralıyor. Bölme işlemin takvim ayına göre — dönem başlangıcı 1 değilse bile
 * dosya adı sabit kalsın diye; dönem raporu gereken ayları birleştiriyor.
 */

export const TANIM_YOLU = "harcama/tanimlar.json";

/**
 * Kategori kuralları ve içe aktarma partileri ayrı dosyada: tohum kurallar
 * altmışa yakın ve yalnızca ekstre ekranı okuyor, her ekranın açtığı
 * `tanimlar.json`'ı şişirmelerinin sebebi yok.
 */
export const EKSTRE_YOLU = "harcama/ekstre.json";

/** Klasörde tanımlar dosyası da var; ay dosyaları bu desenle ayrılıyor. */
export const AY_DESENI = /^\d{4}-\d{2}\.json$/;

export const dosyaYolu = (ay: string): string => `harcama/${ay}.json`;

export const ayinAdi = (tarih: string): string => tarih.slice(0, 7);

export function yeniId(): string {
  return "h-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

export interface AyDosyasi {
  ay: string;
  islemler: Islem[];
}

/* --- varsayılanlar ------------------------------------------------------ */

export const VARSAYILAN_AYARLAR: Ayarlar = { simge: "₺", donemBaslangicGunu: 1 };

/**
 * İlk açılış içeriği. Olmasa uygulama, her işlemin bir kategori istediği
 * hâlde gönderilemeyen boş bir formla açılırdı.
 *
 * "Hesaplar arası" iki yönde birden var: transferin bir ucu çıkış, diğeri giriş.
 */
export const VARSAYILAN_KATEGORILER: Kategori[] = [
  { id: "market", ad: "Market", tur: "gider", renk: "#5b8def", simge: "🛒", arsiv: false, sira: 1 },
  { id: "kira", ad: "Kira", tur: "gider", renk: "#a371f7", simge: "🏠", arsiv: false, sira: 2 },
  { id: "faturalar", ad: "Faturalar", tur: "gider", renk: "#d29922", simge: "💡", arsiv: false, sira: 3 },
  { id: "ulasim", ad: "Ulaşım", tur: "gider", renk: "#3fb950", simge: "🚌", arsiv: false, sira: 4 },
  { id: "yeme-icme", ad: "Yeme-İçme", tur: "gider", renk: "#f85149", simge: "🍽️", arsiv: false, sira: 5 },
  { id: "saglik", ad: "Sağlık", tur: "gider", renk: "#2dd4bf", simge: "💊", arsiv: false, sira: 6 },
  { id: "giyim", ad: "Giyim", tur: "gider", renk: "#ec4899", simge: "👕", arsiv: false, sira: 7 },
  { id: "eglence", ad: "Eğlence", tur: "gider", renk: "#f97316", simge: "🎬", arsiv: false, sira: 8 },
  { id: "abonelikler", ad: "Abonelikler", tur: "gider", renk: "#8b5cf6", simge: "🔁", arsiv: false, sira: 9 },
  { id: "diger", ad: "Diğer", tur: "gider", renk: "#8b93a3", simge: "📦", arsiv: false, sira: 10 },
  { id: "transfer-gider", ad: "Hesaplar arası", tur: "gider", renk: "#8b93a3", simge: "🔄", arsiv: false, sira: 11 },
  { id: "maas", ad: "Maaş", tur: "gelir", renk: "#3fb950", simge: "💰", arsiv: false, sira: 1 },
  { id: "ek-gelir", ad: "Ek Gelir", tur: "gelir", renk: "#2dd4bf", simge: "➕", arsiv: false, sira: 2 },
  { id: "transfer-gelir", ad: "Hesaplar arası", tur: "gelir", renk: "#8b93a3", simge: "🔄", arsiv: false, sira: 3 },
];

/** Tek nakit hesap: form açıldığında seçili bir şey olsun, hesap zorunlu karar olmasın. */
export const VARSAYILAN_HESAPLAR: Hesap[] = [
  { id: "nakit", ad: "Nakit", tur: "nakit", renk: "#3fb950", simge: "💵", acilisKurus: 0, referans: "", arsiv: false, sira: 1 },
];

export const VARSAYILAN_TANIMLAR: Tanimlar = {
  ayarlar: VARSAYILAN_AYARLAR,
  kategoriler: VARSAYILAN_KATEGORILER,
  hesaplar: VARSAYILAN_HESAPLAR,
  butceler: [],
  duzenliler: [],
};

/* --- okuma sağlamlaştırması --------------------------------------------- */

const dizi = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const metin = (x: unknown, varsayilan = ""): string => (typeof x === "string" ? x : varsayilan);
const sayi = (x: unknown, varsayilan = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : varsayilan);
const evet = (x: unknown): boolean => x === true;

const tur = (x: unknown) => (x === "gelir" ? "gelir" : "gider");
const odeme = (x: unknown) => (x === "nakit" || x === "kart" || x === "havale" ? x : "diger");
const hesapTuru = (x: unknown) => (x === "banka" || x === "kredi" ? x : "nakit");

/**
 * Diskteki hâli tipe oturtur. Eksik alan hata değil: dosyayı elle düzenleyen
 * ya da eski bir aktarım bir alanı atlamış olabilir; okuyan taraf tamamlar.
 */
export function normalizeTanimlar(ham: unknown): Tanimlar {
  if (!ham || typeof ham !== "object") return VARSAYILAN_TANIMLAR;
  const t = ham as Record<string, unknown>;
  const a = (t.ayarlar ?? {}) as Record<string, unknown>;

  const kategoriler = dizi(t.kategoriler).map((x, i): Kategori => {
    const k = x as Record<string, unknown>;
    return {
      id: metin(k.id) || `k${i}`,
      ad: metin(k.ad),
      tur: tur(k.tur),
      renk: metin(k.renk, "#5b8def"),
      simge: metin(k.simge),
      arsiv: evet(k.arsiv),
      sira: sayi(k.sira, i + 1),
    };
  });

  const hesaplar = dizi(t.hesaplar).map((x, i): Hesap => {
    const h = x as Record<string, unknown>;
    return {
      id: metin(h.id) || `h${i}`,
      ad: metin(h.ad),
      tur: hesapTuru(h.tur),
      renk: metin(h.renk, "#5b8def"),
      simge: metin(h.simge),
      acilisKurus: Math.trunc(sayi(h.acilisKurus)),
      referans: metin(h.referans),
      arsiv: evet(h.arsiv),
      sira: sayi(h.sira, i + 1),
    };
  });

  const duzenliler = dizi(t.duzenliler).map((x, i): Duzenli => {
    const d = x as Record<string, unknown>;
    return {
      id: metin(d.id) || `d${i}`,
      ad: metin(d.ad),
      kategoriId: metin(d.kategoriId),
      tur: tur(d.tur),
      kurus: Math.abs(Math.trunc(sayi(d.kurus))),
      ayinGunu: Math.min(31, Math.max(1, Math.trunc(sayi(d.ayinGunu, 1)))),
      karsiTaraf: metin(d.karsiTaraf),
      odeme: odeme(d.odeme),
      hesapId: typeof d.hesapId === "string" ? d.hesapId : null,
      baslangic: metin(d.baslangic),
      bitis: typeof d.bitis === "string" ? d.bitis : null,
      durdu: evet(d.durdu),
    };
  });

  return {
    ayarlar: {
      simge: metin(a.simge, "₺") || "₺",
      donemBaslangicGunu: Math.min(28, Math.max(1, Math.trunc(sayi(a.donemBaslangicGunu, 1)))),
    },
    kategoriler: kategoriler.filter((k) => k.ad),
    hesaplar: hesaplar.filter((h) => h.ad),
    butceler: dizi(t.butceler)
      .map((x) => {
        const b = x as Record<string, unknown>;
        return { kategoriId: metin(b.kategoriId), sinirKurus: Math.trunc(sayi(b.sinirKurus)) };
      })
      .filter((b) => b.kategoriId),
    duzenliler: duzenliler.filter((d) => d.ad && d.baslangic),
  };
}

export function normalizeAy(ham: unknown, ay: string): Islem[] {
  if (!ham || typeof ham !== "object") return [];
  const d = ham as Record<string, unknown>;
  return dizi(d.islemler)
    .map((x, i): Islem => {
      const o = x as Record<string, unknown>;
      return {
        id: metin(o.id) || `${ay}-${i}`,
        kategoriId: metin(o.kategoriId),
        tur: tur(o.tur),
        kurus: Math.abs(Math.trunc(sayi(o.kurus))),
        tarih: metin(o.tarih),
        not: metin(o.not),
        karsiTaraf: metin(o.karsiTaraf),
        odeme: odeme(o.odeme),
        hesapId: typeof o.hesapId === "string" ? o.hesapId : null,
        transfer: evet(o.transfer),
        ...(typeof o.eklendi === "string" ? { eklendi: o.eklendi } : {}),
        ...(typeof o.duzenliId === "string" ? { duzenliId: o.duzenliId } : {}),
        ...(typeof o.ekstreIzi === "string" ? { ekstreIzi: o.ekstreIzi } : {}),
        ...(typeof o.partiId === "string" ? { partiId: o.partiId } : {}),
      };
    })
    .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.tarih));
}

/* --- küçük yardımcılar --------------------------------------------------- */

export const kategoriAdi = (k: Kategori): string => (k.simge ? `${k.simge} ${k.ad}` : k.ad);

/** Kategori ve hesap listelerinin her yerdeki sırası: türe, sıraya, ada göre. */
export const kategoriSirasi = (a: Kategori, b: Kategori): number =>
  a.tur !== b.tur ? (a.tur === "gider" ? -1 : 1) : a.sira !== b.sira ? a.sira - b.sira : a.ad.localeCompare(b.ad, "tr");

export const hesapSirasi = (a: Hesap, b: Hesap): number =>
  a.sira !== b.sira ? a.sira - b.sira : a.ad.localeCompare(b.ad, "tr");

/**
 * Forma verilecek boş kayıt. Tarihi çağıran seçiyor: ekranda başka bir dönem
 * açıkken eklenen işlem sessizce bugüne yazılmasın.
 */
export function bosIslem(tarih: string, hesapId: string | null, kategoriId: string): Islem {
  return {
    id: yeniId(),
    kategoriId,
    tur: "gider",
    kurus: 0,
    tarih,
    not: "",
    karsiTaraf: "",
    odeme: "kart",
    hesapId,
    transfer: false,
    eklendi: tarih,
  };
}

/** Listelerdeki dar tarih sütunu: "3 Ağu". */
export const kisaTarih = (iso: string): string =>
  `${Number(iso.slice(8, 10))} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`;

/**
 * Formu besleyen son karşı taraflar — aynı işyeri iki farklı yazımla
 * girilmesin diye tamamlama listesi.
 */
export function karsiTaraflar(islemler: Islem[], adet = 40): string[] {
  const gorulen: string[] = [];
  for (const i of [...islemler].sort((a, b) => (a.tarih < b.tarih ? 1 : -1))) {
    if (i.karsiTaraf && !gorulen.includes(i.karsiTaraf)) gorulen.push(i.karsiTaraf);
    if (gorulen.length >= adet) break;
  }
  return gorulen;
}

/* --- ekstre dosyası ------------------------------------------------------ */

export const BOS_EKSTRE: EkstreDosyasi = { kurallar: [], partiler: [] };

export function normalizeEkstre(ham: unknown): EkstreDosyasi {
  if (!ham || typeof ham !== "object") return BOS_EKSTRE;
  const e = ham as Record<string, unknown>;

  const kurallar = dizi(e.kurallar)
    .map((x, i): Kural => {
      const k = x as Record<string, unknown>;
      return {
        id: metin(k.id) || `k${i}`,
        icerir: metin(k.icerir),
        kategoriId: metin(k.kategoriId),
        transfer: evet(k.transfer),
        kullanim: Math.max(0, Math.trunc(sayi(k.kullanim))),
      };
    })
    .filter((k) => k.icerir && k.kategoriId);

  const partiler = dizi(e.partiler)
    .map((x, i): Parti => {
      const p = x as Record<string, unknown>;
      return {
        id: metin(p.id) || `p${i}`,
        hesapId: metin(p.hesapId),
        dosya: metin(p.dosya),
        zaman: metin(p.zaman),
        aktarilan: Math.trunc(sayi(p.aktarilan)),
        atlanan: Math.trunc(sayi(p.atlanan)),
        ilk: typeof p.ilk === "string" ? p.ilk : null,
        son: typeof p.son === "string" ? p.son : null,
      };
    })
    .filter((p) => p.id);

  return { kurallar, partiler };
}
