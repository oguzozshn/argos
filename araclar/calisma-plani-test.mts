/**
 * Planlar: hour plans, sub-plans, automatic planning (issue #73).
 * `node araclar/calisma-plani-test.mts`
 */

import {
  BOS_CP,
  altEkle,
  altSil,
  anaPayDk,
  altlarTasiyor,
  ceyrek,
  eforu,
  gerekenGunluk,
  haftaBasi,
  normalizeCp,
  otomatikPlanla,
  oturumEkle,
  oturumIsaretle,
  oturumKismen,
  planDurumu,
  planEkle,
  planSil,
  tumEtiketler,
  ylDenTasi,
  type CalismaPlani,
  type CpDosyasi,
} from "../src/ortak/calisma-plani.ts";

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

let n = 0;
const id = () => `o${n++}`;
const bugun = "2026-10-19"; // Monday
const sa = (h: number) => h * 60;

// The issue's example: A dersi 25 saat; Vize 20 Kasım 10 saat; Final 20 Aralık 10 saat; 5 saat extra.
const ders: CalismaPlani = {
  id: "a",
  ad: "A dersi",
  tur: "ders",
  renk: "#7c8cf8",
  hedefDk: sa(25),
  sonTarih: "2026-12-20",
  haftalikDk: sa(6),
  gunler: [0, 2, 4], // Pzt Çar Cum
  altlar: [
    { id: "final", ad: "Final", hedefDk: sa(10), sonTarih: "2026-12-20" },
    { id: "vize", ad: "Vize", hedefDk: sa(10), sonTarih: "2026-11-20" },
  ],
};
let d: CpDosyasi = planEkle(BOS_CP, ders);

console.log("Plan and sub-plans");
eq("the plan's own share: what sub-plans leave", anaPayDk(ders), sa(5));
eq("sub-plans not over the total", altlarTasiyor(ders), false);
eq("over the total is noticed", altlarTasiyor({ ...ders, hedefDk: sa(15) }), true);
const bos = planDurumu(d, ders, bugun);
eq("parts: sub-plans by deadline, then the extra work", bos.parcalar.map((x) => [x.ad, x.hedefDk / 60, x.sonTarih ?? null]), [
  ["Vize", 10, "2026-11-20"],
  ["Final", 10, "2026-12-20"],
  ["Ekstra çalışma", 5, "2026-12-20"],
]);
eq("a plan without sub-plans is one part with its own name", planDurumu(d, { ...ders, altlar: [] }, bugun).parcalar.map((x) => [x.ad, x.hedefDk / 60]), [["A dersi", 25]]);

console.log("\nSessions to the plan or a sub-plan");
d = oturumEkle(d, "2026-10-20", { id: "m1", planId: "a", dk: 90 });
d = oturumEkle(d, "2026-10-21", { id: "m2", planId: "a", altId: "vize", dk: 120 });
d = oturumIsaretle(d, "2026-10-21", "m2", true);
d = oturumEkle(d, "2026-11-25", { id: "m3", planId: "a", altId: "vize", dk: 60 });
const s1 = planDurumu(d, ders, bugun);
const vize = s1.parcalar[0]!;
eq("sub-plan: planned, done, in time, missing", [vize.planliDk, vize.yapilanDk, vize.zamanindaDk, vize.eksikDk, vize.yetisir], [180, 120, 120, 420, false]);
eq("extra work counts sessions on the plan itself", s1.parcalar[2]!.planliDk, 90);
eq("plan totals", [s1.planliDk, s1.yapilanDk, s1.eksikDk], [270, 120, sa(25) - 270]);
eq("an unknown plan is not planned", oturumEkle(d, "2026-10-22", { id: "x", planId: "yok", dk: 30 }), d);

console.log("\nWeekly effort");
eq("Monday of the week", haftaBasi("2026-10-25"), "2026-10-19");
const h = eforu(d, "2026-10-19");
eq("week total and per plan", [h.planliDk, h.yapilanDk, h.planlar.map((x) => [x.plan.id, x.planliDk])], [210, 120, [["a", 210]]]);
eq("a single day", eforu(d, "2026-10-20", 1).planliDk, 90);

console.log("\nAutomatic planning");
eq("a quarter-hour step", [ceyrek(118), ceyrek(130)], [120, 135]);
const temiz = planEkle(BOS_CP, ders);
const { dosya: oto, rapor } = otomatikPlanla(temiz, "a", bugun, id);
const gunler = Object.keys(oto.takvim).sort();
eq("only on the chosen weekdays", [...new Set(gunler.map((g) => new Date(g + "T00:00:00Z").getUTCDay()))].sort(), [1, 3, 5]);
eq("a day's share: weekly hours / days", oto.takvim["2026-10-19"]!.map((o) => o.dk), [120]);
const tumu = Object.entries(oto.takvim).flatMap(([g, l]) => l.map((o) => ({ g, ...o })));
eq("all 25 hours placed", rapor.eklenenDk, sa(25));
eq("Vize first: all its hours before 20 Kasım", tumu.filter((o) => o.altId === "vize").every((o) => o.g <= "2026-11-20"), true);
eq("Vize filled before Final starts", tumu.filter((o) => o.altId === "vize").map((o) => o.g).sort().at(-1)! <= tumu.filter((o) => o.altId === "final").map((o) => o.g).sort()[0]!, true);
eq("extra work last", tumu.filter((o) => !o.altId).map((o) => o.g).sort()[0]! >= tumu.filter((o) => o.altId === "final").map((o) => o.g).sort()[0]!, true);
const haftalik = new Map<string, number>();
for (const o of tumu) haftalik.set(haftaBasi(o.g), (haftalik.get(haftaBasi(o.g)) ?? 0) + o.dk);
eq("never more than the weekly hours", [...haftalik.values()].every((dk) => dk <= sa(6)), true);
eq("nothing missing", rapor.yetismeyen, []);
eq("sessions are marked as placed by the planning", tumu.every((o) => o.oto), true);

const sikisik = planEkle(BOS_CP, { ...ders, haftalikDk: sa(2), gunler: [0] });
const r2 = otomatikPlanla(sikisik, "a", bugun, id).rapor;
// 2 h on Mondays: five Mondays fill Vize's 10 h by 20 Kasım, four more give Final 8 of its 10 h.
eq("too little time: what does not fit is reported", r2.yetismeyen.map((x) => [x.ad, x.eksikDk / 60]), [["Final", 2], ["Ekstra çalışma", 5]]);

// A session placed by hand and a done one stay; planning again takes back only its own undone ones.
let el = oturumEkle(oto, "2026-10-19", { id: "el", planId: "a", altId: "vize", dk: 60 });
el = oturumIsaretle(el, "2026-10-21", oto.takvim["2026-10-21"]![0]!.id, true);
const tekrar = otomatikPlanla(el, "a", bugun, id).dosya;
eq("planning again keeps hand-placed and done sessions", [tekrar.takvim["2026-10-19"]!.some((o) => o.id === "el"), tekrar.takvim["2026-10-21"]!.some((o) => o.yapildi)], [true, true]);
eq("planning again: still 25 hours in all", Object.values(tekrar.takvim).flat().reduce((t, o) => t + o.dk, 0), sa(25));
eq("the hand-placed hour fills the day's share", tekrar.takvim["2026-10-19"]!.reduce((t, o) => t + o.dk, 0), 120);
eq("past sessions are not taken back", otomatikPlanla(oto, "a", "2026-11-02", id).dosya.takvim["2026-10-19"]?.length, 1);

console.log("\nPlanning by the deadline (no weekly hours)");
// The user's case: 150 h by 18 Aralık, every day: 61 days → 150 h / 61 ≈ 2 sa 27 dk → 2 sa 30 dk a day.
const tek: CalismaPlani = { id: "sre", ad: "SRE", tur: "ders", renk: "#7c8cf8", hedefDk: sa(150), sonTarih: "2026-12-18", haftalikDk: 0, gunler: [], altlar: [] };
const tekD = planEkle(BOS_CP, tek);
eq("a day's share worked out from the deadline", gerekenGunluk(tekD, tek, bugun), 150);
const r3 = otomatikPlanla(tekD, "sre", bugun, id);
eq("planned over every day, all of it, nothing missing", [r3.rapor.hesaplandi, r3.rapor.gunlukDk, r3.rapor.eklenenDk / 60, r3.rapor.yetismeyen, Object.keys(r3.dosya.takvim).length], [true, 150, 150, [], 60]);
eq("weekdays only: a bigger share", gerekenGunluk(tekD, { ...tek, gunler: [0, 1, 2, 3, 4] }, bugun), 210);
// Each deadline is checked: Vize 10 h in 33 days needs 18 dk a day, all 25 h in 63 days 24 dk; the tighter one, rounded up, is the pace.
eq("the tightest deadline sets the pace", gerekenGunluk(planEkle(BOS_CP, { ...ders, haftalikDk: 0, gunler: [] }), { ...ders, haftalikDk: 0, gunler: [] }, bugun), 30);
const r4 = otomatikPlanla(planEkle(BOS_CP, { ...ders, haftalikDk: 0, gunler: [] }), "a", bugun, id).rapor;
eq("…and every part fits", [r4.eklenenDk / 60, r4.yetismeyen], [25, []]);
eq("no weekly hours and no deadline: nothing to plan by", otomatikPlanla(planEkle(BOS_CP, { ...tek, sonTarih: undefined }), "sre", bugun, id).rapor.ayarYok, true);
eq("its own planned sessions do not count: planning again gives the same share", gerekenGunluk(r3.dosya, tek, bugun), 150);

console.log("\nEdits");
const altsiz = altSil(d, "a", "vize");
eq("removing a sub-plan: done sessions go to the plan, the rest go", [altsiz.takvim["2026-10-21"]?.[0], altsiz.takvim["2026-11-25"]], [{ id: "m2", planId: "a", dk: 120, yapildi: true }, undefined]);
eq("…and the sub-plan is gone", altsiz.planlar[0]!.altlar.map((a) => a.id), ["final"]);
eq("add a sub-plan", altEkle(d, "a", { id: "odev", ad: "Ödev", hedefDk: 120 }).planlar[0]!.altlar.length, 3);
eq("removing a plan removes its sessions", [planSil(d, "a").planlar.length, Object.keys(planSil(d, "a").takvim).length], [0, 0]);

console.log("\nReading the file");
eq("no file", normalizeCp(null), BOS_CP);
eq(
  "broken entries dropped",
  normalizeCp({
    planlar: [{ id: "p", ad: "P", tur: "x", hedefDk: 60, gunler: [0, 9, 0], altlar: [{ id: "s", ad: "S", hedefDk: 30, sonTarih: "yarın" }] }],
    takvim: { "2026-10-20": [{ id: "o", planId: "p", altId: "s", dk: 30 }, { id: "q", planId: "p", altId: "yok", dk: 30 }], bozuk: [] },
  }),
  {
    version: 1,
    planlar: [{ id: "p", ad: "P", tur: "diger", renk: "#7c8cf8", hedefDk: 60, haftalikDk: 0, gunler: [0], altlar: [{ id: "s", ad: "S", hedefDk: 30 }] }],
    takvim: { "2026-10-20": [{ id: "o", planId: "p", altId: "s", dk: 30 }] },
  },
);

console.log("\nCarrying Yüksek Lisans over");
// The real file's shape: one course, one 20 h goal, one session.
const yl = {
  version: 1,
  dersler: [{ id: "d1", ad: "Software Requirements Engineering", renk: "#7c8cf8", hedefler: [{ id: "h1", tur: "saat", ad: "Çalışma", miktar: 1200, sonTarih: "2026-11-17" }] }],
  plan: { "2026-10-18": [{ id: "p1", hedefId: "h1", miktar: 45 }] },
};
const t1 = ylDenTasi(yl);
eq("a course with one goal: a ders plan with that total", t1.planlar.map((p) => [p.ad, p.tur, p.hedefDk, p.sonTarih, p.altlar.length]), [["Software Requirements Engineering", "ders", 1200, "2026-11-17", 0]]);
eq("its sessions go to the plan itself", t1.takvim, { "2026-10-18": [{ id: "p1", planId: "d1", dk: 45 }] });
const t2 = ylDenTasi({
  dersler: [
    {
      id: "d",
      ad: "D",
      hedefler: [{ id: "h", tur: "saat", miktar: 1500, sonTarih: "2026-12-20", araHedefler: [{ id: "v", ad: "Vize", tarih: "2026-11-20", miktar: 600 }, { id: "f", ad: "Final", tarih: "2026-12-20", miktar: 1200 }] }],
    },
  ],
});
eq("checkpoints become sub-plans of the part between them", t2.planlar[0]!.altlar.map((a) => [a.ad, a.hedefDk, a.sonTarih]), [["Vize", 600, "2026-11-20"], ["Final", 600, "2026-12-20"]]);
const t3 = ylDenTasi({
  dersler: [{ id: "d", ad: "D", hedefler: [{ id: "s", tur: "saat", ad: "Çalışma", miktar: 600, sonTarih: "2026-11-01" }, { id: "k", tur: "sayfa", ad: "Kitap", miktar: 100, sonTarih: "2027-01-01", sayfaDk: 3 }] }],
  plan: { "2026-10-20": [{ id: "x", hedefId: "k", miktar: 20, yapildi: true }] },
});
eq("several goals: sub-plans, pages as minutes", t3.planlar[0]!.altlar.map((a) => [a.ad, a.hedefDk]), [["Çalışma", 600], ["Kitap", 300]]);
eq("…and the total is their sum", t3.planlar[0]!.hedefDk, 900);
eq("a book session in minutes, on its sub-plan", t3.takvim["2026-10-20"], [{ id: "x", planId: "d", altId: "k", dk: 60, yapildi: true }]);
eq("no old file: nothing", ylDenTasi(null), BOS_CP);

// Hours day by day: Pzt 1 sa, Cmt 2 sa, Paz 2 sa until the goal is met.
{
  const p: CalismaPlani = { id: "g", ad: "Gün gün", tur: "ders", renk: "#000", hedefDk: sa(10), haftalikDk: 0, gunler: [], gunDk: [60, 0, 0, 0, 0, 120, 120], altlar: [] };
  const n1 = normalizeCp(planEkle(BOS_CP, p));
  eq("gunDk survives normalize", n1.planlar[0]!.gunDk, [60, 0, 0, 0, 0, 120, 120]);
  eq("all-zero gunDk dropped", normalizeCp({ planlar: [{ ...p, gunDk: [0, 0, 0, 0, 0, 0, 0] }] }).planlar[0]!.gunDk, undefined);
  const { dosya, rapor } = otomatikPlanla(n1, "g", bugun, id);
  eq("gunDk: all 10 h planned", rapor.eklenenDk, sa(10));
  const gunler = Object.entries(dosya.takvim).sort().map(([g, l]) => [g, l.reduce((t, o) => t + o.dk, 0)]);
  eq("gunDk: Mon 1 h, Sat 2 h, Sun 2 h, repeated", gunler, [
    ["2026-10-19", 60], ["2026-10-24", 120], ["2026-10-25", 120],
    ["2026-10-26", 60], ["2026-10-31", 120], ["2026-11-01", 120],
  ]);
}

// Part of a session done: 1.5 of 2 h counts as done, half an hour goes back to planning.
{
  const p: CalismaPlani = { id: "k", ad: "Kısmi", tur: "ders", renk: "#000", hedefDk: sa(4), haftalikDk: 0, gunler: [], altlar: [] };
  let k = oturumEkle(planEkle(BOS_CP, p), "2026-10-19", { id: "s", planId: "k", dk: sa(2) });
  k = oturumKismen(k, "2026-10-19", "s", 90);
  eq("part: what was done stays, with what was set", k.takvim["2026-10-19"], [{ id: "s", planId: "k", dk: 90, yapildi: true, planlananDk: 120 }]);
  eq("part: done 1.5 h, 2.5 h left to plan", [planDurumu(k, p, bugun).yapilanDk, planDurumu(k, p, bugun).eksikDk], [90, 150]);
  eq("part survives normalize", normalizeCp(k).takvim["2026-10-19"], k.takvim["2026-10-19"]);
  eq("unticking brings the whole session back", oturumIsaretle(k, "2026-10-19", "s", false).takvim["2026-10-19"], [{ id: "s", planId: "k", dk: 120 }]);
  eq("ticking marks all of it done", oturumIsaretle(k, "2026-10-19", "s", true).takvim["2026-10-19"], [{ id: "s", planId: "k", dk: 120, yapildi: true }]);
}

// A start date: nothing is planned before it (issue #79).
{
  const p: CalismaPlani = { id: "b", ad: "Baş", tur: "ders", renk: "#000", hedefDk: sa(3), baslangic: "2026-11-02", haftalikDk: sa(7), gunler: [], altlar: [] };
  const n1 = normalizeCp(planEkle(BOS_CP, p));
  eq("baslangic survives normalize", n1.planlar[0]!.baslangic, "2026-11-02");
  const gunler = Object.keys(otomatikPlanla(n1, "b", bugun, id).dosya.takvim).sort();
  eq("planned from the start date on", gunler, ["2026-11-02", "2026-11-03", "2026-11-04"]);
}

// Tags: kept trimmed and lower case, once each; listed across plans.
{
  const n1 = normalizeCp({ planlar: [{ id: "e", ad: "E", hedefDk: 60, etiketler: [" #Okul", "okul", "Dönem-1", "", 3] }, { id: "f", ad: "F", hedefDk: 60, etiketler: [] }] });
  eq("tags cleaned", n1.planlar[0]!.etiketler, ["okul", "dönem-1"]);
  eq("no tags: no field", n1.planlar[1]!.etiketler, undefined);
  eq("all tags", tumEtiketler(n1), ["dönem-1", "okul"]);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
