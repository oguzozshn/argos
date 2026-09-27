/**
 * Önemli tarihlerin geri sayımı: `node araclar/geri-sayim-testi.mts`
 *
 * Kural kullanıcının: iki haftadan uzaksa "X hafta Y gün", iki hafta ve
 * altında yalnız gün. Sınır (14/15) kayarsa ekran sessizce yanlış söyler.
 */

import { aciliyet, kalanGun, kalanMetni, tarihEtiketi, tariheGoreSirala } from "../src/ortak/geri-sayim.ts";

let gecen = 0;
let kalan = 0;

function esit(ad: string, bulunan: unknown, beklenen: unknown): void {
  if (bulunan === beklenen) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}: ${JSON.stringify(bulunan)} ≠ ${JSON.stringify(beklenen)}`);
  }
}

console.log("Kalan metni");
esit("0 → Bugün", kalanMetni(0), "Bugün");
esit("1 → Yarın", kalanMetni(1), "Yarın");
esit("2 gün", kalanMetni(2), "2 gün");
esit("7 gün haftaya çevrilmez", kalanMetni(7), "7 gün");
esit("14 gün hâlâ gün", kalanMetni(14), "14 gün");
esit("15 → 2 hafta 1 gün", kalanMetni(15), "2 hafta 1 gün");
esit("20 → 2 hafta 6 gün", kalanMetni(20), "2 hafta 6 gün");
esit("21 → 3 hafta (0 gün yazılmaz)", kalanMetni(21), "3 hafta");
esit("22 → 3 hafta 1 gün", kalanMetni(22), "3 hafta 1 gün");
esit("100 → 14 hafta 2 gün", kalanMetni(100), "14 hafta 2 gün");
esit("−1 → 1 gün geçti", kalanMetni(-1), "1 gün geçti");
esit("−5 → 5 gün geçti", kalanMetni(-5), "5 gün geçti");

console.log("\nKalan gün");
esit("aynı gün 0", kalanGun("2026-09-27", "2026-09-27"), 0);
esit("saatli tarihte saat sayılmaz", kalanGun("2026-09-28T09:00:00", "2026-09-27"), 1);
esit("ay devri", kalanGun("2026-10-17", "2026-09-27"), 20);
esit("yıl devri", kalanGun("2027-01-02", "2026-12-30"), 3);
esit("geçmiş eksi", kalanGun("2026-09-22", "2026-09-27"), -5);
// Ekim sonunda yaz saati biter; UTC üzerinden sayıldığı için gün kaymamalı.
esit("yaz saati geçişi kaydırmaz", kalanGun("2026-11-01", "2026-10-24"), 8);

console.log("\nAciliyet");
esit("geçmiş acil", aciliyet(-2), "acil");
esit("3 gün acil", aciliyet(3), "acil");
esit("4 gün yakın", aciliyet(4), "yakin");
esit("7 gün yakın", aciliyet(7), "yakin");
esit("8 gün sakin", aciliyet(8), "sakin");

console.log("\nTarih etiketi");
esit("bu yıl: yılsız", tarihEtiketi("2026-10-17", "2026-09-27"), "17 Ekim Cumartesi");
esit("başka yıl: yıllı", tarihEtiketi("2027-01-04", "2026-09-27"), "4 Ocak 2027 Pazartesi");
esit("saatli", tarihEtiketi("2026-10-06T14:30:00", "2026-09-27"), "6 Ekim Salı · 14:30");

console.log("\nSıralama");
const sirali = tariheGoreSirala([
  { tarih: null, icerik: "b" },
  { tarih: "2026-11-01", icerik: "uzak" },
  { tarih: "2026-09-20", icerik: "geçmiş" },
  { tarih: null, icerik: "a" },
  { tarih: "2026-10-01T09:00:00", icerik: "yakın" },
]).map((x) => x.icerik);
esit("geçmiş → yakın → uzak → tarihsizler", sirali.join(","), "geçmiş,yakın,uzak,a,b");

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
