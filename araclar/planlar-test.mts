/**
 * Planlar: plans and sub-plans as a tree (issue #69).
 * `node araclar/planlar-test.mts`
 */

import {
  BOS_PLANLAR,
  altEkle,
  bittiMi,
  dugumGuncelle,
  dugumSil,
  geriKoy,
  ilerleme,
  isaretle,
  konum,
  normalizePlanlar,
  planEkle,
  siradaki,
  tasi,
  type PlanDosyasi,
  type PlanDugumu,
} from "../src/ortak/planlar.ts";

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

const n = (id: string, altlar: PlanDugumu[] = []): PlanDugumu => ({ id, ad: id.toUpperCase(), altlar });
const bul = (d: PlanDosyasi, id: string): PlanDugumu | undefined => {
  const ara = (l: PlanDugumu[]): PlanDugumu | undefined => {
    for (const x of l) {
      if (x.id === id) return x;
      const y = ara(x.altlar);
      if (y) return y;
    }
  };
  return ara(d.planlar);
};
const ids = (l: PlanDugumu[]) => l.map((x) => x.id).join("");

let d = planEkle(BOS_PLANLAR, n("t"));
d = altEkle(d, "t", n("a"));
d = altEkle(d, "t", n("b"));
d = altEkle(d, "a", n("x"));
d = altEkle(d, "a", n("y"));
// t: a(x, y), b

console.log("Tree");
eq("sub-plans nest", [ids(d.planlar[0]!.altlar), ids(bul(d, "a")!.altlar)], ["ab", "xy"]);
eq("progress counts the steps (leaves)", ilerleme(d.planlar[0]!), { biten: 0, toplam: 3 });
d = isaretle(d, "x", true);
eq("ticking a step", [ilerleme(d.planlar[0]!), ilerleme(bul(d, "a")!)], [{ biten: 1, toplam: 3 }, { biten: 1, toplam: 2 }]);
eq("next step: the first open one in order", siradaki(d.planlar[0]!)?.id, "y");
d = isaretle(d, "a", true);
eq("ticking a branch ticks every step under it", [bul(d, "x")?.bitti, bul(d, "y")?.bitti, bittiMi(bul(d, "a")!)], [true, true, true]);
eq("the branch itself keeps no tick of its own", "bitti" in bul(d, "a")!, false);
eq("not done until every step is", bittiMi(d.planlar[0]!), false);
d = isaretle(d, "b", true);
eq("all steps done: the plan is done", [bittiMi(d.planlar[0]!), siradaki(d.planlar[0]!)], [true, null]);
d = isaretle(d, "y", false);
eq("unticking drops the field", "bitti" in bul(d, "y")!, false);
eq("adding under a folded node unfolds it", bul(altEkle(dugumGuncelle(d, "b", { kapali: true }), "b", n("z")), "b")?.kapali, undefined);
eq("a step that gets a sub-plan becomes a branch: its progress is the sub-plan's", ilerleme(bul(altEkle(d, "b", n("z")), "b")!), { biten: 0, toplam: 1 });

console.log("\nEdits");
eq("rename, date, note", (({ ad, tarih, not }) => ({ ad, tarih, not }))(bul(dugumGuncelle(d, "y", { ad: "Y2", tarih: "2026-11-01", not: "n" }), "y")!), {
  ad: "Y2",
  tarih: "2026-11-01",
  not: "n",
});
eq("an emptied date is removed", "tarih" in bul(dugumGuncelle(dugumGuncelle(d, "y", { tarih: "2026-11-01" }), "y", { tarih: "" }), "y")!, false);
eq("move down among siblings", ids(bul(tasi(d, "x", 1), "a")!.altlar), "yx");
eq("move past the end: unchanged", ids(bul(tasi(d, "y", 1), "a")!.altlar), "xy");
eq("move a top plan", ids(tasi(planEkle(d, n("u")), "u", -1).planlar), "ut");
const k = konum(d, "y")!;
eq("where a node sits", k, { ustId: "a", sira: 1 });
const silindi = dugumSil(d, "a");
eq("delete a branch with its sub-plans", [ids(silindi.planlar[0]!.altlar), bul(silindi, "x")], ["b", undefined]);
const y = bul(d, "y")!;
eq("undo puts it back in its place", ids(bul(geriKoy(dugumSil(d, "y"), y, k), "a")!.altlar), "xy");
eq("undo of a top plan", ids(geriKoy(dugumSil(planEkle(d, n("u")), "t"), d.planlar[0]!, { ustId: null, sira: 0 }).planlar), "tu");

console.log("\nReading the file");
eq("no file", normalizePlanlar(null), BOS_PLANLAR);
eq(
  "broken nodes dropped, bad dates left out",
  normalizePlanlar({ planlar: [{ id: "p", ad: "P", tarih: "yarın", altlar: [{ id: "c", ad: "C", bitti: true }, { ad: "kimliksiz" }] }, 5] }),
  { version: 1, planlar: [{ id: "p", ad: "P", altlar: [{ id: "c", ad: "C", bitti: true, altlar: [] }] }] },
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
