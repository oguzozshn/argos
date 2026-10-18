/**
 * Salt okunur özetler: arşiv, zaman dökümü, alışkanlık serileri, takvim,
 * yol haritaları ve hedefler.
 *
 * `app.py`'deki karşılıklarının birebir taşınmış hâli — aynı veriden aynı
 * sayıyı üretmek zorundalar; `araclar/parite-testi.mts` bunu her koşuda
 * karşılaştırıyor. Yuvarlama ve sıralama kuralları bu yüzden Python'unkiyle
 * eşleştirildi (`gun.ts` → `yuvarla`, `kSirala`).
 *
 * Hepsi saf: dosya okumaz, tarihi ve veriyi dışarıdan alır.
 */

import {
  AY_ADLARI,
  AY_TAM,
  GUN_ADLARI,
  GUN_KISA,
  TUM_GUNLER,
  ayBasi,
  gunAl,
  gunEkle,
  gunFarki,
  haftaninGunu,
  kSirala,
  yilAl,
  yuvarla,
} from "./gun.ts";
import type { KuralSeti } from "./kural.ts";
import type { Hafta, Seans, Siklik, Slot } from "./plan";

export const ETIKETSIZ = "Odak (etiketsiz)";

/** Hafta dosyası + dosya kodu (W36). Takvim kodu da döndürüyor. */
export interface HaftaKayit {
  kod: string;
  veri: Hafta;
}

export interface RoadmapAdim {
  metin: string;
  yapildi?: boolean;
}

export interface RoadmapAsama {
  ad: string;
  tahminiSaat?: number;
  adimlar: RoadmapAdim[];
}

export interface Roadmap {
  slug: string;
  alan: string;
  hedef: string;
  hedefId?: string | null;
  suAnAsama?: number;
  asamalar: RoadmapAsama[];
  ilkTahminSaat?: number;
  ilkTahminTarih?: string;
}

/** Kural dosyasının okunan kısmı. Kapasite ve korumalı alanlar `kural.ts`'te. */
export interface Kurallar extends Partial<KuralSeti> {
  gunlukAliskanliklar?: { ad: string; hedefId?: string }[];
  rotasyonHavuzu?: string[];
  rotasyonAdedi?: number;
  /** Areas planned every week, outside the rotation (K02). */
  sabitAlanlar?: string[];
}

/* --- sıklık ------------------------------------------------------------- */

interface SiklikGirdisi {
  siklik?: unknown;
  beklenenGunler?: number[] | null;
  gunler?: unknown;
}

/** app.py `siklik_oku`. Eski biçim (düz `gunler` dizisi) da okunur. */
export function siklikOku(a: SiklikGirdisi, bugun: string): Siklik {
  const s = a.siklik as Record<string, unknown> | undefined;
  const tip = s && typeof s === "object" ? s.tip : undefined;

  if (tip === "gunler" || tip === "aralik" || tip === "haftada" || tip === "serbest") {
    if (tip === "gunler") {
      const ham = Array.isArray(s!.gunler) ? (s!.gunler as unknown[]) : [];
      const g = [...new Set(ham.map(Number).filter((x) => x >= 1 && x <= 7))].sort((a, b) => a - b);
      return { tip: "gunler", gunler: g.length ? g : [...TUM_GUNLER] };
    }
    if (tip === "aralik") {
      return {
        tip: "aralik",
        her: Math.max(2, Number(s!.her ?? 2)),
        baslangic: (s!.baslangic as string) || bugun,
      };
    }
    if (tip === "serbest") return { tip: "serbest" };
    return { tip: "haftada", adet: Math.max(1, Math.min(7, Number(s!.adet ?? 2))) };
  }

  // Anahtarın VARLIĞI önemli: beklenenGunler: null da bir cevaptır.
  const g = "beklenenGunler" in a ? a.beklenenGunler : (a.gunler as number[] | undefined);
  if (Array.isArray(g) && g.length > 0) {
    return {
      tip: "gunler",
      gunler: [...new Set(g.map(Number).filter((x) => x >= 1 && x <= 7))].sort((a, b) => a - b),
    };
  }
  return { tip: "gunler", gunler: [...TUM_GUNLER] };
}

export function siklikMetni(s: Siklik): string {
  if (s.tip === "serbest") return "sıklık yok";
  if (s.tip === "aralik") return `${s.her} günde 1`;
  if (s.tip === "haftada") return `haftada ${s.adet}`;
  const g = [...s.gunler].sort((a, b) => a - b);
  return JSON.stringify(g) === JSON.stringify(TUM_GUNLER)
    ? "her gün"
    : s.gunler.map((x) => GUN_KISA[x - 1]).join(" ");
}

/* --- ortak yardımcılar --------------------------------------------------- */

/** Slot ID → odak seanslarından ölçülen gerçek dakika. */
export function olculenDk(v: Hafta): Map<string, number> {
  const d = new Map<string, number>();
  for (const s of v.seanslar ?? []) {
    if (s.odakSlot) d.set(s.odakSlot, (d.get(s.odakSlot) ?? 0) + (s.sureDk ?? 0));
  }
  return d;
}

/** Slota bağlı olmayan seansın alan adı. Sonradan atanan `alan` önce gelir. */
export const seansAdi = (x: Seans): string => x.alan || (x.odakMetin ?? "").trim() || ETIKETSIZ;

const gunHaritasi = (v: Hafta): Map<number, string | undefined> =>
  new Map((v.gunler ?? []).map((g) => [g.no, g.isoTarih]));

/* --- arşiv --------------------------------------------------------------- */

export interface ArsivAlan {
  alan: string;
  toplamDk: number;
  yilDk: number;
  olculenDk: number;
  seans: number;
  haftaSayisi: number;
  ortalamaDk: number;
}

export interface ArsivHafta {
  hafta: number;
  yil: number;
  baslik: string;
  durum: string;
  slotPlanli: number;
  slotYapilan: number;
  yapilanDk: number;
  planliDk: number;
  seansSayisi: number;
  olculenDk: number;
  alanlar: string[];
}

/**
 * Yapılan işlerin kümülatif dökümü. Kaynak tüm hafta dosyaları — ayrı bir
 * arşiv dosyası tutulmaz, kopya iki kayıt demek olurdu ve biri eskirdi.
 */
export function arsiv(haftalar: HaftaKayit[], bugun: string) {
  const buYil = yilAl(bugun);
  const alanlar = new Map<
    string,
    { toplamDk: number; yilDk: number; seans: number; olculenDk: number; haftalar: Set<number> }
  >();
  const haftaListe: ArsivHafta[] = [];

  const al = (ad: string) => {
    let a = alanlar.get(ad);
    if (!a) {
      a = { toplamDk: 0, yilDk: 0, seans: 0, olculenDk: 0, haftalar: new Set() };
      alanlar.set(ad, a);
    }
    return a;
  };

  for (const { veri: v } of haftalar) {
    const yil = v.yil ?? buYil;
    const yapilan = (v.slotlar ?? []).filter((s) => s.durum === "yapildi");
    const planli = (v.slotlar ?? []).filter((s) => s.durum !== "tasindi");
    const olculen = olculenDk(v);
    /** Ölçülen varsa o, yoksa planlanan (K15). */
    const sure = (s: Slot) => olculen.get(s.id) || s.sureDk;

    for (const s of yapilan) {
      const a = al(s.alan);
      const dk = sure(s);
      a.toplamDk += dk;
      a.seans += 1;
      a.haftalar.add(v.hafta);
      if (olculen.get(s.id)) a.olculenDk += olculen.get(s.id)!;
      if (yil === buYil) a.yilDk += dk;
    }

    // Slota bağlı olmayan odak seansları ayrı alana yazılır.
    for (const x of v.seanslar ?? []) {
      if (x.odakSlot || !x.sureDk) continue;
      const a = al(seansAdi(x));
      a.toplamDk += x.sureDk;
      a.olculenDk += x.sureDk;
      a.seans += 1;
      a.haftalar.add(v.hafta);
      if (yil === buYil) a.yilDk += x.sureDk;
    }

    haftaListe.push({
      hafta: v.hafta,
      yil,
      baslik: v.baslik ?? `Hafta ${v.hafta}`,
      durum: v.durum ?? "",
      slotPlanli: planli.length,
      slotYapilan: yapilan.length,
      yapilanDk: yapilan.reduce((t, s) => t + sure(s), 0),
      planliDk: planli.reduce((t, s) => t + s.sureDk, 0),
      seansSayisi: (v.seanslar ?? []).length,
      olculenDk: (v.seanslar ?? []).reduce((t, x) => t + (x.sureDk ?? 0), 0),
      alanlar: [...new Set(yapilan.map((s) => s.alan))].sort(kSirala),
    });
  }

  const dokum: ArsivAlan[] = [...alanlar.entries()].map(([a, d]) => ({
    alan: a,
    toplamDk: d.toplamDk,
    yilDk: d.yilDk,
    olculenDk: d.olculenDk,
    seans: d.seans,
    haftaSayisi: d.haftalar.size,
    ortalamaDk: d.seans ? yuvarla(d.toplamDk / d.seans) : 0,
  }));
  dokum.sort((a, b) => b.toplamDk - a.toplamDk);

  return {
    yil: buYil,
    alanlar: dokum,
    haftalar: haftaListe,
    genelToplamDk: dokum.reduce((t, x) => t + x.toplamDk, 0),
    yilToplamDk: dokum.reduce((t, x) => t + x.yilDk, 0),
  };
}

/* --- zaman özeti --------------------------------------------------------- */

export type Kapsam = "gun" | "hafta" | "ay" | "yil";

export function zamanAraligi(kapsam: string, tarih: string) {
  const yil = yilAl(tarih);
  const ay = Number(tarih.slice(5, 7));
  const gun = gunAl(tarih);

  if (kapsam === "gun") {
    return {
      kapsam: "gun" as Kapsam,
      bas: tarih,
      son: tarih,
      baslik: `${gun} ${AY_TAM[ay - 1]} ${yil} · ${GUN_ADLARI[haftaninGunu(tarih)]}`,
      onceki: gunEkle(tarih, -1),
      sonraki: gunEkle(tarih, 1),
    };
  }

  if (kapsam === "hafta") {
    const bas = gunEkle(tarih, -haftaninGunu(tarih));
    const son = gunEkle(bas, 6);
    return {
      kapsam: "hafta" as Kapsam,
      bas,
      son,
      baslik: `${gunAl(bas)} ${AY_TAM[Number(bas.slice(5, 7)) - 1]} – ${gunAl(son)} ${
        AY_TAM[Number(son.slice(5, 7)) - 1]
      } ${yilAl(son)}`,
      onceki: gunEkle(bas, -7),
      sonraki: gunEkle(bas, 7),
    };
  }

  if (kapsam === "ay") {
    const bas = ayBasi(tarih);
    const son = gunEkle(ayBasi(gunEkle(bas, 32)), -1);
    return {
      kapsam: "ay" as Kapsam,
      bas,
      son,
      baslik: `${AY_TAM[ay - 1]} ${yil}`,
      onceki: ayBasi(gunEkle(bas, -1)),
      sonraki: gunEkle(son, 1),
    };
  }

  return {
    kapsam: "yil" as Kapsam,
    bas: `${yil}-01-01`,
    son: `${yil}-12-31`,
    baslik: String(yil),
    onceki: `${yil - 1}-01-01`,
    sonraki: `${yil + 1}-01-01`,
  };
}

/**
 * Bir aralıkta neye ne kadar zaman gittiği.
 *
 * Sayma kuralları `arsiv` ile aynı tutulur, yoksa iki ekran farklı sayı
 * gösterir: slotta ölçüm varsa ölçülen, yoksa planlanan (K15); slota bağlı
 * seans ayrıca sayılmaz — slotun içinde; bağsız seans ayrı kalem.
 */
export function zamanOzet(
  haftalar: HaftaKayit[],
  kapsam: string,
  tarih: string,
  bugun: string,
) {
  const a = zamanAraligi(kapsam, tarih);
  const basIso = a.bas;
  const sonIso = a.son;

  const kalemler: Record<string, unknown>[] = [];
  const alanlar = new Map<string, number>();
  const gunluk = new Map<string, number>();

  for (const { veri: v } of haftalar) {
    const gunler = gunHaritasi(v);
    const tarihler = [...gunler.values()].filter(Boolean) as string[];
    if (gunler.size > 0) {
      const enBuyuk = tarihler.length ? tarihler.reduce((x, y) => (x > y ? x : y)) : "";
      const enKucuk = tarihler.length ? tarihler.reduce((x, y) => (x < y ? x : y)) : "";
      if ((enBuyuk < basIso || enKucuk > sonIso) && !(v.seanslar ?? []).length) continue;
    }
    const olculen = olculenDk(v);

    for (const s of v.slotlar ?? []) {
      if (s.durum !== "yapildi") continue;
      const gun = gunler.get(s.gun);
      if (!gun || !(basIso <= gun && gun <= sonIso)) continue;
      const dk = olculen.get(s.id) || s.sureDk;
      kalemler.push({
        tarih: gun,
        ad: `${s.alan} — ${s.konu}`,
        alan: s.alan,
        dk,
        slotId: s.id,
        kaynak: olculen.get(s.id) ? "ölçülen" : "planlanan",
      });
      alanlar.set(s.alan, (alanlar.get(s.alan) ?? 0) + dk);
      gunluk.set(gun, (gunluk.get(gun) ?? 0) + dk);
    }

    for (const x of v.seanslar ?? []) {
      if (x.odakSlot || !x.sureDk) continue;
      const gun = (x.baslangic ?? "").slice(0, 10);
      if (!(basIso <= gun && gun <= sonIso)) continue;
      const ad = seansAdi(x);
      kalemler.push({
        tarih: gun,
        ad,
        alan: ad,
        dk: x.sureDk,
        seansId: x.id,
        hafta: v.hafta,
        kaynak: "ölçülen",
        etiketsiz: ad === ETIKETSIZ,
      });
      alanlar.set(ad, (alanlar.get(ad) ?? 0) + x.sureDk);
      gunluk.set(gun, (gunluk.get(gun) ?? 0) + x.sureDk);
    }
  }

  kalemler.sort((x, y) => {
    const t = kSirala(x.tarih as string, y.tarih as string);
    return t !== 0 ? t : (y.dk as number) - (x.dk as number);
  });
  const toplam = [...alanlar.values()].reduce((t, x) => t + x, 0);

  // Yılda gün gün çubuk okunmaz — ay ay gösterilir.
  let dizi: { etiket: string; anahtar: string; dk: number }[] = [];
  if (a.kapsam === "yil") {
    const aylik = new Map<string, number>();
    for (const [iso, dk] of gunluk) {
      const k = iso.slice(0, 7);
      aylik.set(k, (aylik.get(k) ?? 0) + dk);
    }
    const yil = yilAl(a.bas);
    dizi = Array.from({ length: 12 }, (_, i) => {
      const anahtar = `${yil}-${String(i + 1).padStart(2, "0")}`;
      return { etiket: AY_ADLARI[i]!, anahtar, dk: aylik.get(anahtar) ?? 0 };
    });
  } else if (a.kapsam !== "gun") {
    for (let g = a.bas; g <= a.son; g = gunEkle(g, 1)) {
      dizi.push({ etiket: String(gunAl(g)), anahtar: g, dk: gunluk.get(g) ?? 0 });
    }
  }

  return {
    kapsam: a.kapsam,
    tarih,
    baslik: a.baslik,
    baslangic: basIso,
    bitis: sonIso,
    onceki: a.onceki,
    sonraki: a.sonraki,
    bugun,
    toplamDk: toplam,
    gunSayisi: gunFarki(a.son, a.bas) + 1,
    alanlar: [...alanlar.entries()]
      .map(([alan, dk]) => ({ alan, dk, oran: toplam ? yuvarla((dk * 100) / toplam) : 0 }))
      .sort((x, y) => y.dk - x.dk),
    kalemler,
    dizi,
  };
}

/* --- hız ----------------------------------------------------------------- */

/**
 * Alan başına haftalık gerçekleşen dakika. Başlamamış haftalar bölene
 * katılmaz — önceden kurulan gelecek hafta ortalamayı olmadığı yerden
 * aşağı çekiyordu.
 */
export function haftalikHiz(haftalar: HaftaKayit[], bugun: string): Map<string, [number, number]> {
  const toplam = new Map<string, number>();
  const hafta = new Map<string, number>();

  for (const { veri: v } of haftalar) {
    const gunler = v.gunler ?? [];
    if (gunler.length > 0 && (gunler[0]!.isoTarih ?? "") > bugun) continue;
    // Bir alanın hızı, o alanın plana girdiği haftalara bölünür.
    const alanlar = new Set(
      (v.slotlar ?? []).filter((s) => s.durum !== "tasindi").map((s) => s.alan),
    );
    for (const a of alanlar) hafta.set(a, (hafta.get(a) ?? 0) + 1);
    for (const s of v.slotlar ?? []) {
      if (s.durum === "yapildi") toplam.set(s.alan, (toplam.get(s.alan) ?? 0) + s.sureDk);
    }
  }

  const sonuc = new Map<string, [number, number]>();
  for (const [a, dk] of toplam) {
    const h = hafta.get(a);
    if (h) sonuc.set(a, [dk / h, h]);
  }
  return sonuc;
}

/**
 * Alan başına haftalık PLANLANAN dakika — ölçülen hız yokken kullanılır.
 * Rotasyondaki alanlar her hafta plana girmediği için payları düşürülür.
 */
export function planliHiz(haftalar: HaftaKayit[], kurallar: Kurallar): Map<string, number> {
  const dk = new Map<string, number>();
  if (haftalar.length === 0) return dk;
  const v = haftalar[haftalar.length - 1]!.veri;
  const havuz = kurallar.rotasyonHavuzu ?? [];
  const pay = havuz.length ? (kurallar.rotasyonAdedi ?? 3) / havuz.length : 1;

  for (const s of v.slotlar ?? []) {
    if (s.durum === "tasindi") continue;
    dk.set(s.alan, (dk.get(s.alan) ?? 0) + s.sureDk);
  }
  const sonuc = new Map<string, number>();
  for (const [a, m] of dk) sonuc.set(a, havuz.includes(a) ? m * pay : m);
  return sonuc;
}

/* --- yol haritaları ------------------------------------------------------ */

/**
 * Liste görünümü için: ilerleme + süre tahmini.
 *
 * Tahmin önce ölçülen hızdan kurulur. Hiç ölçüm yoksa plandaki haftalık
 * süreden türetilir — tahminin nereden geldiği `hizKaynagi` ile bildirilir.
 *
 * app.py bu noktada eksik `ilkTahminSaat`'i dosyaya yazar; burası saf olduğu
 * için hesaplar ama yazmaz. Yazma çağıran tarafın işi.
 */
export function roadmapOzet(
  haftalar: HaftaKayit[],
  kurallar: Kurallar,
  roadmapler: Roadmap[],
  bugun: string,
) {
  const hiz = haftalikHiz(haftalar, bugun);
  const plan = planliHiz(haftalar, kurallar);
  const liste = [];

  for (const r of [...roadmapler].sort((a, b) => kSirala(a.slug, b.slug))) {
    // İlk tahmin bir kez çakılır: sonradan aşama eklenirse "en başta ne
    // kadardı" sorusunun cevabı kaymasın diye.
    const ilkTahminSaat =
      r.ilkTahminSaat || r.asamalar.reduce((t, a) => t + (a.tahminiSaat ?? 0), 0);
    const ilkTahminTarih = r.ilkTahminSaat ? r.ilkTahminTarih : bugun;

    const adim = r.asamalar.reduce((t, a) => t + a.adimlar.length, 0);
    const biten = r.asamalar.reduce(
      (t, a) => t + a.adimlar.filter((x) => x.yapildi).length,
      0,
    );
    const su = r.suAnAsama ?? 0;
    const kalanSaat = r.asamalar.reduce(
      (t, a, i) => (i >= su ? t + (a.tahminiSaat ?? 0) : t),
      0,
    );

    const [olculenDkHiz, olcumHafta] = hiz.get(r.alan) ?? [0, 0];
    const planDk = plan.get(r.alan) ?? 0;

    const tahmin = (dakika: number): [number | null, string | null] => {
      if (!dakika || !kalanSaat) return [null, null];
      const h = yuvarla((kalanSaat * 60) / dakika);
      return [h, gunEkle(bugun, h * 7)];
    };

    const [planHafta, planBitis] = tahmin(planDk);
    const [olcHafta, olcBitis] = tahmin(olculenDkHiz);

    // Ölçüm ancak iki haftalık kayıt birikince ana tahmin olur.
    const olcumYeter = olculenDkHiz > 0 && olcumHafta >= 2;
    const dk = olcumYeter ? olculenDkHiz : planDk;
    const kaynak = olcumYeter ? "olculen" : "plan";
    const hafta = olcumYeter ? olcHafta : planHafta;
    const bitis = olcumYeter ? olcBitis : planBitis;

    // Slot konusu için öneri: şu anki aşamanın ilk işaretlenmemiş adımı.
    let siradaki: string | null = null;
    if (su < r.asamalar.length) {
      siradaki = r.asamalar[su]!.adimlar.find((x) => !x.yapildi)?.metin ?? null;
    }

    liste.push({
      slug: r.slug,
      alan: r.alan,
      hedef: r.hedef,
      hedefId: r.hedefId ?? null,
      ilkTahminSaat,
      ilkTahminTarih: ilkTahminTarih ?? null,
      suAnAsama: su,
      suAnAsamaAd: su < r.asamalar.length ? r.asamalar[su]!.ad : "tamamlandı",
      asamaSayisi: r.asamalar.length,
      adimToplam: adim,
      adimBiten: biten,
      kalanSaat,
      haftalikDk: yuvarla(dk),
      hizKaynagi: dk > 0 ? kaynak : null,
      tahminiHafta: hafta,
      tahminiBitis: bitis,
      planDk: yuvarla(planDk),
      planHafta,
      planBitis,
      olculenDk: yuvarla(olculenDkHiz),
      olculenHafta: olcHafta,
      olculenBitis: olcBitis,
      olcumHaftasi: olcumHafta,
      siradakiAdim: siradaki,
    });
  }
  return liste;
}

/* --- hedefler ------------------------------------------------------------ */

export interface Hedef {
  id: string;
  [k: string]: unknown;
}

/**
 * Hedefler + bağlı yol haritaları ve alışkanlıklar.
 * Hedefin kalan süresi bağlı haritaların toplamı; bitiş tahmini en geç biten
 * haritaya göre — paralel çalışılıyor.
 */
export function hedefOzet(
  hedefler: { hedefler?: Hedef[] } & Record<string, unknown>,
  rmler: ReturnType<typeof roadmapOzet>,
  kurallar: Kurallar,
) {
  const v: Record<string, unknown> = { ...hedefler };
  const aliskanliklar = kurallar.gunlukAliskanliklar ?? [];

  const liste = (hedefler.hedefler ?? []).map((h) => {
    const bagli = rmler.filter((r) => r.hedefId === h.id);
    const planB = bagli.map((r) => r.planBitis).filter(Boolean) as string[];
    const olcB = bagli.map((r) => r.olculenBitis).filter(Boolean) as string[];
    const planBitis = planB.length ? planB.reduce((a, b) => (a > b ? a : b)) : null;
    return {
      ...h,
      roadmapler: bagli.map((r) => ({
        slug: r.slug,
        alan: r.alan,
        kalanSaat: r.kalanSaat,
        ilkTahminSaat: r.ilkTahminSaat,
        tahminiBitis: r.tahminiBitis,
        tahminiHafta: r.tahminiHafta,
        hizKaynagi: r.hizKaynagi,
        planBitis: r.planBitis,
        olculenBitis: r.olculenBitis,
        adimBiten: r.adimBiten,
        adimToplam: r.adimToplam,
      })),
      aliskanliklar: aliskanliklar.filter((a) => a.hedefId === h.id).map((a) => a.ad),
      kalanSaat: bagli.reduce((t, r) => t + r.kalanSaat, 0),
      ilkTahminSaat: bagli.reduce((t, r) => t + (r.ilkTahminSaat || r.kalanSaat), 0),
      planBitis,
      olculenBitis: olcB.length ? olcB.reduce((a, b) => (a > b ? a : b)) : null,
      tahminiBitis: planBitis,
    };
  });

  v.hedefler = liste;
  v.bagsizRoadmapler = rmler.filter((r) => !r.hedefId).map((r) => r.slug);
  return v;
}

/* --- takvim -------------------------------------------------------------- */

/**
 * Bir ayın günlerini tüm hafta dosyalarından toplar. Ayrı bir takvim kaydı
 * tutulmaz — `isoTarih` üzerinden eşleşir.
 */
export function takvim(haftalar: HaftaKayit[], yil: number, ay: number) {
  const onEk = `${yil}-${String(ay).padStart(2, "0")}`;
  const gunler: Record<string, Record<string, unknown>> = {};

  const al = (iso: string, kod: string) => {
    let g = gunler[iso];
    if (!g) {
      g = { kod, slotlar: [], aliskanlik: null };
      gunler[iso] = g;
    }
    return g;
  };

  for (const { kod, veri: v } of haftalar) {
    const tarih = gunHaritasi(v);
    if (![...tarih.values()].some((t) => t && t.slice(0, 7) === onEk)) continue;

    for (const s of v.slotlar ?? []) {
      const iso = tarih.get(s.gun);
      if (!iso || iso.slice(0, 7) !== onEk) continue;
      (al(iso, kod).slotlar as unknown[]).push({
        id: s.id,
        saat: s.saat,
        alan: s.alan,
        konu: s.konu,
        durum: s.durum,
        sureDk: s.sureDk,
      });
    }

    for (const [gn, iso] of tarih) {
      if (!iso || iso.slice(0, 7) !== onEk) continue;
      const g = al(iso, kod);
      let yapilan = 0;
      let beklenen = 0;
      for (const a of v.gunlukAliskanliklar ?? []) {
        const bek = a.beklenenGunler;
        if ((a.gunler ?? {})[String(gn)]) yapilan += 1;
        if (bek === null || bek === undefined || bek.includes(gn)) beklenen += 1;
      }
      g.aliskanlik = { yapilan, beklenen };
    }

    for (const x of v.seanslar ?? []) {
      const iso = (x.baslangic ?? "").slice(0, 10);
      if (iso.slice(0, 7) !== onEk) continue;
      const g = al(iso, kod);
      g.seansDk = ((g.seansDk as number) ?? 0) + (x.sureDk ?? 0);
    }
  }

  for (const g of Object.values(gunler)) {
    (g.slotlar as { saat: string }[]).sort((a, b) => kSirala(a.saat, b.saat));
  }
  return { yil, ay, gunler };
}

/* --- alışkanlıklar -------------------------------------------------------- */

export interface AliskanlikKaydi {
  yapilan: Set<string>;
  beklenen: Set<string>;
  siklik: unknown;
}

/** Tüm hafta dosyalarından alışkanlık başına yapılan ve beklenen günler. */
export function aliskanlikKayitlari(haftalar: HaftaKayit[]): Map<string, AliskanlikKaydi> {
  const kayit = new Map<string, AliskanlikKaydi>();

  for (const { veri: v } of haftalar) {
    const tarih = gunHaritasi(v);
    for (const a of v.gunlukAliskanliklar ?? []) {
      let k = kayit.get(a.ad);
      if (!k) {
        k = { yapilan: new Set(), beklenen: new Set(), siklik: a.siklik };
        kayit.set(a.ad, k);
      }
      if (a.siklik) k.siklik = a.siklik;
      for (const [no, iso] of tarih) {
        if (!iso) continue;
        if ((a.gunler ?? {})[String(no)]) k.yapilan.add(iso);
        const bek = a.beklenenGunler;
        if (Array.isArray(bek) && bek.includes(no)) k.beklenen.add(iso);
      }
    }
  }
  return kayit;
}

/**
 * Güncel seri, en uzun seri ve en uzunun başladığı gün.
 * `gunBazli` ise beklenmeyen günler seriyi bozmaz, atlanır.
 */
export function seriHesapla(
  yapilan: Set<string>,
  beklenen: Set<string>,
  gunBazli: boolean,
  bugun: string,
) {
  if (yapilan.size === 0) return { seri: 0, enUzun: 0, enUzunBaslangic: null as string | null };
  const ilk = [...yapilan].reduce((a, b) => (a < b ? a : b));

  let guncel = 0;
  for (let g = bugun; g >= ilk; g = gunEkle(g, -1)) {
    if (yapilan.has(g)) guncel += 1;
    else if (gunBazli && !beklenen.has(g)) continue; // o gün beklenmiyordu
    else if (g === bugun) continue; // bugün henüz bitmedi
    else break;
  }

  let enUzun = 0;
  let enUzunBas: string | null = null;
  let akan = 0;
  let akanBas: string | null = null;
  for (let g = ilk; g <= bugun; g = gunEkle(g, 1)) {
    if (yapilan.has(g)) {
      akan += 1;
      if (akanBas === null) akanBas = g;
      if (akan > enUzun) {
        enUzun = akan;
        enUzunBas = akanBas;
      }
    } else if (gunBazli && !beklenen.has(g)) {
      continue;
    } else {
      akan = 0;
      akanBas = null;
    }
  }
  return { seri: guncel, enUzun, enUzunBaslangic: enUzunBas };
}

/** Alışkanlık başına seri, toplam ve gün gün yapıldı haritası. */
export function aliskanlikOzet(
  haftalar: HaftaKayit[],
  kurallar: Kurallar,
  yil: number | null,
  bugun: string,
) {
  const tanimli = new Set((kurallar.gunlukAliskanliklar ?? []).map((a) => a.ad));
  const kayit = aliskanlikKayitlari(haftalar);
  const seciliYil = yil ?? yilAl(bugun);
  const yilOn = `${seciliYil}-`;

  const liste = [...kayit.entries()].map(([ad, k]) => {
    const s = siklikOku({ siklik: k.siklik }, bugun);
    const gunBazli = s.tip === "gunler" || s.tip === "aralik";
    return {
      ad,
      aktif: tanimli.has(ad),
      siklik: siklikMetni(s),
      siklikTip: s.tip,
      toplam: k.yapilan.size,
      ilkKayit: k.yapilan.size ? [...k.yapilan].reduce((a, b) => (a < b ? a : b)) : null,
      ...seriHesapla(k.yapilan, k.beklenen, gunBazli, bugun),
      gunler: [...k.yapilan].filter((x) => x.startsWith(yilOn)).sort(kSirala),
      beklenen: [...k.beklenen].filter((x) => x.startsWith(yilOn)).sort(kSirala),
    };
  });

  liste.sort((a, b) => {
    if (a.aktif !== b.aktif) return a.aktif ? -1 : 1;
    return kSirala(a.ad, b.ad);
  });

  const yillar = [
    ...new Set([...kayit.values()].flatMap((k) => [...k.yapilan].map((x) => x.slice(0, 4)))),
  ].sort(kSirala);

  return {
    yil: seciliYil,
    yillar: yillar.length ? yillar : [String(yilAl(bugun))],
    aliskanliklar: liste,
  };
}
