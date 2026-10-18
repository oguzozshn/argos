/**
 * Subscriptions (issue #43): `node araclar/abonelik-test.mts`
 *
 * A subscription is a recurring rule marked `abonelik`, monthly or yearly.
 * The engine that writes due payments into the ledger is the Düzenli one;
 * these cases pin the yearly period and the totals.
 */

import { abonelikToplami, aylikKarsilik, sonrakiTekrar, tekSeferlik, vadesiGelenler } from "../src/ortak/duzenli.ts";
import type { Duzenli } from "../src/ortak/harcama.ts";

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

const kural = (over: Partial<Duzenli>): Duzenli => ({
  id: "k1", ad: "Claude", kategoriId: "c", tur: "gider", kurus: 20000, ayinGunu: 5, karsiTaraf: "", odeme: "kart",
  hesapId: null, baslangic: "2026-10-05", bitis: null, durdu: false, abonelik: true, ...over,
});

console.log("Monthly (unchanged engine)");
eq("next monthly payment", sonrakiTekrar(kural({}), "2026-10-18"), "2026-11-05");

console.log("\nYearly");
const yil = kural({ periyot: "yillik", ay: 3, ayinGunu: 14, baslangic: "2027-03-14", kurus: 120000 });
eq("before the first payment: on its day", sonrakiTekrar(yil, "2026-10-18"), "2027-03-14");
eq("after it: a year later", sonrakiTekrar(yil, "2027-03-15"), "2028-03-14");
eq("on the day itself", sonrakiTekrar(yil, "2028-03-14"), "2028-03-14");
const subat = kural({ periyot: "yillik", ay: 2, ayinGunu: 29, baslangic: "2028-02-29" });
eq("Feb 29 falls on Feb 28 in a common year", sonrakiTekrar(subat, "2028-03-01"), "2029-02-28");
eq("ended rule: none after its end", sonrakiTekrar(kural({ periyot: "yillik", ay: 3, ayinGunu: 14, baslangic: "2027-03-14", bitis: "2027-12-31" }), "2027-03-15"), null);
eq("yearly with an end before the second year is one-off", tekSeferlik(kural({ periyot: "yillik", ay: 3, ayinGunu: 14, baslangic: "2027-03-14", bitis: "2027-06-01" })), true);
eq("yearly, open-ended: not one-off", tekSeferlik(yil), false);
const posted = vadesiGelenler([kural({ periyot: "yillik", ay: 1, ayinGunu: 10, baslangic: "2025-01-10" })], [], "2026-10-18");
eq("ledger gets one entry per year, not per month", posted.map((p) => p.tarih), ["2025-01-10", "2026-01-10"]);
eq("entry carries the subscription's name and rule", [posted[0]!.not, posted[0]!.duzenliId, posted[0]!.kurus], ["Claude", "k1", 20000]);

console.log("\nTotals");
eq("monthly equivalent of a yearly price", aylikKarsilik(yil), 10000);
const all = [
  kural({ id: "a", kurus: 20000 }),
  kural({ id: "b", periyot: "yillik", ay: 3, ayinGunu: 14, baslangic: "2027-03-14", kurus: 120000 }),
  kural({ id: "c", kurus: 5000, durdu: true }),
  kural({ id: "d", kurus: 7000, bitis: "2026-09-30", baslangic: "2026-01-05" }),
  kural({ id: "e", kurus: 99900, abonelik: false }),
];
eq("only running subscriptions count; yearly spread over twelve", abonelikToplami(all, "2026-10-18"), { aylik: 30000, yillik: 360000, adet: 2 });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
