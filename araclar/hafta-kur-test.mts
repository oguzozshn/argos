/**
 * Opening a week (issue #87): `node araclar/hafta-kur-test.mts`
 *
 * The ISO week numbers are checked against `date +"%G-%V"`, which is the rule
 * the assistant's CLAUDE.md names, and the skeleton against `plan_kur` in
 * app.py: both write `W<week>.json`, so the two must agree field for field.
 */

import {
  expectedDays,
  isoWeek,
  isoWeekMonday,
  newWeek,
  weekCode,
  weekDays,
  weekTitle,
} from "../src/ortak/hafta-kur.ts";

let passed = 0;
let failed = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
  }
}

/* --- ISO hafta ----------------------------------------------------------- */

eq("W40 başlangıcı", isoWeek("2026-09-28"), { year: 2026, week: 40 });
eq("W40 sonu", isoWeek("2026-10-04"), { year: 2026, week: 40 });
eq("hafta pazartesi başlar: bir gün sonrası W41", isoWeek("2026-10-05"), { year: 2026, week: 41 });
eq("yılın ilk günü önceki yılın haftası olabilir", isoWeek("2027-01-01"), { year: 2026, week: 53 });
eq("yıl sonu sonraki yılın 1. haftası olabilir", isoWeek("2024-12-30"), { year: 2025, week: 1 });
eq("4 Ocak her zaman 1. haftadadır", isoWeek("2026-01-04"), { year: 2026, week: 1 });
eq("53 haftalı yıl", isoWeek("2026-12-31"), { year: 2026, week: 53 });

eq("W40 pazartesi", isoWeekMonday(2026, 40), "2026-09-28");
eq("1. haftanın pazartesi", isoWeekMonday(2026, 1), "2025-12-29");
eq("kod", weekCode(45), "W45");

/* --- günler -------------------------------------------------------------- */

const gunler = weekDays(2026, 40);
eq("yedi gün", gunler.length, 7);
eq("ilk gün", gunler[0], { no: 1, ad: "Pazartesi", tarih: "28 Eyl", isoTarih: "2026-09-28" });
eq("son gün", gunler[6], { no: 7, ad: "Pazar", tarih: "4 Eki", isoTarih: "2026-10-04" });
eq("ay aşan haftanın başlığı", weekTitle(40, 2026, gunler), "Hafta 40 · 28 Eylül–4 Ekim 2026");

/* --- beklenen günler (app.py `beklenen_gunler`) --------------------------- */

eq("her gün", expectedDays({ tip: "gunler", gunler: [1, 2, 3, 4, 5, 6, 7] }, gunler), [1, 2, 3, 4, 5, 6, 7]);
eq("seçili günler", expectedDays({ tip: "gunler", gunler: [1, 3, 5] }, gunler), [1, 3, 5]);
eq(
  "iki günde bir, W40'ta 1-3-5-7",
  expectedDays({ tip: "aralik", her: 2, baslangic: "2026-08-11" }, gunler),
  [1, 3, 5, 7],
);
eq("serbestin beklediği gün yok", expectedDays({ tip: "serbest" }, gunler), null);
eq("haftada N'nin beklediği gün yok", expectedDays({ tip: "haftada", adet: 2 }, gunler), null);

/* --- yeni hafta ---------------------------------------------------------- */

const kurallar = {
  gunlukAliskanliklar: [
    { ad: "Esneme — sabah", gunler: [1, 2, 3, 4, 5, 6, 7] },
    { ad: "Koşu", siklik: { tip: "aralik", her: 2, baslangic: "2026-08-11" } },
    { ad: "İngilizce — konuşma", siklik: { tip: "serbest" } },
  ],
};

const w = newWeek(2026, 45, kurallar, "2026-11-05");
eq("hafta ve yıl", [w.hafta, w.yil], [45, 2026]);
eq("tek aylık haftanın başlığı", w.baslik, "Hafta 45 · 2–8 Kasım 2026");
eq("durum aktif", w.durum, "aktif");
eq("ilk gün", w.gunler[0]!.isoTarih, "2026-11-02");
eq("slot kurulmaz", w.slotlar, []);
eq("ofis günü tahmin edilmez", w.ofisGunleri, []);
eq("rotasyon tahmin edilmez", w.rotasyon, []);
eq("seans yok", w.seanslar, []);
eq("alışkanlık sayısı", (w.gunlukAliskanliklar ?? []).length, 3);
eq(
  "her günkü alışkanlık",
  w.gunlukAliskanliklar![0],
  {
    ad: "Esneme — sabah",
    siklik: { tip: "gunler", gunler: [1, 2, 3, 4, 5, 6, 7] },
    beklenenGunler: [1, 2, 3, 4, 5, 6, 7],
    gunler: {},
  },
);
eq("aralıklı alışkanlığın beklenen günleri donar", w.gunlukAliskanliklar![1]!.beklenenGunler, [2, 4, 6]);
eq("serbest alışkanlığın beklenen günü null", w.gunlukAliskanliklar![2]!.beklenenGunler, null);
eq(
  "hiçbir gün işaretli değil",
  (w.gunlukAliskanliklar ?? []).every((a) => Object.keys(a.gunler ?? {}).length === 0),
  true,
);
eq("değişiklik günlüğü tek satır", (w.degisiklikGunlugu ?? []).length, 1);
eq("günlük tarihi MM-DD", w.degisiklikGunlugu![0]!.tarih, "11-05");
eq("kapanış boş", w.kapanis, { tamamlanma: "", isYarayan: "", yaramayan: "", tasinan: "" });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
