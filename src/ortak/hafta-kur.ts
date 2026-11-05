// Explicit .ts extensions: this file also runs under plain Node (araclar/hafta-kur-test.mts).
import { AY_ADLARI, AY_TAM, GUN_ADLARI, gunEkle, gunFarki, haftaninGunu, yilAl } from "./gun.ts";
import type { Aliskanlik, Gun, Hafta, Siklik } from "./plan.ts";
import { siklikOku, type Kurallar } from "./ozet.ts";

/**
 * Opening the week Argos is in.
 *
 * `W<week>.json` used to be written only by the old app (`app.py`) and by the
 * `/haftalik-plan` skill. When neither had run, the week screen fell back to
 * the newest file it could find, so last month's habit ticks stayed on screen
 * as if they were this week's (issue #87).
 *
 * What is built here is a skeleton, not a plan: the seven days and the habits
 * from `kurallar.json` with no day ticked. Slots stay empty — laying them out
 * is what `/haftalik-plan` and the old app's "+ yeni hafta" do, and their
 * rules (capacity, protected hours, rotation) live there.
 *
 * The shape follows `plan_kur` in app.py field for field: both write the same
 * file, and a week opened here must be one the other can carry on with.
 */

/** The ISO week a date falls in. Week 1 is the one holding the first Thursday. */
export function isoWeek(iso: string): { year: number; week: number } {
  // The week's Thursday decides the year, and the weeks are counted from it.
  const thursday = gunEkle(iso, 3 - haftaninGunu(iso));
  const year = yilAl(thursday);
  return { year, week: Math.floor(gunFarki(thursday, `${year}-01-01`) / 7) + 1 };
}

/** The Monday of an ISO week. */
export function isoWeekMonday(year: number, week: number): string {
  const jan4 = `${year}-01-04`; // always in week 1
  return gunEkle(gunEkle(jan4, -haftaninGunu(jan4)), (week - 1) * 7);
}

/** `W45`, the name a week file and the week screen use. */
export const weekCode = (week: number): string => `W${week}`;

/** The seven days of an ISO week, as a week file stores them. */
export function weekDays(year: number, week: number): Gun[] {
  const monday = isoWeekMonday(year, week);
  return GUN_ADLARI.map((ad, i) => {
    const iso = gunEkle(monday, i);
    return {
      no: i + 1,
      ad,
      tarih: `${Number(iso.slice(8, 10))} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`,
      isoTarih: iso,
    };
  });
}

/**
 * `Hafta 45 · 2–8 Kasım 2026`, and `Hafta 40 · 28 Eylül–4 Ekim 2026` when the
 * week crosses a month. This is how the week files on disk read; app.py's
 * `plan_kur` names only the last month, which turns that W40 into
 * "28–4 Eki", so the files win over the function.
 */
export function weekTitle(week: number, year: number, days: Gun[]): string {
  const first = days[0]!.isoTarih;
  const last = days[days.length - 1]!.isoTarih;
  const day = (iso: string) => Number(iso.slice(8, 10));
  const month = (iso: string) => AY_TAM[Number(iso.slice(5, 7)) - 1];
  const aralik =
    month(first) === month(last)
      ? `${day(first)}–${day(last)} ${month(last)}`
      : `${day(first)} ${month(first)}–${day(last)} ${month(last)}`;
  return `Hafta ${week} · ${aralik} ${year}`;
}

/**
 * app.py `beklenen_gunler`. Which day numbers a habit is expected on, frozen
 * into the week file so a later change of the rule leaves past weeks alone.
 * `haftada` and `serbest` expect no particular day, so they answer null: the
 * grid then counts the week instead of dimming cells.
 */
export function expectedDays(siklik: Siklik, days: Gun[]): number[] | null {
  if (siklik.tip === "gunler") return siklik.gunler.filter((g) => days.some((d) => d.no === g));
  if (siklik.tip === "aralik") {
    return days
      .filter((d) => gunFarki(d.isoTarih, siklik.baslangic) % siklik.her === 0)
      .map((d) => d.no);
  }
  return null;
}

/** The habits of a fresh week: the rules' list, with nothing ticked yet. */
export function newHabits(kurallar: Kurallar, days: Gun[], today: string): Aliskanlik[] {
  return (kurallar.gunlukAliskanliklar ?? []).map((a) => {
    const siklik = siklikOku(a, today);
    return { ad: a.ad, siklik, beklenenGunler: expectedDays(siklik, days), gunler: {} };
  });
}

/**
 * A week file with its days and habits and nothing else. `ofisGunleri` and
 * `rotasyon` are left empty on purpose: they are asked for when the plan is
 * laid out, and guessing them here would put a wrong answer in the file.
 */
export function newWeek(year: number, week: number, kurallar: Kurallar, today: string): Hafta {
  const gunler = weekDays(year, week);
  return {
    hafta: week,
    yil: year,
    baslik: weekTitle(week, year, gunler),
    durum: "aktif",
    ofisGunleri: [],
    rotasyon: [],
    sosyalKota: { haftaSonu: false, haftaIci: false },
    gunler,
    kullanilmisIdler: [],
    slotlar: [],
    gunlukAliskanliklar: newHabits(kurallar, gunler, today),
    degisiklikGunlugu: [
      { tarih: today.slice(5), not: "Hafta Argos'ta açıldı — günlük ızgara boş başladı, slot kurulmadı." },
    ],
    kapanis: { tamamlanma: "", isYarayan: "", yaramayan: "", tasinan: "" },
    seanslar: [],
  };
}
