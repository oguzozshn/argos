// Explicit .ts extension: this file also runs under plain Node (araclar/asistan-duzen-test.mts).

/**
 * Goals (issue #56): `hedefler.json`, the file app.py also reads. A goal
 * is a name, a target date ("2028-09", "2028" or a full date) and a note;
 * roadmaps point at it with `hedefId`, habits too. Other fields are kept.
 */

export interface HedefKaydi {
  id: string;
  ad: string;
  not?: string;
  /** "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
  hedefTarih?: string;
  eklendi?: string;
  /** Date it was reached; absent while open. */
  bitti?: string | null;
  [k: string]: unknown;
}

export interface HedefDosyasi {
  hedefler: HedefKaydi[];
  [k: string]: unknown;
}

const iki = (n: number) => String(n).padStart(2, "0");

/** "h-20260819195738", the old app's id shape. */
export const yeniHedefId = (d: Date): string =>
  `h-${d.getFullYear()}${iki(d.getMonth() + 1)}${iki(d.getDate())}${iki(d.getHours())}${iki(d.getMinutes())}${iki(d.getSeconds())}`;

export const TARIH_DESENI = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

/** The last day a target date covers: "2028" → 2028-12-31, "2028-09" → 2028-09-30. */
export function hedefSonGunu(hedefTarih: string): string | null {
  if (!TARIH_DESENI.test(hedefTarih)) return null;
  if (hedefTarih.length === 10) return hedefTarih;
  const yil = Number(hedefTarih.slice(0, 4));
  const ay = hedefTarih.length === 7 ? Number(hedefTarih.slice(5, 7)) : 12;
  const gun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  return `${yil}-${iki(ay)}-${iki(gun)}`;
}

/** "1 yıl 11 ay kaldı", "3 hafta kaldı", "5 gün kaldı", "bugün", "geçti". */
export function kalanMetni(hedefTarih: string | undefined, bugun: string): string | null {
  const son = hedefTarih ? hedefSonGunu(hedefTarih) : null;
  if (!son) return null;
  if (son < bugun) return "süresi geçti";
  if (son === bugun) return "bugün";
  const [y1, a1, g1] = bugun.split("-").map(Number) as [number, number, number];
  const [y2, a2, g2] = son.split("-").map(Number) as [number, number, number];
  let ay = (y2 - y1) * 12 + (a2 - a1) - (g2 < g1 ? 1 : 0);
  if (ay >= 1) {
    const yil = Math.floor(ay / 12);
    ay %= 12;
    return `${[yil && `${yil} yıl`, ay && `${ay} ay`].filter(Boolean).join(" ")} kaldı`;
  }
  const gun = Math.round((Date.UTC(y2, a2 - 1, g2) - Date.UTC(y1, a1 - 1, g1)) / 86400000);
  return gun >= 14 ? `${Math.floor(gun / 7)} hafta kaldı` : `${gun} gün kaldı`;
}

/** Reads the file as it is on disk, leaving out entries without an id or a name. */
export function normalizeHedefler(ham: unknown): HedefDosyasi {
  const d = (ham && typeof ham === "object" ? ham : {}) as Record<string, unknown>;
  const liste = Array.isArray(d.hedefler) ? d.hedefler : [];
  return {
    ...d,
    hedefler: liste.filter(
      (h): h is HedefKaydi =>
        Boolean(h) && typeof (h as HedefKaydi).id === "string" && typeof (h as HedefKaydi).ad === "string",
    ),
  };
}

/** Open goals by target date (undated last), then reached ones, latest first. */
export function hedefSirasi(a: HedefKaydi, b: HedefKaydi): number {
  if (Boolean(a.bitti) !== Boolean(b.bitti)) return a.bitti ? 1 : -1;
  if (a.bitti && b.bitti) return a.bitti < b.bitti ? 1 : a.bitti > b.bitti ? -1 : 0;
  const ta = a.hedefTarih ? hedefSonGunu(a.hedefTarih) : null;
  const tb = b.hedefTarih ? hedefSonGunu(b.hedefTarih) : null;
  if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
  if (ta !== tb) return ta ? -1 : 1;
  return a.ad.localeCompare(b.ad, "tr");
}
