/**
 * `data/W<hafta>.json` ve `data/hatirla.json` şemasının okunan kısmı.
 *
 * Bu dosyalar eski uygulamanın (app.py) ve asistanın malı. Faz 4'te yalnızca
 * OKUNUYOR — yazma Faz 5'te, çünkü bir slotu tamamlamak beş yeri birden
 * güncellemek demek (CLAUDE.md "Tek giriş kuralı"); yarısını yapmak sistemi
 * tutarsız bırakırdı.
 */

export interface Gun {
  no: number;
  ad: string;
  tarih: string;
  isoTarih: string;
}

export type SlotDurumu = "planli" | "yapildi" | "kacti" | "tasindi";

export interface Slot {
  id: string;
  gun: number;
  saat: string;
  sureDk: number;
  alan: string;
  konu: string;
  durum: SlotDurumu | string;
  esnek?: boolean;
}

export interface Seans {
  id?: string;
  tip?: string;
  baslangic?: string;
  sureDk?: number;
  /** Slota bağlıysa slot ID'si; bağsız seans ayrı kalem sayılır. */
  odakSlot?: string | null;
  odakMetin?: string;
  /** Sonradan atanan alan adı; `odakMetin`'den önce gelir. */
  alan?: string;
}

/** Sıklık üç tür alır; ayrıntı `gunluk.md`'de. */
export type Siklik =
  | { tip: "gunler"; gunler: number[] }
  | { tip: "aralik"; her: number; baslangic: string }
  | { tip: "haftada"; adet: number }
  | { tip: "serbest" };

export interface Aliskanlik {
  ad: string;
  siklik?: unknown;
  /** Hafta dosyasında donar; geçmiş haftalar sonradan değişmesin diye. */
  beklenenGunler?: number[] | null;
  gunler?: Record<string, unknown>;
  hedefId?: string;
}

export interface Hafta {
  hafta: number;
  yil: number;
  baslik: string;
  durum?: string;
  ofisGunleri?: number[];
  gunler: Gun[];
  slotlar: Slot[];
  seanslar?: Seans[];
  gunlukAliskanliklar?: Aliskanlik[];
  /** Verilmiş ID'ler; bir kez verilen asla yeniden kullanılmaz (kural 2). */
  kullanilmisIdler?: string[];
  rotasyon?: string[];
  sosyalKota?: { haftaSonu?: boolean; haftaIci?: boolean };
  /** app.py's change log: one line per change, so nothing is lost silently. */
  degisiklikGunlugu?: { tarih: string; not: string }[];
  /** Filled in when the week is closed; empty strings until then. */
  kapanis?: { tamamlanma?: string; isYarayan?: string; yaramayan?: string; tasinan?: string };
}

export interface HatirlaMaddesi {
  id: string;
  metin: string;
  eklendi: string;
  arsiv?: boolean;
}

/** CLAUDE.md'deki durum işaretleri. Uygulama da aynı sözlüğü kullanır. */
export const DURUM_ISARETI: Record<string, string> = {
  planli: "☐",
  yapildi: "☑",
  kacti: "⊘",
  tasindi: "→",
};

/** Bugünün ISO gün numarası: Pazartesi 1 … Pazar 7. */
export function bugunGunNo(d = new Date()): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** Yerel güne göre ISO tarih; UTC kayması günü kaydırmasın. */
export function bugunIso(d = new Date()): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Hatırla maddesi kimliği: `h-` + zaman damgası (milisaniyeye kadar). */
export const yeniHatirlaId = (d = new Date()): string =>
  "h-" + d.toISOString().replace(/[-:T.]/g, "").slice(0, 17);

/**
 * Günün öne çıkan hatırlatmaları. app.py'deki `hatirla_bugun` ile AYNI seçim:
 * tarihten türer, gün içinde sabit kalır, ertesi gün kayar. İki uygulama aynı
 * maddeleri göstersin diye birebir aynı formül.
 *
 * 719163, Python'un `date.toordinal()` değerinin epoch karşılığı.
 */
export function hatirlaBugun(
  maddeler: HatirlaMaddesi[],
  adet: number,
  g = new Date(),
): HatirlaMaddesi[] {
  const aktif = maddeler.filter((m) => !m.arsiv);
  if (aktif.length === 0 || adet <= 0) return [];
  const n = Math.min(adet, aktif.length);
  const ordinal =
    Math.floor(Date.UTC(g.getFullYear(), g.getMonth(), g.getDate()) / 86400000) + 719163;
  const baslangic = (ordinal * n) % aktif.length;
  return Array.from({ length: n }, (_, i) => aktif[(baslangic + i) % aktif.length]!);
}
