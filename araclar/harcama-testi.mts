/**
 * Harcama modülü testi: `node araclar/harcama-testi.mts`
 *
 * Gövdenin çoğu ExpenseTracker'ın kendi testlerinden geliyor (Tests/MoneyTests,
 * PeriodTests, RecurringRuleTests, BudgetCoverageTests, ForecastTests). Aynı
 * girdiden aynı sayı çıkmak zorunda: iki uygulama aynı defteri farklı okursa
 * hangisinin doğru olduğu tartışılır.
 *
 * Para ayrıştırıcısı bu takımın en kritik parçası: yanlış cevabı sessiz ve
 * pahalı — "1.500" girdisini 1,50 ₺ okumak gerçek bir ödemeden üç hane siler.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listele, oku, yaz } from "../src/main/veri-cekirdek.ts";
import { paraCoz, paraGiris, paraIsaretli, paraMetni } from "../src/ortak/para.ts";
import {
  baslangicGunuDuzelt,
  donemAylari,
  donemEtiketi,
  donemGunSayisi,
  donemIceren,
  donemKisaEtiketi,
  gecenGunler,
  oncekiDonem,
  sonrakiDonem,
  type Donem,
} from "../src/ortak/donem.ts";
import {
  atilButceler,
  butceDurumu,
  csvUret,
  donemOzeti,
  gunlukHiz,
  hesapBakiyeleri,
  kapsamOzeti,
  kapsamaDisiOlanlar,
  kategoriHarcamaSatiri,
  trend,
  type Hesap,
  type Islem,
  type Kategori,
} from "../src/ortak/harcama.ts";
import { sonrakiTekrar, tekrarAtla, tekSeferlik, vadesiGelenler, TEK_GECISTE_EN_FAZLA } from "../src/ortak/duzenli.ts";
import { agirlikliOrtalama, dogrusalTahmin, donemdekiTekrarSayisi } from "../src/ortak/tahmin.ts";
import type { Duzenli } from "../src/ortak/harcama.ts";

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

/* --- para -------------------------------------------------------------- */

console.log("Para — yazılan biçimler");

for (const [girdi, beklenen] of [
  ["1234", 123400],
  ["1234,56", 123456],
  ["1234.56", 123456],
  ["1.234,56", 123456],
  ["1,234.56", 123456],
  ["0,05", 5],
  ["12,5", 1250],
  ["12.5", 1250],
  [" 1 234,50 ₺ ", 123450],
] as [string, number][]) {
  kontrol(`"${girdi}" → ${beklenen}`, paraCoz(girdi) === beklenen, String(paraCoz(girdi)));
}

console.log("\nPara — noktadan sonraki üç hane binliktir");
for (const [girdi, beklenen] of [
  ["1.500", 150000],
  ["18.500", 1850000],
  ["1.234.567", 123456700],
] as [string, number][]) {
  kontrol(`"${girdi}" → ${beklenen}`, paraCoz(girdi) === beklenen, String(paraCoz(girdi)));
}

console.log("\nPara — fazla ondalık kesilmez, yuvarlanır");
kontrol('"12,555" → 1256', paraCoz("12,555") === 1256, String(paraCoz("12,555")));
kontrol('"12,554" → 1255', paraCoz("12,554") === 1255, String(paraCoz("12,554")));

console.log("\nPara — sayı olmayan reddedilir");
for (const girdi of ["", "   ", "abc", null, undefined]) {
  kontrol(`${JSON.stringify(girdi)} reddedilir`, paraCoz(girdi) === null);
}
// Sıfır ile "okunamadı" ayrı cevaplar: biri tutar, diğeri hata.
kontrol('"0" sıfırdır, hata değil', paraCoz("0") === 0);

console.log("\nPara — biçim");
kontrol("giriş kutusundan gidiş-dönüş", paraCoz(paraGiris(1850050)) === 1850050);
kontrol('1.234,56 ₺', paraMetni(123456) === "1.234,56 ₺", paraMetni(123456));
kontrol("−1.234,56 ₺", paraIsaretli(-123456) === "−1.234,56 ₺", paraIsaretli(-123456));
kontrol("simgesiz biçim boşlukla bitmez", paraMetni(123456, "") === "1.234,56", paraMetni(123456, ""));
kontrol("eksi tutar", paraMetni(-5) === "-0,05 ₺", paraMetni(-5));

/* --- dönem ------------------------------------------------------------- */

console.log("\nDönem");

const esit = (d: Donem, bas: string, son: string): boolean => d.bas === bas && d.son === son;

kontrol(
  "başlangıç günü 1 ise takvim ayı",
  esit(donemIceren("2026-08-03", 1), "2026-08-01", "2026-08-31") &&
    donemGunSayisi(donemIceren("2026-08-03", 1)) === 31,
);
kontrol(
  "başlangıç gününden önceki tarih önceki döneme ait",
  esit(donemIceren("2026-08-03", 15), "2026-07-15", "2026-08-14"),
);
kontrol(
  "başlangıç gününde yeni dönem açılır",
  esit(donemIceren("2026-08-15", 15), "2026-08-15", "2026-09-14"),
);
kontrol("Şubat geç başlangıcı kaldırır", esit(donemIceren("2026-03-01", 28), "2026-02-28", "2026-03-27"));
kontrol("28'den sonrası kırpılır", baslangicGunuDuzelt(31) === 28 && baslangicGunuDuzelt(0) === 1);

const kayan = donemIceren("2026-01-31", 15);
kontrol(
  "kaydırma aynı başlangıç gününde kalır",
  kayan.bas === "2026-01-15" &&
    sonrakiDonem(kayan).bas === "2026-02-15" &&
    oncekiDonem(kayan).bas === "2025-12-15",
);

const agustos = donemIceren("2026-08-03", 1);
kontrol(
  "geçen gün sayısı döneme kırpılır",
  gecenGunler(agustos, "2026-07-20") === 0 &&
    gecenGunler(agustos, "2026-08-03") === 3 &&
    gecenGunler(agustos, "2026-09-20") === 31,
);
kontrol("takvim ayı etiketi", donemEtiketi(agustos) === "Ağustos 2026", donemEtiketi(agustos));
kontrol(
  "kayan dönem açık aralık yazar",
  donemEtiketi(donemIceren("2026-08-03", 15)) === "15 Tem – 14 Ağu 2026",
  donemEtiketi(donemIceren("2026-08-03", 15)),
);
kontrol("kısa etiket", donemKisaEtiketi(agustos) === "Ağu 26", donemKisaEtiketi(agustos));
kontrol(
  "kayan dönem iki ay dosyasına dokunur",
  JSON.stringify(donemAylari(donemIceren("2026-08-03", 15))) === JSON.stringify(["2026-07", "2026-08"]),
);

/* --- düzenli işlemler --------------------------------------------------- */

console.log("\nDüzenli işlemler");

const kural = (ayinGunu: number, baslangic: string, bitis: string | null = null, durdu = false): Duzenli => ({
  id: "k1",
  ad: "Kira",
  kategoriId: "kira",
  tur: "gider",
  kurus: 100000,
  ayinGunu,
  karsiTaraf: "",
  odeme: "havale",
  hesapId: null,
  baslangic,
  bitis,
  durdu,
});

kontrol(
  "ilk tekrar başlangıçtan önce olmaz",
  sonrakiTekrar(kural(1, "2026-06-15"), "2026-06-15") === "2026-07-01",
  String(sonrakiTekrar(kural(1, "2026-06-15"), "2026-06-15")),
);
kontrol(
  "başlangıç günün kendisiyse o gün çalışır",
  sonrakiTekrar(kural(1, "2026-06-01"), "2026-06-01") === "2026-06-01",
);

const yuruyus: string[] = [];
{
  const k = kural(28, "2026-01-28");
  let t = sonrakiTekrar(k, k.baslangic);
  while (t !== null && t <= "2026-04-30") {
    yuruyus.push(t);
    t = sonrakiTekrar(k, gunSonrasi(t));
  }
}
kontrol(
  "her adım kesin olarak ileri gider",
  JSON.stringify(yuruyus) === JSON.stringify(["2026-01-28", "2026-02-28", "2026-03-28", "2026-04-28"]),
  yuruyus.join(", "),
);

{
  // 31'e ayarlı kural her ayın son gününe düşer, kısa ayda takılıp kalmaz.
  const k = kural(31, "2026-01-31");
  const gunler: string[] = [];
  let t = sonrakiTekrar(k, k.baslangic);
  while (t !== null && t <= "2026-05-31") {
    gunler.push(t);
    t = sonrakiTekrar(k, gunSonrasi(t));
  }
  kontrol(
    "31 her ayın sonuna düşer",
    JSON.stringify(gunler) === JSON.stringify(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]),
    gunler.join(", "),
  );
}

kontrol(
  "bitiş tarihinden sonra çalışmaz",
  sonrakiTekrar(kural(1, "2026-01-01", "2026-03-15"), "2026-02-02") === "2026-03-01" &&
    sonrakiTekrar(kural(1, "2026-01-01", "2026-03-15"), "2026-03-02") === null,
);
kontrol("durdurulmuş kural hiç çalışmaz", sonrakiTekrar(kural(1, "2026-01-01", null, true), "2026-01-01") === null);
kontrol(
  "bitişi ikinci tekrardan önceyse tek seferlik",
  tekSeferlik(kural(1, "2026-01-01", "2026-01-20")) && !tekSeferlik(kural(1, "2026-01-01", "2026-05-20")),
);

console.log("\nDüzenli işlemler — üretim");

const uretilen = vadesiGelenler([kural(1, "2026-01-01")], [], "2026-04-15");
kontrol("aradaki bütün aylar tamamlanır", uretilen.length === 4, String(uretilen.length));
kontrol(
  "üretilen kayıt kuralın kimliğini taşır",
  uretilen.every((i) => i.duzenliId === "k1" && i.not === "Kira" && i.kurus === 100000),
);

const mevcut: Islem[] = uretilen.map((i, n) => ({ ...i, id: `i${n}` }));
kontrol("ikinci geçiş mükerrer üretmez", vadesiGelenler([kural(1, "2026-01-01")], mevcut, "2026-04-15").length === 0);
kontrol(
  "eksik kalan tek ay tamamlanır",
  vadesiGelenler([kural(1, "2026-01-01")], mevcut.slice(0, 3), "2026-04-15").length === 1,
);
kontrol(
  "tek geçişte üst sınır uygulanır",
  vadesiGelenler([kural(1, "2000-01-01")], [], "2026-04-15").length === TEK_GECISTE_EN_FAZLA,
);
kontrol("durdurulmuş kural üretmez", vadesiGelenler([kural(1, "2026-01-01", null, true)], [], "2026-04-15").length === 0);

// Kullanıcı üretilen bir kaydı sildi (o ay kira ödenmedi) ya da tarihini
// kaydırdı: `(kural, tarih)` çifti defterden kalktığı için bir sonraki
// açılışta aynı kayıt yeniden yazılıyordu.
const silindi = mevcut.filter((i) => i.tarih !== "2026-02-01");
kontrol(
  "atlanmış işaretlenmeyen silinmiş tekrar geri gelir (eski davranış)",
  vadesiGelenler([kural(1, "2026-01-01")], silindi, "2026-04-15").length === 1,
);
const atlanmis = tekrarAtla(kural(1, "2026-01-01"), "2026-02-01");
kontrol(
  "silinen tekrar atlanmış sayılır, yeniden üretilmez",
  vadesiGelenler([atlanmis], silindi, "2026-04-15").length === 0,
);
kontrol(
  "atlamak yalnızca o tarihi etkiler",
  vadesiGelenler([atlanmis], [], "2026-04-15").map((i) => i.tarih).join(",") ===
    "2026-01-01,2026-03-01,2026-04-01",
);
kontrol(
  "aynı tarihi iki kez atlamak listeyi şişirmez",
  tekrarAtla(atlanmis, "2026-02-01").atlananlar?.length === 1,
);
kontrol("atlama kuralın kendisini değiştirmez", kural(1, "2026-01-01").atlananlar === undefined);

/* --- tahmin ------------------------------------------------------------- */

console.log("\nTahmin — kestiriciler");

const yakin = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

kontrol("düz seride iki kestirici aynı sonucu verir", yakin(agirlikliOrtalama([1000, 1000, 1000, 1000]), 1000) && yakin(dogrusalTahmin([1000, 1000, 1000, 1000]), 1000));
{
  const a = agirlikliOrtalama([100, 200, 300]);
  kontrol("ağırlıklı ortalama son döneme yaslanır", a > 200 && a < 300, String(a));
}
kontrol("doğru, eğilimi bir dönem ileri taşır", yakin(dogrusalTahmin([100, 200, 300, 400]), 500), String(dogrusalTahmin([100, 200, 300, 400])));
{
  const seri = [16593, 21743, 25600, 29001, 30792];
  kontrol("yükselen seride doğru, ağırlıklı ortalamanın üstünde", dogrusalTahmin(seri) > agirlikliOrtalama(seri));
}
kontrol("düşen seri eksi borç öngörmez", dogrusalTahmin([10000, 6000, 2000, 100]) >= 0);
kontrol("tek dönem olduğu gibi taşınır", yakin(agirlikliOrtalama([4200]), 4200) && yakin(dogrusalTahmin([4200]), 4200));
kontrol("boş seri sıfırdır", agirlikliOrtalama([]) === 0 && dogrusalTahmin([]) === 0);

console.log("\nTahmin — dönem içi tekrar sayısı");
kontrol("aylık kural takvim ayında bir kez sayılır", donemdekiTekrarSayisi(kural(15, "2026-01-01"), { bas: "2026-08-01", son: "2026-08-31" }) === 1);
kontrol(
  "kayan dönemde iki kez sayılmaz",
  donemdekiTekrarSayisi(kural(20, "2026-01-01"), { bas: "2026-08-15", son: "2026-09-14" }) === 1,
);
kontrol("bitmiş kural katkı vermez", donemdekiTekrarSayisi(kural(10, "2026-01-01", "2026-06-30"), { bas: "2026-08-01", son: "2026-08-31" }) === 0);
kontrol("durdurulmuş kural katkı vermez", donemdekiTekrarSayisi(kural(10, "2026-01-01", null, true), { bas: "2026-08-01", son: "2026-08-31" }) === 0);

/* --- bütçe kapsamı ------------------------------------------------------ */

console.log("\nBütçe kapsamı");

const kat = (ad: string): Kategori => ({
  id: ad,
  ad,
  tur: "gider",
  renk: "#5b8def",
  simge: "",
  arsiv: false,
  sira: 1,
});

const satir = (ad: string, ortalama: number, sinir: number | null = null) =>
  kategoriHarcamaSatiri(kat(ad), ortalama, sinir);

{
  const k = kapsamOzeti([satir("Market", 1500000), satir("Abonelikler", 50000, 250000)], 5);
  kontrol(
    "kapsam, olağan harcamanın bütçelenmiş payıdır",
    k.butceliOrtalama === 50000 && k.toplamOrtalama === 1550000 && k.kapsamaDisi === 1500000,
  );
  // Sınır harcamanın beş katı ama kapsam neyin izlendiğini sayar, ne kadar cömert
  // olduğunu değil — yoksa yeterince büyük bir sınır %100 okunurdu.
  kontrol("cömert sınır oranı şişirmez", k.oran > 0.03 && k.oran < 0.033, String(k.oran));
}
{
  const k = kapsamOzeti([satir("Market", 1500000), satir("Mecburi", 0, 5150000)], 5);
  const atil = atilButceler(k);
  kontrol("harcaması olmayan sınır atıldır", atil.length === 1 && atil[0]!.kategori.ad === "Mecburi");
  kontrol("atıl bütçe oranı güzelleştirmez", k.butceliOrtalama === 0);
}
kontrol(
  "harcaması olmayan bütçesiz kategori kapsam dışı sayılmaz",
  kapsamaDisiOlanlar(kapsamOzeti([satir("Market", 1500000), satir("Kullanılmayan", 0)], 5)).length === 1,
);
kontrol(
  "kapsam dışı kategoriler pahalıdan ucuza gelir",
  JSON.stringify(
    kapsamaDisiOlanlar(kapsamOzeti([satir("Ulaşım", 83800), satir("Market", 1422600), satir("Yeme-İçme", 387600)], 5)).map(
      (h) => h.kategori.ad,
    ),
  ) === JSON.stringify(["Market", "Yeme-İçme", "Ulaşım"]),
);
{
  const k = kapsamOzeti([satir("Market", 1500000, 1600000), satir("Ulaşım", 80000, 100000)], 5);
  kontrol("tam kapsam bir okunur", Math.abs(k.oran - 1) < 0.001 && k.kapsamaDisi === 0 && kapsamaDisiOlanlar(k).length === 0);
}
{
  const k = kapsamOzeti([satir("Market", 0), satir("Ulaşım", 0)], 5);
  kontrol("boş defter sıfırdır, sıfıra bölme değil", k.oran === 0 && k.toplamOrtalama === 0);
}
{
  // Sınır sıfırlanınca bütçe silinir; kalıntı bir satır da bütçe sayılmamalı.
  const k = kapsamOzeti([satir("Market", 1500000, 0)], 5);
  kontrol(
    "sıfır sınır bütçe sayılmaz",
    k.butceliOrtalama === 0 && kapsamaDisiOlanlar(k).length === 1 && atilButceler(k).length === 0,
  );
}

/* --- defter raporları --------------------------------------------------- */

console.log("\nDefter raporları");

const kategoriler: Kategori[] = [
  kat("market"),
  { ...kat("maas"), tur: "gelir", ad: "Maaş" },
  kat("transfer"),
];

const islem = (o: Partial<Islem> & Pick<Islem, "id" | "kategoriId" | "tur" | "kurus" | "tarih">): Islem => ({
  not: "",
  karsiTaraf: "",
  odeme: "kart",
  hesapId: null,
  transfer: false,
  ...o,
});

const defter: Islem[] = [
  islem({ id: "1", kategoriId: "market", tur: "gider", kurus: 30000, tarih: "2026-08-03", hesapId: "banka" }),
  islem({ id: "2", kategoriId: "market", tur: "gider", kurus: 20000, tarih: "2026-08-03", hesapId: "banka" }),
  islem({ id: "3", kategoriId: "maas", tur: "gelir", kurus: 900000, tarih: "2026-08-01", hesapId: "banka" }),
  islem({ id: "4", kategoriId: "transfer", tur: "gider", kurus: 500000, tarih: "2026-08-05", hesapId: "banka", transfer: true }),
  islem({ id: "5", kategoriId: "market", tur: "gider", kurus: 10000, tarih: "2026-07-30", hesapId: "banka" }),
];

const ozet = donemOzeti(defter, agustos, kategoriler);
kontrol("dönem dışı satır özete girmez", ozet.adet === 3, String(ozet.adet));
kontrol("transfer gider sayılmaz", ozet.gider === 50000, String(ozet.gider));
kontrol("gelir ve net", ozet.gelir === 900000 && ozet.net === 850000);
kontrol(
  "günlük seri boş günleri de taşır",
  ozet.gunluk.length === 31 && ozet.gunluk[1]!.gider === 0 && ozet.gunluk[2]!.gider === 50000,
);
kontrol("kategori toplamı büyükten küçüğe", ozet.kategoriler[0]!.kategoriId === "maas");
kontrol("günlük hız geçen güne bölünür", gunlukHiz(ozet, "2026-08-05") === Math.trunc(50000 / 5));

const bakiye = hesapBakiyeleri(
  [
    { id: "banka", ad: "Banka", tur: "banka", renk: "#000", simge: "", acilisKurus: 100000, referans: "", arsiv: false, sira: 1 },
    { id: "kart", ad: "Kart", tur: "kredi", renk: "#000", simge: "", acilisKurus: 0, referans: "", arsiv: false, sira: 2 },
  ] as Hesap[],
  [...defter, islem({ id: "6", kategoriId: "market", tur: "gider", kurus: 25000, tarih: "2026-08-09", hesapId: "kart" })],
);
kontrol(
  "bakiye açılış artı hareketler, transfer dâhil",
  bakiye[0]!.bakiye === 100000 + 900000 - (30000 + 20000 + 500000 + 10000),
  String(bakiye[0]!.bakiye),
);
kontrol("kart borcu eksi bakiyenin karşılığıdır", bakiye[1]!.kartBorcu === 25000);
kontrol("son hareket en yeni tarihtir", bakiye[0]!.sonHareket === "2026-08-05");

const durum = butceDurumu([{ kategoriId: "market", sinirKurus: 40000 }], kategoriler, defter, agustos, "2026-08-31");
kontrol("aşılan bütçe işaretlenir", durum[0]!.asti && durum[0]!.doluluk === 1 && durum[0]!.oran > 1);
kontrol(
  "%85 geçilince yaklaşma uyarısı",
  butceDurumu([{ kategoriId: "market", sinirKurus: 55000 }], kategoriler, defter, agustos, "2026-08-31")[0]!.yaklasti,
);
kontrol("silinmiş kategoriye bakan bütçe satırı düşer", butceDurumu([{ kategoriId: "yok", sinirKurus: 100 }], kategoriler, defter, agustos, "2026-08-31").length === 0);

const trendSatirlari = trend(defter, agustos, 2);
kontrol(
  "trend eskiden yeniye gelir",
  trendSatirlari.length === 2 && trendSatirlari[0]!.gider === 10000 && trendSatirlari[1]!.gider === 50000,
);

const csv = csvUret(defter, kategoriler, [
  { id: "banka", ad: "Banka", tur: "banka", renk: "#000", simge: "", acilisKurus: 0, referans: "", arsiv: false, sira: 1 },
]);
kontrol("csv noktalı virgülle ayrılır", csv.split("\n")[0] === "Tarih;Tür;Hesap;Kategori;Tutar;Ödeme;Karşı Taraf;Not");
kontrol("csv tarihe göre sıralı", csv.split("\n")[1]!.startsWith("2026-07-30"));
kontrol("csv transferi ayrı yazar", csv.includes(";Transfer;"));
kontrol("csv tutarı virgüllü ondalıkla yazar", csv.includes(";300,00;"), csv.split("\n")[3]);
kontrol(
  "csv noktalı virgül taşıyan metni tırnaklar",
  csvUret([islem({ id: "7", kategoriId: "market", tur: "gider", kurus: 100, tarih: "2026-08-01", not: 'a;b"c' })], kategoriler, []).includes('"a;b""c"'),
);

/* --- disk sözleşmesi ----------------------------------------------------- */

console.log("\nDisk sözleşmesi");

const kokDizin = await mkdtemp(join(tmpdir(), "argos-harcama-"));

const ilkYazma = await yaz(kokDizin, "harcama/2026-08.json", { ay: "2026-08", islemler: defter.slice(0, 2) }, null);
kontrol("ay dosyası yazılır (klasör açılır)", ilkYazma.ok === true);

const metin = await readFile(join(kokDizin, "harcama/2026-08.json"), "utf8");
kontrol("dosya sonu satır başıyla biter", metin.endsWith("\n"));
kontrol("iki boşluk girintili", metin.includes('\n  "ay"'));

const geriOkuma = await oku<{ ay: string; islemler: Islem[] }>(kokDizin, "harcama/2026-08.json");
kontrol(
  "gidiş-dönüş kaydı bozmaz",
  JSON.stringify(geriOkuma.veri?.islemler) === JSON.stringify(defter.slice(0, 2)),
);

const listelenen = await listele(kokDizin, "harcama");
kontrol("ay dosyası klasörde listelenir", listelenen.includes("2026-08.json"));

// Tanımlar dosyası da aynı klasörde; ay dosyaları desenle ayrılıyor.
await yaz(kokDizin, "harcama/tanimlar.json", { ayarlar: { simge: "₺" } }, null);
const AY_DESENI = /^\d{4}-\d{2}\.json$/;
kontrol(
  "tanımlar dosyası ay sanılmaz",
  (await listele(kokDizin, "harcama")).filter((d) => AY_DESENI.test(d)).length === 1,
);

const bayat = await yaz(kokDizin, "harcama/2026-08.json", { ay: "2026-08", islemler: [] }, 1);
kontrol("bayat mtime ile yazma reddedilir", bayat.ok === false && bayat.sebep === "cakisma");

await rm(kokDizin, { recursive: true, force: true });

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;

function gunSonrasi(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
