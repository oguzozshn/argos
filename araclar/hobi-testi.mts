/**
 * Hobi kategorileri: `node araclar/hobi-testi.mts`
 */

import {
  kategoriCikar,
  kategoriEkle,
  kategorileriAyikla,
  kategorileriYaz,
  kategoriyeGoreGrupla,
  kategoriyiEsle,
  tumKategoriler,
} from "../src/ortak/hobi-kategori.ts";
import { notEkle, notSil, notlariOku, notDegistir } from "../src/ortak/hobi-not.ts";

interface Madde {
  id: string;
  ad: string;
  durum: string;
  not: string;
  eklendi: string;
  kategoriler?: string[];
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
const esit = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const m = (id: string, kategoriler?: string[]): Madde => ({ id, ad: id, durum: "sırada", not: "", eklendi: "2026-09-19", ...(kategoriler ? { kategoriler } : {}) });

console.log("\nekle / çıkar");
kontrol("eklenir, boşluk sadeleşir", esit(kategoriEkle(undefined, "  açık   dünya "), ["açık dünya"]));
kontrol("büyük/küçük harf farkıyla tekrar eklenmez", esit(kategoriEkle(["RPG"], "rpg"), ["RPG"]));
kontrol("Türkçe İ/i", esit(kategoriEkle(["İndie"], "indie"), ["İndie"]));
kontrol("boş eklenmez", esit(kategoriEkle(["RPG"], "  "), ["RPG"]));
kontrol("çıkarma harf farkını tanır", esit(kategoriCikar(["RPG", "Souls"], "rpg"), ["Souls"]));
kontrol("son kategori çıkınca alan silinir", !("kategoriler" in kategorileriYaz(m("a", ["RPG"]), [])));
kontrol("kategori varsa yazılır", esit(kategorileriYaz(m("a"), ["RPG"]).kategoriler, ["RPG"]));

console.log("\n#ayıklama");
kontrol("ad ve kategoriler", esit(kategorileriAyikla("Elden Ring #RPG #açık_dünya"), { ad: "Elden Ring", kategoriler: ["RPG", "açık dünya"] }));
kontrol("başta ve ortada", esit(kategorileriAyikla("#Souls Dark Souls #rpg 3"), { ad: "Dark Souls 3", kategoriler: ["Souls", "rpg"] }));
kontrol("C# kategori değil", esit(kategorileriAyikla("C# kitabı"), { ad: "C# kitabı", kategoriler: [] }));
kontrol("tek # dokunulmaz", esit(kategorileriAyikla("Oyun # 2"), { ad: "Oyun # 2", kategoriler: [] }));
kontrol("tekrar eden etiket bir kez", esit(kategorileriAyikla("X #RPG #rpg").kategoriler, ["RPG"]));

kontrol("var olan yazım korunur", kategoriyiEsle("açık dünya", ["Açık dünya", "RPG"]) === "Açık dünya");
kontrol("yoksa sadeleşmiş hâli", kategoriyiEsle("  yeni   tür ", ["RPG"]) === "yeni tür");

console.log("\ngruplama");
const liste = [m("a", ["RPG", "Souls"]), m("b"), m("c", ["rpg"]), m("d", ["Indie"]), m("e", [])];
kontrol("tüm kategoriler tekil ve alfabetik", esit(tumKategoriler(liste), ["Indie", "RPG", "Souls"]));
const g = kategoriyeGoreGrupla(liste);
kontrol("grup sırası, kategorisiz sonda", esit(g.map((x) => x.kategori), ["Indie", "RPG", "Souls", null]));
kontrol("çok kategorili her grubunda", esit(g[1]!.maddeler.map((x) => x.id), ["a", "c"]) && g[2]!.maddeler[0]!.id === "a");
kontrol("boş dizi de kategorisiz", esit(g[3]!.maddeler.map((x) => x.id), ["b", "e"]));
kontrol("hiç kategori yoksa tek grup", esit(kategoriyeGoreGrupla([m("x")]).map((x) => x.kategori), [null]));

console.log("\nnotlar");
const n0 = { id: "x", ad: "Spore", durum: "sırada", not: "eski not", eklendi: "2026-09-01" };
kontrol("eski tek metin ilk not sayılır", notlariOku(n0).map((n) => n.metin).join() === "eski not");
const n1 = notEkle(n0, "  ikinci  ", "2026-09-20", "n-1");
kontrol("yeni not en üste", notlariOku(n1).map((n) => n.metin).join() === "ikinci,eski not");
kontrol("kısa not ilk nottan", n1.not === "ikinci");
kontrol("boş not eklenmez", notEkle(n1, "   ", "2026-09-20") === n1);
const n2 = notSil(n1, "n-1");
kontrol("silinince kısa not güncellenir", notlariOku(n2).length === 1 && n2.not === "eski not");
const n3 = notDegistir(n2, notlariOku(n2)[0]!.id, "düzeltildi");
kontrol("not düzenlenir", n3.not === "düzeltildi" && notlariOku(n3).length === 1);
kontrol("boşa çevrilen not silinir", notlariOku(notDegistir(n3, notlariOku(n3)[0]!.id, " ")).length === 0);

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
