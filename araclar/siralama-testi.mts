/**
 * Sürükleyerek sıralama testi: `node araclar/siralama-testi.mts`
 *
 * Sürükle-bırak dosyadaki diziyi yeniden diziyor (Hobiler). Yanlış hesap
 * kayıt kaybettirir ya da çoğaltır; süzgeç açıkken ekrandaki sıra tam
 * listenin alt kümesi olduğu için konum değil kimlik kullanılıyor.
 */

import { tasi } from "../src/ortak/siralama.ts";

interface Madde {
  id: string;
  durum: string;
}

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

const m = (id: string, durum = "sırada"): Madde => ({ id, durum });
const liste = ["a", "b", "c", "d", "e"].map((x) => m(x));
const sira = (x: Madde[]) => x.map((y) => y.id).join("");

console.log("Taşıma");
kontrol("aşağı, hedefin önüne", sira(tasi(liste, "a", "d", true)) === "bcade");
kontrol("aşağı, hedefin arkasına", sira(tasi(liste, "a", "d", false)) === "bcdae");
kontrol("yukarı, hedefin önüne", sira(tasi(liste, "e", "b", true)) === "aebcd");
kontrol("yukarı, hedefin arkasına", sira(tasi(liste, "e", "b", false)) === "abecd");
kontrol("en başa", sira(tasi(liste, "c", "a", true)) === "cabde");
kontrol("en sona", sira(tasi(liste, "c", "e", false)) === "abdec");

console.log("\nBir şey değişmiyorsa aynı dizi döner (boşuna yazılmaz)");
kontrol("kendi üstüne", tasi(liste, "c", "c", true) === liste);
kontrol("hemen arkasındakinin önüne", tasi(liste, "c", "d", true) === liste);
kontrol("hemen önündekinin arkasına", tasi(liste, "c", "b", false) === liste);
kontrol("olmayan kaynak", tasi(liste, "x", "a", true) === liste);
kontrol("olmayan hedef", tasi(liste, "a", "x", true) === liste);

console.log("\nKayıt kaybolmaz, çoğalmaz, değişmez");
const t = tasi(liste, "b", "e", false);
kontrol("aynı sayıda kayıt", t.length === liste.length);
kontrol("her kayıt bir kez", new Set(t.map((x) => x.id)).size === liste.length);
kontrol("kayıt nesnesi aynı kalır", t.find((x) => x.id === "b") === liste[1]);
kontrol("girdi dizisi değişmez", sira(liste) === "abcde");

console.log("\nSüzgeç açıkken (ekranda alt küme)");
// Ekranda yalnız "bitti"ler var: b, d. d'yi b'nin önüne sürüklemek aradaki
// görünmeyen c'yi yerinde bırakmalı.
const karisik = [m("a"), m("b", "bitti"), m("c"), m("d", "bitti"), m("e")];
kontrol("görünmeyenler yerinde kalır", sira(tasi(karisik, "d", "b", true)) === "adbce");

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
