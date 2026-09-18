/**
 * Ekstre içe aktarma testi: `node araclar/ekstre-testi.mts`
 *
 * İddiaların çoğu ExpenseTracker'ın kendi testlerinden geliyor
 * (Tests/StatementValueTests, StatementReaderTests, ImportDedupeTests).
 *
 * Bu takımın asıl işi mükerrer yakalamayı kilitlemek: bankalar her seferinde son
 * doksan günü veriyor, örtüşen ekstreleri arka arkaya yüklemek zararsız olmak
 * zorunda — ama aynı gün aynı yerde yapılan iki ayrı alışveriş de iki satır
 * olarak kalmalı.
 */

import {
  ayraciSez,
  metinCoz,
  metinIcerir,
  normalizeMetin,
  satirBol,
  sutunTahmini,
  tabloOku,
  ekstreTarihi,
  ekstreTutari,
  borcAlacakKullanir,
  eslemTam,
  hucre,
  type SutunEslemi,
} from "../src/ortak/ekstre.ts";
import {
  gecerli,
  hazir,
  islemeCevir,
  kategoriCoz,
  kuralYerlestir,
  onizlemeKur,
  onizlemeOzeti,
  parmakIzi,
  satirTuru,
  tersGorunuyor,
  tohumKurallari,
  type Kural,
  type Satir,
} from "../src/ortak/ekstre-aktar.ts";
import { xlsxTablosu } from "../src/ortak/ekstre-xlsx.ts";
import type { Kategori } from "../src/ortak/harcama.ts";
import { crc32, deflateRawSync } from "node:zlib";

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

/* --- tarih ve tutar -------------------------------------------------------- */

console.log("Bankaların yazdığı tarihler");
for (const girdi of [
  "03.08.2026",
  "3.8.2026",
  "03/08/2026",
  "03-08-2026",
  "2026-08-03",
  "03.08.2026 14:22",
  "2026-08-03T00:00:00",
  "3 Ağustos 2026",
]) {
  kontrol(`"${girdi}" → 2026-08-03`, ekstreTarihi(girdi) === "2026-08-03", String(ekstreTarihi(girdi)));
}
for (const girdi of ["", "Toplam", "--"]) {
  kontrol(`"${girdi}" tarih değil`, ekstreTarihi(girdi) === null);
}
kontrol("olmayan gün reddedilir", ekstreTarihi("31.02.2026") === null);
kontrol("iki haneli yıl", ekstreTarihi("03.08.26") === "2026-08-03");

console.log("\nEkstrenin negatifi yazma biçimleri");
for (const [girdi, beklenen] of [
  ["1.234,56", 123456],
  ["-1.234,56", -123456],
  ["1.234,56-", -123456],
  ["(1.234,56)", -123456],
  ["+1.234,56", 123456],
  ["1.234,56 TL", 123456],
  ["-18.500,00 ₺", -1850000],
  // Para birimi parantezin dışında kalınca da negatif.
  ["(1.234,56) TL", -123456],
  ["TL (1.234,56)", -123456],
  // U+2212: uygulamanın kendi tutar metninin eksisi.
  ["−1.234,56", -123456],
] as [string, number][]) {
  kontrol(`"${girdi}" → ${beklenen}`, ekstreTutari(girdi) === beklenen, String(ekstreTutari(girdi)));
}
kontrol("boş tutar sıfır değildir", ekstreTutari("") === null && ekstreTutari("   ") === null);

console.log("\nTürkçe harf katlama");
for (const [girdi, beklenen] of [
  ["MİGROS", "MIGROS"],
  ["migros  ticaret", "MIGROS TICARET"],
  ["ŞOK  MARKET", "SOK MARKET"],
  ["Getir Yemek", "GETIR YEMEK"],
  ["  A101  ", "A101"],
] as [string, string][]) {
  kontrol(`"${girdi}" → "${beklenen}"`, normalizeMetin(girdi) === beklenen, normalizeMetin(girdi));
}
kontrol(
  "eşleşme büyük/küçük ve Türkçe harf farkını yok sayar",
  metinIcerir("MİGROS KADIKÖY", "migros") &&
    metinIcerir("Şok Market Beşiktaş", "SOK MARKET") &&
    !metinIcerir("MIGROS", "CARREFOUR") &&
    !metinIcerir("MIGROS", ""),
);

/* --- dosya okuma ------------------------------------------------------------ */

console.log("\nDosya okuma");

kontrol(
  "tırnak içindeki ayraç alanı bölmez",
  JSON.stringify(satirBol('03.08.2026;"MIGROS; KADIKOY";-125,40', ";")) ===
    JSON.stringify(["03.08.2026", "MIGROS; KADIKOY", "-125,40"]),
);
kontrol(
  "çift tırnak gerçek tırnaktır",
  JSON.stringify(satirBol('"A ""B"" C";1', ";")) === JSON.stringify(['A "B" C', "1"]),
);
kontrol(
  "başlık bloğundaki virgüller noktalı virgülü yenmez",
  ayraciSez([
    "Musteri: Ali, Veli, Adres: X Mah., Y Sok., No 5, Kadikoy",
    "Tarih;Aciklama;Tutar;Bakiye",
    "03.08.2026;MIGROS;-1.234,56;10.000,00",
    "04.08.2026;SHELL;-500,00;9.500,00",
  ]) === ";",
);
kontrol(
  "dosya boyunca tutarlı olan ayraç seçilir",
  ayraciSez([
    "Tarih;Açıklama;Tutar",
    "03.08.2026;MIGROS, KADIKOY;-125,40",
    "04.08.2026;SHELL, ATASEHIR;-1.200,00",
  ]) === ";",
);

{
  const tablo = tabloOku(
    [
      "GARANTİ BBVA",
      "Hesap No: 1234-5678",
      "Dönem: 01.08.2026 - 31.08.2026",
      "",
      "Tarih;Açıklama;Tutar;Bakiye",
      "03.08.2026;MIGROS KADIKOY;-125,40;4.874,60",
      "04.08.2026;MAAS ODEMESI;25.000,00;29.874,60",
    ].join("\n"),
  );
  kontrol(
    "antet atlanır, gerçek başlık bulunur",
    JSON.stringify(tablo.sutunlar) === JSON.stringify(["Tarih", "Açıklama", "Tutar", "Bakiye"]),
    tablo.sutunlar.join(","),
  );
  kontrol("antet satırları gövdeye karışmaz", tablo.satirlar.length === 2);
  kontrol("hücre okunur", hucre(tablo.satirlar[0]!, 1) === "MIGROS KADIKOY");
}

{
  // windows-1254 baytları: "ŞOK MARKET ÜSKÜDAR"
  const metin = "Tarih;Açıklama;Tutar\n03.08.2026;ŞOK MARKET ÜSKÜDAR;-99,90";
  const bayt = new Uint8Array(
    [...metin].map((c) => {
      const tablo: Record<string, number> = { Ş: 0xde, ş: 0xfe, İ: 0xdd, ı: 0xfd, Ü: 0xdc, ü: 0xfc, Ö: 0xd6, ö: 0xf6, Ç: 0xc7, ç: 0xe7, Ğ: 0xd0, ğ: 0xf0 };
      return tablo[c] ?? c.charCodeAt(0);
    }),
  );
  const tablo = tabloOku(metinCoz(bayt));
  kontrol(
    "windows-1254 Türkçe harfleri bozmadan okunur",
    hucre(tablo.satirlar[0]!, 1) === "ŞOK MARKET ÜSKÜDAR",
    hucre(tablo.satirlar[0]!, 1),
  );
}

{
  const govde = new TextEncoder().encode("Tarih;Açıklama;Tutar\n03.08.2026;MİGROS;-1,00");
  const bomlu = new Uint8Array([0xef, 0xbb, 0xbf, ...govde]);
  const tablo = tabloOku(metinCoz(bomlu));
  kontrol("BOM'lu UTF-8 temiz okunur", tablo.sutunlar[0] === "Tarih" && hucre(tablo.satirlar[0]!, 1) === "MİGROS");
}

console.log("\nSütun tahmini");
{
  const e = sutunTahmini(["İşlem Tarihi", "Valör", "Açıklama", "Tutar", "Bakiye"]);
  kontrol(
    "tek tutar sütunlu ekstre",
    e.tarih === 0 && e.aciklama === 2 && e.tutar === 3 && !borcAlacakKullanir(e) && eslemTam(e),
    JSON.stringify(e),
  );
}
{
  const e = sutunTahmini(["Tarih", "Açıklama", "Borç", "Alacak", "Bakiye"]);
  kontrol(
    "borç/alacak sütunlu ekstre",
    e.tarih === 0 && e.aciklama === 1 && e.borc === 2 && e.alacak === 3 && borcAlacakKullanir(e) && eslemTam(e),
    JSON.stringify(e),
  );
}
{
  const e = sutunTahmini(["Tarih", "Açıklama", "Bakiye Tutarı"]);
  kontrol("bakiye sütunu tutar sanılmaz", e.tutar === -1 && !eslemTam(e));
}

/* --- parmak izi ------------------------------------------------------------- */

console.log("\nParmak izi");
kontrol(
  "bilinen anahtar için sabit (ExpenseTracker ile aynı)",
  (await parmakIzi("2026-08-03|-12540|MIGROS KADIKOY|1")) === "764432106EB54B2D02704DAC050BB7A3",
  await parmakIzi("2026-08-03|-12540|MIGROS KADIKOY|1"),
);

/* --- içe aktarma ------------------------------------------------------------- */

console.log("\nİçe aktarma");

const KATEGORILER: Kategori[] = [
  { id: "market", ad: "Market", tur: "gider", renk: "#000", simge: "", arsiv: false, sira: 1 },
  { id: "maas", ad: "Maaş", tur: "gelir", renk: "#000", simge: "", arsiv: false, sira: 1 },
  { id: "transfer-gider", ad: "Hesaplar arası", tur: "gider", renk: "#000", simge: "", arsiv: false, sira: 2 },
  { id: "transfer-gelir", ad: "Hesaplar arası", tur: "gelir", renk: "#000", simge: "", arsiv: false, sira: 2 },
];

const ESLEM: SutunEslemi = { tarih: 0, aciklama: 1, tutar: 2, borc: -1, alacak: -1, tersCevir: false };

const EKSTRE = tabloOku(
  [
    "Tarih;Açıklama;Tutar",
    "03.08.2026;MIGROS KADIKOY;-125,40",
    "03.08.2026;KAHVE DUNYASI;-85,00",
    // Aynı gün aynı kahve iki kez: iki satır, bir değil.
    "03.08.2026;KAHVE DUNYASI;-85,00",
    "04.08.2026;MAAS ODEMESI;25.000,00",
  ].join("\n"),
);

const kur = (tablo = EKSTRE, izler = new Set<string>(), kurallar: Kural[] = [], eslem = ESLEM) =>
  onizlemeKur(tablo, eslem, izler, kurallar, KATEGORILER);

{
  const satirlar = await kur();
  const ozet = onizlemeOzeti(satirlar);
  kontrol("her satır okunur ve yönü işaretlenir", ozet.gecerli === 4 && ozet.hatali === 0);
  kontrol("üç gider bir gelir", satirlar.filter((s) => satirTuru(s) === "gider").length === 3);
  kontrol(
    "gelir satırının tutarı",
    satirlar.filter((s) => satirTuru(s) === "gelir")[0]!.isaretliKurus === 2500000,
  );

  const kahveler = satirlar.filter((s) => s.aciklama.includes("KAHVE"));
  kontrol("aynı iki alışveriş iki parmak izi alır", kahveler.length === 2 && kahveler[0]!.iz !== kahveler[1]!.iz);
}

{
  // Aynı dosya ikinci kez: hepsi mükerrer.
  const ilk = await kur();
  const izler = new Set(ilk.map((s) => s.iz));
  const ikinci = await kur(EKSTRE, izler);
  const ozet = onizlemeOzeti(ikinci);
  kontrol("aynı dosya ikinci kez hiçbir şey yazmaz", ozet.mukerrer === 4 && ozet.hazir === 0);

  // Örtüşen ekstre: yalnızca yeni satır hazır.
  const ortusen = tabloOku(
    ["Tarih;Açıklama;Tutar", "04.08.2026;MAAS ODEMESI;25.000,00", "05.08.2026;SHELL ATASEHIR;-1.200,00"].join("\n"),
  );
  const ucuncu = await kur(ortusen, izler);
  for (const s of ucuncu) s.kategoriId = "market";
  const ozet3 = onizlemeOzeti(ucuncu);
  kontrol("örtüşen ekstre yalnızca yeniyi ekler", ozet3.mukerrer === 1 && ozet3.hazir === 1);

  // Geri alma: izler defterden gidince aynı dosya yeniden aktarılabilir.
  const geriAlinmis = await kur(EKSTRE, new Set());
  kontrol("geri alınınca yeniden aktarılabilir", onizlemeOzeti(geriAlinmis).mukerrer === 0);
}

{
  const satirlar = await kur();
  kontrol("kategorisiz satır yazılmaz", islemeCevir(satirlar, "banka", "p1", "2026-09-11T10:00:00Z").length === 0);
  kontrol("kategorisiz satırlar özette sayılır", onizlemeOzeti(satirlar).kategorisiz === 4);

  for (const s of satirlar) s.kategoriId = satirTuru(s) === "gelir" ? "maas" : "market";
  const islemler = islemeCevir(satirlar, "banka", "p1", "2026-09-11T10:00:00Z");
  kontrol("hazır satırlar işleme çevrilir", islemler.length === 4);
  kontrol(
    "işlem partiyi, izi ve hesabı taşır",
    islemler.every((i) => i.partiId === "p1" && i.hesapId === "banka" && (i.ekstreIzi ?? "").length === 32),
  );
  kontrol("tutar artıya çevrilir, yönü tür taşır", islemler.every((i) => i.kurus > 0));
  kontrol(
    "açıklama karşı tarafa yazılır",
    islemler[0]!.karsiTaraf === "MIGROS KADIKOY" && islemler[0]!.odeme === "kart",
  );

  satirlar[0]!.dahil = false;
  kontrol("işaretlenmeyen satır dışarıda kalır", islemeCevir(satirlar, "banka", "p1", "2026-09-11T10:00:00Z").length === 3);
}

{
  // Kredi kartı harcamaları artı yazar; sezgi çoğunluğa bakıyor, tek satıra değil.
  const kart = tabloOku(
    [
      "Tarih;Açıklama;Tutar",
      "03.08.2026;MIGROS KADIKOY;125,40",
      "05.08.2026;KAHVE DUNYASI;85,00",
      "07.08.2026;SHELL ATASEHIR;200,00",
      "10.08.2026;KREDI KARTI ODEMESI;-5.000,00",
    ].join("\n"),
  );
  const duz = await kur(kart);
  kontrol("kart ekstresi ters görünüyor olarak sezilir", tersGorunuyor(duz, "kredi"));
  kontrol("banka hesabında sezgi çalışmaz", !tersGorunuyor(duz, "banka"));

  const cevrilmis = await kur(kart, new Set(), [], { ...ESLEM, tersCevir: true });
  kontrol(
    "işaret çevrilince harcama gider olur",
    satirTuru(cevrilmis[0]!) === "gider" && Math.abs(cevrilmis[0]!.isaretliKurus) === 12540,
  );
  kontrol("kart ödemesi gelir tarafında kalır", satirTuru(cevrilmis[3]!) === "gelir");
  kontrol(
    "tek harcamalı dosyada çoğunluk oluşmazsa ters denmez",
    !tersGorunuyor(await kur(tabloOku(["Tarih;Açıklama;Tutar", "03.08.2026;MIGROS;125,40", "10.08.2026;ODEME;-5.000,00"].join("\n"))), "kredi"),
  );
}

{
  // "Market" bir gider kategorisi, satır gelir: hiçbir şey tahmin edilmez.
  const kurallar: Kural[] = [{ id: "k1", icerir: "IADE", kategoriId: "market", transfer: false, kullanim: 0 }];
  const iade = tabloOku(["Tarih;Açıklama;Tutar", "03.08.2026;IADE MIGROS;125,40"].join("\n"));
  const satirlar = await kur(iade, new Set(), kurallar);
  kontrol(
    "kural geliri gider kategorisine yazmaz",
    satirTuru(satirlar[0]!) === "gelir" && satirlar[0]!.kategoriId === "" && onizlemeOzeti(satirlar).hazir === 0,
  );
}

{
  const kurallar: Kural[] = [
    { id: "k1", icerir: "KREDI KARTI ODEMESI", kategoriId: "transfer-gider", transfer: true, kullanim: 0 },
  ];
  const tablo = tabloOku(
    [
      "Tarih;Açıklama;Tutar",
      "10.08.2026;KREDI KARTI ODEMESI;-8.500,00",
      "10.09.2026;KREDI KARTI ODEMESI;8.500,00",
    ].join("\n"),
  );
  const satirlar = await kur(tablo, new Set(), kurallar);
  kontrol(
    "transfer kuralı ters yönde ikiz kategoriyi kullanır",
    satirlar[0]!.kategoriId === "transfer-gider" && satirlar[1]!.kategoriId === "transfer-gelir",
  );
  kontrol("iki uç da transfer işaretli", satirlar.every((s) => s.transfer));
}

{
  const bozuk = tabloOku(["Tarih;Açıklama;Tutar", "03.08.2026;MIGROS;-125,40", "TOPLAM;;-125,40"].join("\n"));
  const satirlar = await kur(bozuk);
  kontrol(
    "ayrıştırılamayan satır düşürülmez, bildirilir",
    satirlar.length === 2 && onizlemeOzeti(satirlar).hatali === 1 && satirlar[1]!.hata !== null,
    satirlar[1]?.hata ?? "",
  );
  kontrol("sıfır tutar da hata sayılır", gecerli(satirlar[0]!));
}

{
  // Borç/alacak ayrı sütunlarda: borç çıkar, alacak girer.
  const tablo = tabloOku(
    ["Tarih;Açıklama;Borç;Alacak", "03.08.2026;MIGROS;125,40;", "04.08.2026;MAAS;;25.000,00"].join("\n"),
  );
  const eslem: SutunEslemi = { tarih: 0, aciklama: 1, tutar: -1, borc: 2, alacak: 3, tersCevir: false };
  const satirlar = await kur(tablo, new Set(), [], eslem);
  kontrol(
    "borç/alacak sütunları yönü belirler",
    satirlar[0]!.isaretliKurus === -12540 && satirlar[1]!.isaretliKurus === 2500000,
    JSON.stringify(satirlar.map((s) => s.isaretliKurus)),
  );
}

kontrol("eksik eşlemle önizleme kurulmaz", (await kur(EKSTRE, new Set(), [], { ...ESLEM, tarih: -1 })).length === 0);

/* --- kurallar ---------------------------------------------------------------- */

console.log("\nKurallar");

{
  const tohumlar = tohumKurallari(KATEGORILER);
  kontrol("tohum kurallar mevcut kategorilere bağlanır", tohumlar.length > 0);
  kontrol("kategorisi olmayan grup atlanır", tohumlar.every((k) => KATEGORILER.some((c) => c.id === k.kategoriId)));
  kontrol("desenler normalleştirilmiş saklanır", tohumlar.every((k) => k.icerir === normalizeMetin(k.icerir)));
  kontrol("aynı desen iki kez girmez", new Set(tohumlar.map((k) => k.icerir)).size === tohumlar.length);
  kontrol(
    "transfer desenleri işaretli gelir",
    tohumlar.some((k) => k.icerir === "KREDI KARTI ODEMESI" && k.transfer),
  );
}

{
  const ilk = kuralYerlestir([], { icerir: "migros", kategoriId: "market", transfer: false }, "k1")!;
  kontrol("yeni kural normalleştirilerek eklenir", ilk.length === 1 && ilk[0]!.icerir === "MIGROS");

  const guncel = kuralYerlestir(ilk, { icerir: "MİGROS", kategoriId: "transfer-gider", transfer: true }, "k2")!;
  kontrol(
    "aynı desen ikinci kez eklenmez, yeniden yönlendirilir",
    guncel.length === 1 && guncel[0]!.kategoriId === "transfer-gider" && guncel[0]!.transfer,
  );
  kontrol("çok kısa desen reddedilir", kuralYerlestir(ilk, { icerir: "a", kategoriId: "market", transfer: false }, "k3") === null);
}

kontrol(
  "kategori çözümü olmayan kategoriye null döner",
  kategoriCoz(KATEGORILER, "yok", "gider") === "" && kategoriCoz(KATEGORILER, "market", "gider") === "market",
);


/* --- xlsx -------------------------------------------------------------------- */

console.log("\nxlsx");

/**
 * Test için elle bir .xlsx kuruluyor: okuyucunun ZIP dizinini, paylaşılan
 * dizgeleri, satır içi metni, tarih biçimini ve sıkıştırılmamış girdiyi
 * gerçekten çözdüğünü görmek için. Dış bağımlılık yok — zip de elle yazılıyor.
 */
function xlsxKur(dosyalar: Record<string, string>, sikistirmasiz: string[] = []): Uint8Array {
  const kodla = (m: string) => new TextEncoder().encode(m);
  const parcalar: Uint8Array[] = [];
  const dizin: Uint8Array[] = [];
  let konum = 0;

  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];

  for (const [ad, icerik] of Object.entries(dosyalar)) {
    const ham = kodla(icerik);
    const saklanan = sikistirmasiz.includes(ad);
    const govde = saklanan ? ham : new Uint8Array(deflateRawSync(ham));
    const adBayt = kodla(ad);
    const kontrol = crc32(ham);

    const yerel = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(saklanan ? 0 : 8), ...u16(0), ...u16(0),
      ...u32(kontrol), ...u32(govde.length), ...u32(ham.length), ...u16(adBayt.length), ...u16(0),
      ...adBayt,
    ]);

    dizin.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(saklanan ? 0 : 8), ...u16(0), ...u16(0),
        ...u32(kontrol), ...u32(govde.length), ...u32(ham.length), ...u16(adBayt.length),
        ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(konum), ...adBayt,
      ]),
    );

    parcalar.push(yerel, govde);
    konum += yerel.length + govde.length;
  }

  const dizinBoyut = dizin.reduce((a, d) => a + d.length, 0);
  const son = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(dizin.length), ...u16(dizin.length),
    ...u32(dizinBoyut), ...u32(konum), ...u16(0),
  ]);

  const tumu = [...parcalar, ...dizin, son];
  const cikti = new Uint8Array(tumu.reduce((a, p) => a + p.length, 0));
  let yer = 0;
  for (const p of tumu) {
    cikti.set(p, yer);
    yer += p.length;
  }
  return cikti;
}

const ORNEK_XLSX = xlsxKur(
  {
    "xl/workbook.xml":
      '<workbook xmlns:r="r"><sheets><sheet name="Ekstre" sheetId="1" r:id="rId7"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId7" Target="worksheets/sayfa.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      '<sst count="4"><si><t>Tarih</t></si><si><t>Açıklama</t></si><si><t>Tutar</t></si>' +
      '<si><r><t>M&#304;GROS </t></r><r><t>KADIK&#214;Y</t></r></si></sst>',
    "xl/styles.xml":
      '<styleSheet><numFmts><numFmt numFmtId="165" formatCode="dd\\.mm\\.yyyy"/></numFmts>' +
      '<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="165"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    "xl/worksheets/sayfa.xml":
      "<worksheet><sheetData>" +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2" s="1"><v>46237</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-125.4</v></c></row>' +
      '<row r="3"><c r="A3" s="2"><v>59</v></c><c r="B3" t="inlineStr"><is><t>&#350;OK MARKET</t></is></c>' +
      '<c r="C3"><f>1+1</f><v>-85</v></c></row>' +
      // Boş B sütunu: hücre XML'de hiç yazılmıyor, adresten doldurulmalı.
      '<row r="4"><c r="A4" s="2"><v>61</v></c><c r="C4"><v>1250.5</v></c></row>' +
      "</sheetData></worksheet>",
  },
  ["xl/_rels/workbook.xml.rels"],
);

{
  const tablo = await xlsxTablosu(ORNEK_XLSX);

  kontrol(
    "paylaşılan dizgeler başlık olur",
    JSON.stringify(tablo.sutunlar) === JSON.stringify(["Tarih", "Açıklama", "Tutar"]),
    tablo.sutunlar.join(","),
  );
  kontrol("gövde satırları okunur", tablo.satirlar.length === 3, String(tablo.satirlar.length));
  kontrol(
    "özel biçimli tarih ISO'ya çevrilir",
    hucre(tablo.satirlar[0]!, 0) === "2026-08-03",
    hucre(tablo.satirlar[0]!, 0),
  );
  kontrol(
    "zengin metin parçaları birleşir",
    hucre(tablo.satirlar[0]!, 1) === "MİGROS KADIKÖY",
    hucre(tablo.satirlar[0]!, 1),
  );
  kontrol("sayı virgül ondalıkla gelir", hucre(tablo.satirlar[0]!, 2) === "-125,4", hucre(tablo.satirlar[0]!, 2));
  kontrol("satır içi metin okunur", hucre(tablo.satirlar[1]!, 1) === "ŞOK MARKET", hucre(tablo.satirlar[1]!, 1));
  kontrol("formül sonucu değeri kullanılır", hucre(tablo.satirlar[1]!, 2) === "-85");
  // 1900'ün var olmayan 29 Şubat'ı seri 60'ta duruyor; iki yanı da doğru düşmeli.
  kontrol("gömülü tarih biçimi ve 1900 kayması", hucre(tablo.satirlar[1]!, 0) === "1900-02-28", hucre(tablo.satirlar[1]!, 0));
  kontrol("60'tan sonraki seri bir gün geri alınır", hucre(tablo.satirlar[2]!, 0) === "1900-03-01", hucre(tablo.satirlar[2]!, 0));
  kontrol("yazılmamış hücre boş gelir", hucre(tablo.satirlar[2]!, 1) === "" && hucre(tablo.satirlar[2]!, 2) === "1250,5");
}

{
  const tablo = await xlsxTablosu(ORNEK_XLSX);
  const eslem = sutunTahmini(tablo.sutunlar);
  const satirlar = await onizlemeKur(tablo, eslem, new Set(), [], KATEGORILER);
  kontrol(
    "xlsx tablosu doğrudan önizlemeye girer",
    satirlar.length === 3 && satirlar[0]!.tarih === "2026-08-03" && satirlar[0]!.isaretliKurus === -12540,
    JSON.stringify(satirlar.map((s) => [s.tarih, s.isaretliKurus, s.hata])),
  );
}

{
  // Excel boş ama biçimli hücreyi `<c .../>` diye yazıyor, boş dizgeyi de
  // `<si/>`. İkisi de sonraki hücreleri kaydırıyordu.
  const tablo = await xlsxTablosu(
    xlsxKur({
      "xl/workbook.xml":
        '<workbook xmlns:r="r"><workbookPr date1904="1"/><sheets><sheet name="E" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/s.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        '<sst><si><t>Tarih</t></si><si/><si><t>Açıklama</t></si><si><t>Tutar</t></si><si><t>MIGROS</t></si></sst>',
      "xl/styles.xml": '<styleSheet><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="0"/></cellXfs></styleSheet>',
      "xl/worksheets/s.xml":
        "<worksheet><sheetData>" +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="2"/><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
        '<row r="2"><c r="A2" s="1"><v>1</v></c><c r="B2" s="2"/><c r="C2" t="s"><v>4</v></c><c r="D2"><v>-12.345</v></c></row>' +
        '<row r="3"><c r="A3" s="1"><v>44774</v></c><c r="B3" t="s"><v>1</v></c><c r="C3" t="inlineStr"><is><t/></is></c><c r="D3"><v>5</v></c></row>' +
        "</sheetData></worksheet>",
    }),
  );
  kontrol(
    "boş biçimli hücre sonrakileri kaydırmaz",
    JSON.stringify(tablo.sutunlar) === JSON.stringify(["Tarih", "Sütun 2", "Açıklama", "Tutar"]) &&
      hucre(tablo.satirlar[0]!, 1) === "" &&
      hucre(tablo.satirlar[0]!, 2) === "MIGROS",
    JSON.stringify([tablo.sutunlar, tablo.satirlar]),
  );
  kontrol("boş <si/> sonraki dizgeleri kaydırmaz", hucre(tablo.satirlar[1]!, 1) === "", hucre(tablo.satirlar[1]!, 1));
  kontrol(
    "üç ondalıklı sayı binlik sanılmaz",
    ekstreTutari(hucre(tablo.satirlar[0]!, 3)) === -1235,
    `${hucre(tablo.satirlar[0]!, 3)} → ${ekstreTutari(hucre(tablo.satirlar[0]!, 3))}`,
  );
  kontrol("1904 sisteminde seri 1 = 1904-01-02", hucre(tablo.satirlar[0]!, 0) === "1904-01-02", hucre(tablo.satirlar[0]!, 0));
  kontrol("1904 sisteminde 44774 = 2026-08-02", hucre(tablo.satirlar[1]!, 0) === "2026-08-02", hucre(tablo.satirlar[1]!, 0));
}

kontrol(
  "bozuk dosya anlaşılır hata verir",
  await (async () => {
    try {
      await xlsxTablosu(new TextEncoder().encode("bu bir xlsx değil"));
      return false;
    } catch (e) {
      return e instanceof Error && e.message.includes("ZIP");
    }
  })(),
);

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;

// Satır tipinin dışa vurduğu yardımcıların kullanıldığı yer: derleyici de görsün.
void (null as unknown as Satir);
void hazir;
