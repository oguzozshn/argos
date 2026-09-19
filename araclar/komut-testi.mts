/**
 * Komut paleti aramasının testi: `node araclar/komut-testi.mts`
 */

import { komutAra, sadelestir, type Aranabilir } from "../src/ortak/komut-ara.ts";

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

const K: (Aranabilir & { id: string })[] = [
  { id: "gorev", ad: "Görev ekle", anahtarlar: ["todoist"], onekler: ["görev", "g"] },
  { id: "not", ad: "Hatırla'ya not ekle", onekler: ["not"] },
  { id: "slot", ad: "Plana slot ekle", onekler: ["slot"] },
  { id: "odak", ad: "Odak başlat", anahtarlar: ["pomodoro", "sayaç"] },
  { id: "git-hafta", ad: "Git: Asistan › Hafta", anahtarlar: ["asistan", "hafta"] },
  { id: "git-hatirla", ad: "Git: Asistan › Hatırla", anahtarlar: ["asistan", "hatırla"] },
  { id: "git-takvim", ad: "Git: Takvim", anahtarlar: ["takvim"] },
];
const ilk = (q: string) => komutAra(q, K)[0];
const idler = (q: string) => komutAra(q, K).map((e) => e.komut.id);

console.log("\nsadeleştirme");
kontrol("Türkçe harfler", sadelestir("  Görev  ÇİŞ ığü ") === "gorev cis igu", sadelestir("  Görev  ÇİŞ ığü "));

console.log("\nönek");
kontrol("görev + metin", ilk("görev süt al yarın")?.komut.id === "gorev" && ilk("görev süt al yarın")?.arguman === "süt al yarın");
kontrol("şapkasız önek", ilk("gorev x")?.komut.id === "gorev");
kontrol("tek harf önek", ilk("g fatura öde")?.arguman === "fatura öde");
kontrol("önek tek başına argüman boş", ilk("not")?.komut.id === "not" && ilk("not")?.arguman === "");
kontrol("argümandaki büyük harf ve boşluk korunur", ilk("slot yarın 16:00 Tez  okuma")?.arguman === "yarın 16:00 Tez  okuma");
kontrol("önekle birlikte ada göre eşleşenler de listede", idler("not").length >= 1);

console.log("\narama");
kontrol("boş sorgu hepsi, sırayla", idler("").join() === K.map((k) => k.id).join());
kontrol("ad başı", ilk("odak")?.komut.id === "odak");
kontrol("anahtar sözcük", ilk("pomodoro")?.komut.id === "odak");
kontrol("sözcük başı: hafta", ilk("hafta")?.komut.id === "git-hafta");
kontrol("şapkasız: hatirla", idler("hatirla").includes("git-hatirla"));
kontrol("harf sırası: tkvm", ilk("tkvm")?.komut.id === "git-takvim");
kontrol("eşleşmeyen yok", komutAra("zzzz", K).length === 0);
kontrol("önekle seçilmeyende argüman null", komutAra("takvim", K).every((e) => e.arguman === null));

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
