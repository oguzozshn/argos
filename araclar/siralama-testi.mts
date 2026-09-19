/**
 * Sürükleyerek sıralama testi: `node araclar/siralama-testi.mts`
 *
 * Sürükle-bırak dosyadaki diziyi yeniden diziyor (Hobiler). Yanlış hesap
 * kayıt kaybettirir ya da çoğaltır; süzgeç açıkken ekrandaki sıra tam
 * listenin alt kümesi olduğu için konum değil kimlik kullanılıyor.
 */

import { grubaTasi, tasi } from "../src/ortak/siralama.ts";

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

console.log("\nGruba taşıma (durum değiştirme)");
{
  // s = sırada, b = bitti
  const g = [m("a", "s"), m("b", "s"), m("c", "b"), m("d", "b"), m("e", "s")];
  const durumlar = (x: Madde[]) => x.map((y) => y.id + y.durum).join(" ");

  const r1 = grubaTasi(g, "a", "durum", "b", { id: "d", once: true });
  kontrol("başka gruptaki kaydın önüne: sıra", sira(r1) === "bcade");
  kontrol("başka gruptaki kaydın önüne: durum değişir", r1.find((x) => x.id === "a")?.durum === "b");
  kontrol("başkalarının durumu değişmez", durumlar(r1) === "bs cb ab db es");

  const r2 = grubaTasi(g, "e", "durum", "b", null);
  kontrol("grup başlığına: grubun en üstüne iner", sira(r2) === "abecd" && r2[2]?.durum === "b");

  const r3 = grubaTasi(g, "c", "durum", "x", null);
  kontrol("boş gruba: yeri değişmez, grubu değişir", sira(r3) === "abcde" && r3[2]?.durum === "x");

  kontrol("aynı grup, aynı yer: aynı dizi", grubaTasi(g, "c", "durum", "b", { id: "d", once: true }) === g);
  kontrol("zaten grubun başındaysa başlığa bırakmak: aynı dizi", grubaTasi(g, "c", "durum", "b", null) === g);
  kontrol("olmayan kaynak: aynı dizi", grubaTasi(g, "x", "durum", "b", null) === g);
  kontrol("girdi değişmez", durumlar(g) === "as bs cb db es");
  kontrol("taşınan kayıt yeni nesne, ötekiler aynı nesne", r1[2] !== g[0] && r1[0] === g[1]);
}

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
