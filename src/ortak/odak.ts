import type { Seans } from "./plan";

/**
 * Odak zamanlayıcısının matematiği. Saf: `Date.now()` dışarıdan verilir.
 *
 * Sayaç DAMGA tabanlıdır — geçen süre `şimdi - başlangıç` ile hesaplanır,
 * her saniye bir sayaç artırılmaz. Sekme arkaya atıldığında ya da tarayıcı
 * zamanlayıcıyı kıstığında sapma olmamasının sebebi bu.
 */

export interface OdakAyarlari {
  pomodoroDk: number;
  kisaMolaDk: number;
  uzunMolaDk: number;
  uzunMolaHerKacTur: number;
  enAzKayitDk: number;
  saatBicimleri?: string[];
  varsayilanBicim?: string;
}

export const VARSAYILAN_ODAK: OdakAyarlari = {
  pomodoroDk: 30,
  kisaMolaDk: 5,
  uzunMolaDk: 15,
  uzunMolaHerKacTur: 4,
  enAzKayitDk: 1,
};

export type OdakModu = "pomodoro" | "kronometre";
export type OdakFazi = "calisma" | "mola";

export interface OdakDurumu {
  mod: OdakModu;
  faz: OdakFazi;
  calisiyor: boolean;
  /** Çalışmaya başlandığı an (ms damgası). Duruyorsa null. */
  basladi: number | null;
  /** Duraklatmalardan biriken saniye. */
  gecen: number;
  /** Tamamlanan çalışma turu — uzun molanın ne zaman geleceğini belirler. */
  tur: number;
  /** Hedef doldu mu. Dolunca çalışma fazında sayaç durmaz, yukarı sayar. */
  doldu: boolean;
}

export const BOS_DURUM: OdakDurumu = {
  mod: "pomodoro",
  faz: "calisma",
  calisiyor: false,
  basladi: null,
  gecen: 0,
  tur: 0,
  doldu: false,
};

/** Bu fazın hedefi (saniye). Kronometrede hedef yok. */
export function hedefSn(d: OdakDurumu, k: OdakAyarlari): number | null {
  if (d.mod === "kronometre") return null;
  if (d.faz === "calisma") return k.pomodoroDk * 60;
  return (d.tur % k.uzunMolaHerKacTur === 0 ? k.uzunMolaDk : k.kisaMolaDk) * 60;
}

export function gecenSn(d: OdakDurumu, simdi: number): number {
  return d.gecen + (d.calisiyor && d.basladi !== null ? Math.floor((simdi - d.basladi) / 1000) : 0);
}

export function kalanSn(d: OdakDurumu, k: OdakAyarlari, simdi: number): number | null {
  const h = hedefSn(d, k);
  return h === null ? null : Math.max(0, h - gecenSn(d, simdi));
}

/**
 * Hedef dolduktan sonra sayaç durmaz: fazla mesai yukarı sayılır ve
 * kaydedilen süre gerçek geçen süredir.
 */
export function fazlaSn(d: OdakDurumu, k: OdakAyarlari, simdi: number): number {
  const h = hedefSn(d, k);
  return h === null ? 0 : Math.max(0, gecenSn(d, simdi) - h);
}

/** Ekranda gösterilecek saniye: geri sayım, doluysa fazla mesai, kronometrede geçen. */
export function gosterSn(d: OdakDurumu, k: OdakAyarlari, simdi: number): number {
  if (d.doldu) return fazlaSn(d, k, simdi);
  const kalan = kalanSn(d, k, simdi);
  return kalan === null ? gecenSn(d, simdi) : kalan;
}

/** Halka doluluk oranı (0–1). Hedef dolduysa halka dolu kalır. */
export function oran(d: OdakDurumu, k: OdakAyarlari, simdi: number): number {
  if (d.doldu) return 1;
  const h = hedefSn(d, k);
  const gecen = gecenSn(d, simdi);
  // Kronometrede hedef yok; halka saatlik döner.
  if (h === null) return (gecen % 3600) / 3600;
  return h ? Math.min(1, gecen / h) : 0;
}

export const ikiHane = (n: number): string => String(n).padStart(2, "0");

/**
 * Sayacın parçaları: bir saatin altında ["29", "58"], üstünde ["7", "30", "03"].
 * Yalnızca dakika:saniye yazılınca uzun fazla mesai "450:03" gibi okunmaz
 * hâle geliyordu.
 */
export function sayacParcalari(sn: number): string[] {
  const t = Math.max(0, Math.floor(sn));
  const sa = Math.floor(t / 3600);
  const dk = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return sa > 0 ? [String(sa), ikiHane(dk), ikiHane(s)] : [ikiHane(dk), ikiHane(s)];
}

export const sayacMetni = (sn: number): string => sayacParcalari(sn).join(":");

/** app.py'deki `s-%Y%m%d%H%M%S` biçimi. */
export function seansId(simdi: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    "s-" +
    simdi.getFullYear() +
    p(simdi.getMonth() + 1) +
    p(simdi.getDate()) +
    p(simdi.getHours()) +
    p(simdi.getMinutes()) +
    p(simdi.getSeconds())
  );
}

/** Yerel saatle ISO damgası (saniye hassasiyetinde), UTC'ye kaymadan. */
export function yerelIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/**
 * Kaydedilecek seans. Başlangıç, bitişten süre kadar geri alınarak yazılır —
 * eski uygulama da böyle yapıyor, zaman özeti başlangıç gününe bakıyor.
 */
export function seansKaydi(o: {
  tip: OdakModu;
  dk: number;
  odakSlot?: string | null;
  odakMetin?: string;
  simdi: Date;
}): Seans {
  return {
    id: seansId(o.simdi),
    tip: o.tip,
    baslangic: yerelIso(new Date(o.simdi.getTime() - o.dk * 60000)),
    sureDk: o.dk,
    odakSlot: o.odakSlot || null,
    odakMetin: (o.odakMetin ?? "").trim(),
  };
}

/**
 * İki nabız arasında bu kadar boşluk varsa bilgisayar uyumuş sayılır.
 * Chromium arka plandaki zamanlayıcıları dakikada bire kadar kısabiliyor;
 * daha düşük bir eşik uyku olmadan da alarm verirdi.
 */
export const UYKU_ESIGI_MS = 5 * 60_000;

/** Uyku yüzünden sayılmayan ara. */
export interface Kesinti {
  /** Sayacın durdurulduğu an: son görüldüğü an (ms damgası). */
  durduAn: number;
  /** Sayılmayan ara (saniye). */
  sn: number;
}

/**
 * Sayaç damga tabanlı olduğu için uykuda da "işler": kapak kapalıyken
 * çalışan pomodoro sabah saatlerce fazla mesai gösterir, "Bitir" de onu
 * seans diye yazardı. Nabızlar arasında eşikten uzun boşluk varsa sayaç
 * son görüldüğü anda durdurulur; aradaki süre sayılmaz, kullanıcıya sorulur.
 */
export function uykuyuYakala(
  d: OdakDurumu,
  sonGorulme: number | null,
  simdi: number,
  esikMs = UYKU_ESIGI_MS,
): { d: OdakDurumu; kesinti: Kesinti | null } {
  if (!d.calisiyor || d.basladi === null) return { d, kesinti: null };
  // Duraklatıp devam edildiyse eski nabız başlangıçtan geride kalır.
  const son = Math.max(sonGorulme ?? d.basladi, d.basladi);
  if (simdi - son <= esikMs) return { d, kesinti: null };
  return {
    d: { ...d, gecen: gecenSn(d, son), calisiyor: false, basladi: null },
    kesinti: { durduAn: son, sn: Math.floor((simdi - son) / 1000) },
  };
}

/** Seans kaydedilecek kadar uzun mu (`enAzKayitDk`). */
export const kayitYeterli = (sn: number, k: OdakAyarlari): boolean => sn >= k.enAzKayitDk * 60;
