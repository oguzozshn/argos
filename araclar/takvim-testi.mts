/**
 * Takvimde slot ekleme ve yerleştirme: `node araclar/takvim-testi.mts`
 */

import {
  birakmayiCoz,
  dakikaMetni,
  gorevSaati,
  gunBoyuAnahtari,
  hedefSaat,
  iyimserTarih,
  metinDakikasi,
  saatAnahtari,
  saateOtur,
  tasimaGereksiz,
  todoistTarihi,
} from "../src/ortak/gorev-zaman.ts";
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

const esitJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

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

/* --- göreve saat verme (src/ortak/gorev-zaman.ts) -------------------------
 * Takvim ekseninde bir Todoist görevi bir saate bırakılabiliyor; piksel →
 * dakika çevrimi ve bırakma anahtarı burada sınanıyor.
 */
console.log("\npiksel → dakika");
const O = { ilkSaat: 6, sonSaat: 24, saatYuksekligi: 46, adimDk: 15 };
kontrol("eksenin tepesi ilk saat", saateOtur(0, O) === 6 * 60, String(saateOtur(0, O)));
kontrol("bir saat aşağısı 07:00", saateOtur(46, O) === 7 * 60, String(saateOtur(46, O)));
kontrol("15 dakikaya oturur", saateOtur(46 + 10, O) === 7 * 60 + 15, String(saateOtur(56, O)));
kontrol("en yakın adıma yuvarlar", saateOtur(46 + 4, O) === 7 * 60, String(saateOtur(50, O)));
kontrol("üstten taşma ilk saate sıkışır", saateOtur(-500, O) === 6 * 60);
kontrol(
  "alttan taşma son saati aşmaz",
  saateOtur(99999, O) === 24 * 60 - 15,
  String(saateOtur(99999, O)),
);
kontrol("dakika metni sıfır dolgulu", dakikaMetni(7 * 60 + 5) === "07:05", dakikaMetni(425));
kontrol("metin dakikası çözülür", metinDakikasi("19:30") === 19 * 60 + 30);
kontrol("bozuk metin null", metinDakikasi("19:3") === null && metinDakikasi("abc") === null);

console.log("\ngörev saati ve Todoist metni");
kontrol("saatli görevin saati", gorevSaati("2026-09-26T14:30:00") === "14:30");
kontrol("gün boyu görev saatsiz", gorevSaati("2026-09-26") === null);
kontrol("boş tarih saatsiz", gorevSaati(null) === null && gorevSaati(undefined) === null);
kontrol("saatli due_string", todoistTarihi("2026-09-26", "14:30") === "2026-09-26 14:30");
kontrol("saatsiz due_string ISO kalır", todoistTarihi("2026-09-26", null) === "2026-09-26");
kontrol("iyimser tarih Todoist biçiminde", iyimserTarih("2026-09-26", "14:30") === "2026-09-26T14:30:00");

console.log("\nbırakma anahtarı");
const coz = (a: string) => birakmayiCoz(a);
kontrol("yalnız gün → saat korunur", esitJson(coz("2026-09-26"), { iso: "2026-09-26", saat: { tur: "koru" } }));
kontrol("günTsaat → saat verilir", esitJson(coz(saatAnahtari("2026-09-26", "14:30")), { iso: "2026-09-26", saat: { tur: "ver", saat: "14:30" } }));
kontrol("gün boyu → saat silinir", esitJson(coz(gunBoyuAnahtari("2026-09-26")), { iso: "2026-09-26", saat: { tur: "sil" } }));
kontrol("tarih olmayan anahtar null", coz("bugun") === null && coz("") === null);
kontrol("bozuk saat eki null", coz("2026-09-26T99:99") === null && coz("2026-09-26Txx") === null);

console.log("\nhedef saat ve gereksiz taşıma");
kontrol("koru mevcut saati alır", hedefSaat("2026-09-26T14:30:00", { tur: "koru" }) === "14:30");
kontrol("ver isteneni yazar", hedefSaat("2026-09-26T14:30:00", { tur: "ver", saat: "09:00" }) === "09:00");
kontrol("sil saati kaldırır", hedefSaat("2026-09-26T14:30:00", { tur: "sil" }) === null);
kontrol(
  "aynı gün + aynı saat gereksiz",
  tasimaGereksiz("2026-09-26T14:30:00", "2026-09-26", { tur: "ver", saat: "14:30" }),
);
kontrol(
  "aynı gün + başka saat gerekli",
  !tasimaGereksiz("2026-09-26T14:30:00", "2026-09-26", { tur: "ver", saat: "09:00" }),
);
kontrol(
  "saatliyi gün boyuna çevirmek gerekli",
  !tasimaGereksiz("2026-09-26T14:30:00", "2026-09-26", { tur: "sil" }),
);
kontrol(
  "aynı güne saat korumalı bırakmak gereksiz",
  tasimaGereksiz("2026-09-26T14:30:00", "2026-09-26", { tur: "koru" }),
);
kontrol("başka gün her hâlde gerekli", !tasimaGereksiz("2026-09-26", "2026-09-27", { tur: "koru" }));
kontrol("tarihsiz görev taşınabilir", !tasimaGereksiz(null, "2026-09-26", { tur: "koru" }));

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
