/**
 * Takvimde slot ekleme ve yerleştirme: `node araclar/takvim-testi.mts`
 */

import { kuralSetiTamamla } from "../src/ortak/kural.ts";
import { slotEkle, slotuYerlestir } from "../src/ortak/plan-islem.ts";
import type { Hafta } from "../src/ortak/plan.ts";

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

const K = kuralSetiTamamla({ alanlar: ["Tez", "Spor"], kapasite: { ofisGunuMaxSlot: 1, evGunuMaxSlot: 2, haftaSonuMaxSlot: 3, haftalikHedefDk: 600, haftalikUstSinirDk: 900 } });
const hafta = (): Hafta => ({
  hafta: 38, yil: 2026, baslik: "",
  gunler: [1, 2, 3, 4, 5, 6, 7].map((no) => ({ no, ad: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"][no - 1]!, tarih: "", isoTarih: `2026-09-${13 + no}` })),
  slotlar: [
    { id: "W38-D2-19", gun: 2, saat: "19:00", sureDk: 90, alan: "Tez", konu: "a", durum: "planli" },
    { id: "W38-D3-19", gun: 3, saat: "19:00", sureDk: 60, alan: "Tez", konu: "b", durum: "planli" },
    { id: "W38-D3-20", gun: 3, saat: "20:30", sureDk: 60, alan: "Spor", konu: "c", durum: "planli" },
    { id: "W38-D4-19", gun: 4, saat: "19:00", sureDk: 60, alan: "Tez", konu: "t", durum: "tasindi" },
  ],
  kullanilmisIdler: ["W38-D2-19", "W38-D3-19", "W38-D3-20", "W38-D4-19", "W38-D5-09"],
});

console.log("\nekleme");
const e1 = slotEkle(hafta(), 2, K);
kontrol("son slottan sonraki tam saat (19:00+90+15 → 20)", e1.hafta.slotlar.at(-1)!.saat === "20:00");
kontrol("kimlik kullanılmışlara yazılır", e1.hafta.kullanilmisIdler!.includes(e1.id) && e1.id === "W38-D2-20");
kontrol("alan ilk alan, süre 60", e1.hafta.slotlar.at(-1)!.alan === "Tez" && e1.hafta.slotlar.at(-1)!.sureDk === 60);
kontrol("boş hafta içi 19:00", slotEkle(hafta(), 1, K).hafta.slotlar.at(-1)!.saat === "19:00");
kontrol("boş hafta sonu 09:30", slotEkle(hafta(), 6, K).hafta.slotlar.at(-1)!.saat === "09:30");
const e2 = slotEkle(hafta(), 5, K, "09:15", 45);
kontrol("verilen saat ve süre; kullanılmış kimlik atlanır", e2.id === "W38-D5-09b" && e2.hafta.slotlar.at(-1)!.sureDk === 45);
kontrol("en geç 22:00", slotEkle({ ...hafta(), slotlar: [{ id: "x", gun: 1, saat: "22:30", sureDk: 60, alan: "Tez", konu: "", durum: "planli" }] }, 1, K).hafta.slotlar.at(-1)!.saat === "22:00");

console.log("\nyerleştirme");
const y1 = slotuYerlestir(hafta(), K, "W38-D2-19", 2, "18:15");
kontrol("aynı günde saat değişir, kimlik aynı", y1.tasindi && y1.hafta.slotlar[0]!.saat === "18:15" && y1.hafta.slotlar[0]!.id === "W38-D2-19");
const y2 = slotuYerlestir(hafta(), K, "W38-D2-19", 5, "10:00");
kontrol("başka güne: gün ve saat birlikte", y2.tasindi && y2.hafta.slotlar[0]!.gun === 5 && y2.hafta.slotlar[0]!.saat === "10:00");
const y3 = slotuYerlestir(hafta(), K, "W38-D2-19", 3, "20:30");
kontrol("hedefte aynı saat doluysa red, hafta değişmez", !y3.tasindi && /dolu/.test(y3.not ?? "") && y3.hafta.slotlar[0]!.gun === 2);
const y4 = slotuYerlestir(hafta(), K, "W38-D2-19", 3, "17:00");
kontrol("kapasite aşımı uyarı ama taşınır", y4.tasindi && /kapasite/.test(y4.not ?? ""), y4.not ?? "");
kontrol("taşınmış slot yerleştirilmez", !slotuYerlestir(hafta(), K, "W38-D4-19", 4, "10:00").tasindi);
kontrol("taşınmış slotun saati doluluk sayılmaz", slotuYerlestir(hafta(), K, "W38-D2-19", 4, "19:00").tasindi);
const y5 = slotuYerlestir(hafta(), K, "W38-D2-19", 2, "19:00");
kontrol("yerinden oynamadıysa değişiklik yok", !y5.tasindi && y5.not === null);

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
