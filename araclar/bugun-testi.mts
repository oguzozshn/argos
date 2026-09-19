/**
 * Bugün panosunun hafta işlemleri: `node araclar/bugun-testi.mts`
 */

import {
  aliskanlikBekleniyor,
  aliskanlikCevir,
  simdiVeSiradaki,
  slotDurumunuDondur,
  sonrakiDurum,
} from "../src/ortak/plan-islem.ts";
import type { Hafta, Slot } from "../src/ortak/plan.ts";

let gecen = 0;
let kalan = 0;
function kontrol(ad: string, kosul: unknown, ek = ""): void {
  if (kosul) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}${ek ? " — " + ek : ""}`);
  }
}

const slot = (id: string, saat: string, sureDk: number, durum = "planli"): Slot => ({
  id, gun: 6, saat, sureDk, alan: "Tez", konu: id, durum,
});

console.log("\ndurum döngüsü");
kontrol("planli → yapildi → kacti → planli", sonrakiDurum("planli") === "yapildi" && sonrakiDurum("yapildi") === "kacti" && sonrakiDurum("kacti") === "planli");
kontrol("tasindi tıklanınca plana döner", sonrakiDurum("tasindi") === "planli");
kontrol("bilinmeyen durum plana döner", sonrakiDurum("garip") === "planli");

const h: Hafta = {
  hafta: 38, yil: 2026, baslik: "", gunler: [],
  slotlar: [slot("a", "09:00", 60), slot("b", "14:00", 90)],
  gunlukAliskanliklar: [{ ad: "Okuma", gunler: { "6": true } }, { ad: "Koşu", beklenenGunler: [1, 3] }],
};
const h2 = slotDurumunuDondur(h, "b");
kontrol("yalnız hedef slot değişir", h2.slotlar[1]!.durum === "yapildi" && h2.slotlar[0]!.durum === "planli");
kontrol("asıl nesne değişmez", h.slotlar[1]!.durum === "planli");

console.log("\nalışkanlık");
kontrol("beklenenGunler yoksa her gün", aliskanlikBekleniyor({}, 6) && aliskanlikBekleniyor({ beklenenGunler: null }, 2));
kontrol("beklenenGunler varsa yalnız o günler", aliskanlikBekleniyor({ beklenenGunler: [1, 3] }, 3) && !aliskanlikBekleniyor({ beklenenGunler: [1, 3] }, 6));
const h3 = aliskanlikCevir(h, "Okuma", 6);
kontrol("işaret kalkınca anahtar silinir", !("6" in (h3.gunlukAliskanliklar![0]!.gunler ?? {})));
const h4 = aliskanlikCevir(h3, "Okuma", 6);
kontrol("yeniden işaretlenir", (h4.gunlukAliskanliklar![0]!.gunler as Record<string, unknown>)["6"] === true);
kontrol("diğer alışkanlığa dokunulmaz", h4.gunlukAliskanliklar![1] === h.gunlukAliskanliklar![1]);

console.log("\nşimdi / sıradaki");
const gun = [slot("sabah", "09:00", 60), slot("yapilmis", "10:30", 60, "yapildi"), slot("ogle", "13:00", 90), slot("aksam", "19:00", 60)];
const s1 = simdiVeSiradaki(gun, 9 * 60 + 20);
kontrol("09:20 → şimdi sabah, sıradaki öğle (yapılmış atlanır)", s1.simdi?.id === "sabah" && s1.siradaki?.id === "ogle");
const s2 = simdiVeSiradaki(gun, 10 * 60 + 45);
kontrol("10:45 → şimdi yok (yapılmış slot sayılmaz)", s2.simdi === null && s2.siradaki?.id === "ogle");
const s3 = simdiVeSiradaki(gun, 10 * 60);
kontrol("bitiş anı slotun dışında", s3.simdi === null);
const s4 = simdiVeSiradaki(gun, 21 * 60);
kontrol("gün bitti → ikisi de yok", s4.simdi === null && s4.siradaki === null);
kontrol("sırasız verilse de saate göre", simdiVeSiradaki([slot("x", "18:00", 30), slot("y", "08:00", 30)], 7 * 60).siradaki?.id === "y");

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
