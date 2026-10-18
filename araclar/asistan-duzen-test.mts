/**
 * Asistan's editing helpers (issue #56): roadmaps, goals and skills.
 * `node araclar/asistan-duzen-test.mts`
 */

import {
  adimEkle,
  adimGuncelle,
  adimSil,
  adimTasi,
  asamaEkle,
  asamaSil,
  asamaTasi,
  roadmapSlug,
  suAnYap,
  yeniRoadmap,
  type DuzenRoadmap,
} from "../src/ortak/roadmap-duzen.ts";
import { hedefSirasi, hedefSonGunu, kalanMetni, normalizeHedefler, yeniHedefId } from "../src/ortak/hedef-duzen.ts";
import {
  BOS_YETENEKLER,
  alanEkle,
  normalizeYetenekler,
  olcumEkle,
  olcumGruplari,
  olcumSil,
  yetenekAlanlari,
  yetenekGuncelle,
  yetenekRolu,
} from "../src/ortak/yetenek.ts";

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

console.log("Roadmaps");
eq("slug from a Turkish name", roadmapSlug("Ses ve diksiyon", []), "ses-ve-diksiyon");
eq("slug: ç ğ ı ş ö ü İ", roadmapSlug("İngilizce Çalışma Öğüş", []), "ingilizce-calisma-ogus");
eq("slug kept unique", roadmapSlug("Gitar", ["gitar", "gitar-2"]), "gitar-3");
eq("slug of punctuation only", roadmapSlug("?!", []), "harita");
const yeni = yeniRoadmap("Almanca", "A2", "almanca");
eq("a new roadmap starts at stage 0, finding the level", [yeni.suAnAsama, yeni.asamalar.map((a) => a.ad)], [0, ["Seviye tespiti"]]);

const rm: DuzenRoadmap = {
  slug: "x",
  alan: "X",
  hedef: "h",
  baslangic: "kept",
  suAnAsama: 1,
  asamalar: ["A", "B", "C"].map((ad) => ({ ad, tahminiSaat: 2, adimlar: [{ metin: `${ad}1` }, { metin: `${ad}2` }], bittiSayilir: "" })),
};
const adlar = (r: DuzenRoadmap) => r.asamalar.map((a) => a.ad).join("");
eq("add a stage", adlar(asamaEkle(rm, "D")), "ABCD");
eq("an unnamed stage gets a number", asamaEkle(rm, " ").asamalar.at(-1)?.ad, "Aşama 3");
eq("removing a stage before the current one keeps the mark on it", [adlar(asamaSil(rm, 0)), asamaSil(rm, 0).suAnAsama], ["BC", 0]);
eq("removing the current stage: the next one becomes current", [adlar(asamaSil(rm, 1)), asamaSil(rm, 1).suAnAsama], ["AC", 1]);
eq("removing the last stage while it is current", asamaSil({ ...rm, suAnAsama: 2 }, 2).suAnAsama, 1);
eq("moving the current stage: the mark follows", [adlar(asamaTasi(rm, 1, -1)), asamaTasi(rm, 1, -1).suAnAsama], ["BAC", 0]);
eq("moving another stage over it: the mark stays on its stage", [adlar(asamaTasi(rm, 2, -1)), asamaTasi(rm, 2, -1).suAnAsama], ["ACB", 2]);
eq("moving past the end: unchanged", asamaTasi(rm, 2, 1), rm);
eq("mark a stage current", suAnYap(rm, 2).suAnAsama, 2);
eq("add a step", adimEkle(rm, 0, " yeni ").asamalar[0]!.adimlar.at(-1), { metin: "yeni", yapildi: false });
eq("an empty step is not added", adimEkle(rm, 0, "  "), rm);
eq("tick a step", adimGuncelle(rm, 2, 1, { yapildi: true }).asamalar[2]!.adimlar[1], { metin: "C2", yapildi: true });
eq("remove a step", adimSil(rm, 0, 0).asamalar[0]!.adimlar.map((a) => a.metin), ["A2"]);
eq("move a step down", adimTasi(rm, 1, 0, 1).asamalar[1]!.adimlar.map((a) => a.metin), ["B2", "B1"]);
eq("unknown fields are kept", asamaEkle(rm, "D").baslangic, "kept");

console.log("\nGoals");
eq("id in the old app's shape", yeniHedefId(new Date(2026, 9, 18, 9, 5, 7)), "h-20261018090507");
eq("a year covers to its last day", hedefSonGunu("2028"), "2028-12-31");
eq("a month covers to its last day", hedefSonGunu("2028-02"), "2028-02-29");
eq("a bad date", hedefSonGunu("2028-13"), null);
eq("years and months left", kalanMetni("2028-09", "2026-10-18"), "1 yıl 11 ay kaldı");
eq("months left", kalanMetni("2027-01", "2026-10-18"), "3 ay kaldı");
eq("weeks left", kalanMetni("2026-11-10", "2026-10-18"), "3 hafta kaldı");
eq("days left", kalanMetni("2026-10-25", "2026-10-18"), "7 gün kaldı");
eq("today", kalanMetni("2026-10-18", "2026-10-18"), "bugün");
eq("past", kalanMetni("2026-09", "2026-10-18"), "süresi geçti");
eq("no date", kalanMetni(undefined, "2026-10-18"), null);
eq(
  "reading the file keeps other fields, drops broken entries",
  normalizeHedefler({ x: 1, hedefler: [{ id: "a", ad: "A", ekstra: 2 }, { ad: "kimliksiz" }, null] }),
  { x: 1, hedefler: [{ id: "a", ad: "A", ekstra: 2 }] },
);
const hs = [
  { id: "1", ad: "Geç", hedefTarih: "2029" },
  { id: "2", ad: "Tarihsiz" },
  { id: "3", ad: "Yakın", hedefTarih: "2027-03" },
  { id: "4", ad: "Bitti", hedefTarih: "2026-01", bitti: "2026-02-01" },
];
eq("order: open by date, undated, then reached", [...hs].sort(hedefSirasi).map((h) => h.ad), ["Yakın", "Geç", "Tarihsiz", "Bitti"]);

console.log("\nSkills");
const kurallar = { alanlar: ["İngilizce", "Gitar", "Kitap"], sabitAlanlar: ["İngilizce"], rotasyonHavuzu: ["Gitar"] };
eq("roles", ["İngilizce", "Gitar", "Kitap"].map((a) => yetenekRolu(a, kurallar)), ["sabit", "rotasyon", "diger"]);
eq("skills: every week, rotation, rest; the plan's own areas left out", yetenekAlanlari(["Kitap", "Serbest", "Gitar", "İngilizce", "Kapanış"], kurallar), ["İngilizce", "Gitar", "Kitap"]);
eq("add an area", alanEkle(kurallar, " Almanca ").alanlar, ["İngilizce", "Gitar", "Kitap", "Almanca"]);
eq("an area already there (any case) is not added", alanEkle(kurallar, "gitar"), kurallar);
let y = yetenekGuncelle(BOS_YETENEKLER, "Gitar", { hayal: "Bir grupla çalmak" });
y = olcumEkle(y, "Gitar", { id: "o1", ad: "BPM", deger: "90", tarih: "2026-09-01" });
y = olcumEkle(y, "Gitar", { id: "o2", ad: "BPM", deger: "110", tarih: "2026-10-01" });
y = olcumEkle(y, "Gitar", { id: "o3", ad: "Şarkı", deger: "3", tarih: "2026-09-15" });
eq("dream and measurements kept together", [y.yetenekler.Gitar?.hayal, y.yetenekler.Gitar?.olcumler?.length], ["Bir grupla çalmak", 3]);
eq(
  "measurements grouped by name, newest first",
  olcumGruplari(y.yetenekler.Gitar!.olcumler!).map((g) => [g.ad, g.kayitlar.map((o) => o.deger)]),
  [["BPM", ["110", "90"]], ["Şarkı", ["3"]]],
);
eq("remove a measurement", olcumSil(y, "Gitar", "o1").yetenekler.Gitar?.olcumler?.map((o) => o.id), ["o2", "o3"]);
eq("reading back drops broken measurements", normalizeYetenekler({ yetenekler: { A: { hayal: "x", olcumler: [{ id: "1" }] }, B: 3 } }), {
  version: 1,
  yetenekler: { A: { hayal: "x", olcumler: [] } },
});
eq("no file", normalizeYetenekler(null), BOS_YETENEKLER);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
