/**
 * Yüksek Lisans: goals, the study plan and the weekly effort (issue #57).
 * `node araclar/yuksek-lisans-test.mts`
 */

import {
  BOS_YL,
  araHedefEkle,
  araHedefSil,
  dersSil,
  eforDk,
  haftaBasi,
  haftaEforu,
  hedefDurumu,
  hedefSil,
  miktarMetni,
  normalizeYl,
  planEkle,
  planIsaretle,
  planSil,
  planTasi,
  type YlDosyasi,
} from "../src/ortak/yuksek-lisans.ts";

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

const bugun = "2026-10-18"; // Sunday
let d: YlDosyasi = {
  version: 1,
  dersler: [
    {
      id: "re",
      ad: "Requirements Engineering",
      renk: "#7c8cf8",
      hedefler: [
        { id: "saat", tur: "saat", ad: "Çalışma", miktar: 20 * 60, sonTarih: "2026-11-20" },
        { id: "kitap", tur: "sayfa", ad: "Software Requirements Engineering", miktar: 700, sonTarih: "2027-01-01", sayfaDk: 3 },
      ],
    },
    { id: "ml", ad: "Machine Learning", renk: "#4fb38a", hedefler: [{ id: "ml1", tur: "saat", ad: "Ödev", miktar: 300, sonTarih: "2026-10-25" }] },
  ],
  plan: {},
};

console.log("Units and wording");
eq("hours goal: effort is the minutes", eforDk(d.dersler[0]!.hedefler[0]!, 90), 90);
eq("book: pages × minutes per page", eforDk(d.dersler[0]!.hedefler[1]!, 40), 120);
eq("minutes as text", [miktarMetni("saat", 150), miktarMetni("saat", 45), miktarMetni("saat", 120)], ["2 sa 30 dk", "45 dk", "2 sa"]);
eq("pages as text", miktarMetni("sayfa", 40), "40 sayfa");

console.log("\nPlanning");
d = planEkle(d, "2026-10-19", { id: "p1", hedefId: "saat", miktar: 120 });
d = planEkle(d, "2026-10-20", { id: "p2", hedefId: "kitap", miktar: 40 });
d = planEkle(d, "2026-10-20", { id: "p3", hedefId: "ml1", miktar: 60 });
d = planEkle(d, "2026-10-27", { id: "p4", hedefId: "saat", miktar: 60 });
eq("an unknown goal is not planned", planEkle(d, "2026-10-21", { id: "x", hedefId: "yok", miktar: 10 }), d);
eq("a zero amount is not planned", planEkle(d, "2026-10-21", { id: "x", hedefId: "saat", miktar: 0 }), d);
d = planIsaretle(d, "2026-10-19", "p1", true);
const s = hedefDurumu(d, d.dersler[0]!.hedefler[0]!, bugun);
eq("goal: planned, done, not on the calendar yet", [s.planli, s.yapilan, s.plansiz], [180, 120, 1020]);
eq("goal: days left and a day's share", [s.kalanGun, s.gunluk], [34, 32]);
eq("a passed deadline: all that is left in one day", hedefDurumu(d, d.dersler[0]!.hedefler[0]!, "2026-12-01").gunluk, 1080);

console.log("\nCheckpoints (vize)");
let m = araHedefEkle(d, "saat", { id: "f", ad: "Final", tarih: "2026-11-18", miktar: 1080 });
m = araHedefEkle(m, "saat", { id: "v", ad: "Vize", tarih: "2026-10-30", miktar: 600 });
const mh = () => m.dersler[0]!.hedefler[0]!;
const ms = hedefDurumu(m, mh(), bugun);
eq("checkpoints kept in date order", mh().araHedefler!.map((a) => a.ad), ["Vize", "Final"]);
eq("next checkpoint and how it stands", [ms.siradakiAra?.ad, ms.siradakiAra?.planli, ms.siradakiAra?.yetisir], ["Vize", 180, false]);
eq("a day's share heads for the checkpoint first", ms.gunluk, Math.ceil((600 - 120) / 13));
eq("a goal without checkpoints is as before", [s.siradakiAra, s.gunluk], [null, 32]);
const q = araHedefEkle(d, "saat", { id: "k", ad: "Quiz", tarih: "2026-10-25", miktar: 100 });
eq("a reached checkpoint is skipped", hedefDurumu(q, q.dersler[0]!.hedefler[0]!, bugun).siradakiAra, null);
eq("removing the last checkpoint drops the field", "araHedefler" in araHedefSil(araHedefSil(m, "saat", "v"), "saat", "f").dersler[0]!.hedefler[0]!, false);
eq("checkpoints survive reading the file", normalizeYl(m).dersler[0]!.hedefler[0]!.araHedefler!.length, 2);

console.log("\nWeekly effort");
eq("Monday of the week", [haftaBasi("2026-10-18"), haftaBasi("2026-10-19"), haftaBasi("2026-10-25")], ["2026-10-12", "2026-10-19", "2026-10-19"]);
const h = haftaEforu(d, "2026-10-19");
eq("week total: hours + pages as effort", [h.planliDk, h.yapilanDk], [120 + 120 + 60, 120]);
eq("per course", h.dersler.map((x) => [x.ders.id, x.planliDk, x.yapilanDk]), [["re", 240, 120], ["ml", 60, 0]]);
eq("next week only has its own day", haftaEforu(d, "2026-10-26").planliDk, 60);
eq("an empty week", haftaEforu(d, "2026-10-12"), { planliDk: 0, yapilanDk: 0, dersler: [] });

console.log("\nEdits");
const tasindi = planTasi(d, "2026-10-20", "p2", "2026-10-22");
eq("move a day's item", [tasindi.plan["2026-10-20"]?.map((o) => o.id), tasindi.plan["2026-10-22"]?.map((o) => o.id)], [["p3"], ["p2"]]);
eq("removing the last item of a day removes the day", Object.keys(planSil(d, "2026-10-19", "p1").plan).includes("2026-10-19"), false);
eq("unticking drops the field", planIsaretle(d, "2026-10-19", "p1", false).plan["2026-10-19"]![0], { id: "p1", hedefId: "saat", miktar: 120 });
const hs = hedefSil(d, "re", "saat");
eq("removing a goal removes its days", [hs.dersler[0]!.hedefler.map((x) => x.id), Object.keys(hs.plan)], [["kitap"], ["2026-10-20"]]);
const ds = dersSil(d, "re");
eq("removing a course removes its goals' days", [ds.dersler.map((x) => x.id), Object.values(ds.plan).flat().map((o) => o.id)], [["ml"], ["p3"]]);

console.log("\nReading the file");
eq("no file", normalizeYl(null), BOS_YL);
eq(
  "broken entries dropped, a book without minutes per page gets the default",
  normalizeYl({
    dersler: [{ id: "a", ad: "A", hedefler: [{ id: "k", tur: "sayfa", ad: "K", miktar: 100, sonTarih: "2027-01-01" }, { id: "z", tur: "x" }] }, { ad: "kimliksiz" }],
    plan: { "2026-10-20": [{ id: "p", hedefId: "k", miktar: 10 }, { id: "q", hedefId: "yok", miktar: 5 }], bozuk: [] },
  }),
  {
    version: 1,
    dersler: [{ id: "a", ad: "A", renk: "#7c8cf8", hedefler: [{ id: "k", tur: "sayfa", ad: "K", miktar: 100, sonTarih: "2027-01-01", sayfaDk: 2 }] }],
    plan: { "2026-10-20": [{ id: "p", hedefId: "k", miktar: 10 }] },
  },
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
