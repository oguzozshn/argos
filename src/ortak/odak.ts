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

export const saatMetni = (sn: number): string =>
  `${ikiHane(Math.floor(sn / 60))}:${ikiHane(sn % 60)}`;

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

/** Seans kaydedilecek kadar uzun mu (`enAzKayitDk`). */
export const kayitYeterli = (sn: number, k: OdakAyarlari): boolean => sn >= k.enAzKayitDk * 60;
