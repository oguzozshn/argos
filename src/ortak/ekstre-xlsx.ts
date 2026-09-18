/**
 * `.xlsx` okuma, dış bağımlılık olmadan. Kaynağın `StatementReader.ReadWorkbook`
 * karşılığı; orada ClosedXML var, burada dosyanın kendisi açılıyor.
 *
 * Bir `.xlsx` aslında bir ZIP: içinde çalışma sayfası, paylaşılan dizgeler ve
 * biçim tablosu XML olarak duruyor. ZIP dizini elle okunuyor, girdiler
 * `DecompressionStream("deflate-raw")` ile açılıyor — hem Chromium'da hem düz
 * Node'da var, yani okuyucu testlerde de koşuyor.
 *
 * XML için ayrıştırıcı yok, küçük bir tarayıcı var: elektronik tablo XML'i dar
 * ve tanıdık (`<c r="A1" t="s"><v>3</v></c>`), `DOMParser` ise yalnızca
 * tarayıcıda bulunurdu.
 */

import { tabloKur, type EkstreTablosu } from "./ekstre.ts";

/** Excel'in gömülü tarih biçimleri. Sayının tarih mi olduğu ancak biçiminden anlaşılır. */
const TARIH_BICIMLERI = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export async function xlsxTablosu(bayt: Uint8Array): Promise<EkstreTablosu> {
  const girdiler = zipDizini(bayt);

  const calismaKitabi = await metinAl(bayt, girdiler, "xl/workbook.xml");
  const iliskiler = await metinAl(bayt, girdiler, "xl/_rels/workbook.xml.rels");
  const sayfaYolu = ilkSayfaYolu(calismaKitabi, iliskiler, girdiler);
  if (!sayfaYolu) return { sutunlar: [], satirlar: [] };

  const [sayfa, paylasilan, bicimler] = await Promise.all([
    metinAl(bayt, girdiler, sayfaYolu),
    metinAl(bayt, girdiler, "xl/sharedStrings.xml"),
    metinAl(bayt, girdiler, "xl/styles.xml"),
  ]);

  const dizgeler = paylasilanDizgeler(paylasilan);
  const tarihMi = tarihBicimleri(bicimler);
  // 1904 sistemi Mac'ten gelen dosyalarda çıkar; kaydırma 1462 gün.
  const bin904 = /date1904="(1|true)"/.test(calismaKitabi);

  return tabloKur(sayfaSatirlari(sayfa, dizgeler, tarihMi, bin904));
}

/* --- ZIP ------------------------------------------------------------------- */

interface ZipGirdisi {
  ad: string;
  yontem: number;
  sikisikBoyut: number;
  yerelKonum: number;
}

const gorunum = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Merkezî dizin, dosyanın sonundaki EOCD kaydından bulunur. */
function zipDizini(bayt: Uint8Array): Map<string, ZipGirdisi> {
  const g = gorunum(bayt);

  let eocd = -1;
  // Yorum alanı en fazla 64 KB; imza oradan geriye taranıyor.
  for (let i = bayt.length - 22; i >= Math.max(0, bayt.length - 65557); i--) {
    if (g.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP dizini bulunamadı — dosya bir .xlsx değil ya da bozuk.");

  const adet = g.getUint16(eocd + 10, true);
  let konum = g.getUint32(eocd + 16, true);

  const girdiler = new Map<string, ZipGirdisi>();
  for (let i = 0; i < adet; i++) {
    if (g.getUint32(konum, true) !== 0x02014b50) break;
    const adUzunluk = g.getUint16(konum + 28, true);
    const ekUzunluk = g.getUint16(konum + 30, true);
    const yorumUzunluk = g.getUint16(konum + 32, true);
    const ad = new TextDecoder().decode(bayt.subarray(konum + 46, konum + 46 + adUzunluk));

    girdiler.set(ad, {
      ad,
      yontem: g.getUint16(konum + 10, true),
      sikisikBoyut: g.getUint32(konum + 20, true),
      yerelKonum: g.getUint32(konum + 42, true),
    });

    konum += 46 + adUzunluk + ekUzunluk + yorumUzunluk;
  }

  return girdiler;
}

async function metinAl(bayt: Uint8Array, girdiler: Map<string, ZipGirdisi>, ad: string): Promise<string> {
  const girdi = girdiler.get(ad);
  if (!girdi) return "";

  const g = gorunum(bayt);
  // Yerel başlığın kendi ad ve ek alan uzunlukları var; veri onların ardında.
  const adUzunluk = g.getUint16(girdi.yerelKonum + 26, true);
  const ekUzunluk = g.getUint16(girdi.yerelKonum + 28, true);
  const bas = girdi.yerelKonum + 30 + adUzunluk + ekUzunluk;
  // Kopyalanıyor: dilim, çözücünün beklediği kendi tamponuna sahip bir dizi olmalı.
  const govde = new Uint8Array(bayt.subarray(bas, bas + girdi.sikisikBoyut));

  if (girdi.yontem === 0) return new TextDecoder().decode(govde);
  if (girdi.yontem !== 8) throw new Error(`Desteklenmeyen ZIP sıkıştırması: ${girdi.yontem}`);

  // Akış doğrudan besleniyor: `pipeThrough`'un tip imzası tarayıcı ve Node
  // kitaplıklarında aynı değil, yazıcı ikisinde de aynı şekilde çalışıyor.
  const cozucu = new DecompressionStream("deflate-raw");
  const yazici = cozucu.writable.getWriter();
  void yazici.write(govde).then(() => yazici.close());

  return new TextDecoder().decode(await new Response(cozucu.readable).arrayBuffer());
}

/**
 * Kitaptaki ilk sayfanın yolu. `sheet1.xml` varsayılmıyor: sayfalar yeniden
 * sıralanmış bir dosyada ilk sekme başka bir dosya olabilir.
 */
function ilkSayfaYolu(calismaKitabi: string, iliskiler: string, girdiler: Map<string, ZipGirdisi>): string | null {
  const sayfa = /<sheet\b[^>]*?\sr:id="([^"]+)"/.exec(calismaKitabi);
  if (sayfa) {
    const hedef = new RegExp(`<Relationship\\b[^>]*?Id="${sayfa[1]}"[^>]*?Target="([^"]+)"`).exec(iliskiler);
    if (hedef) {
      const yol = `xl/${hedef[1]!.replace(/^\/?xl\//, "").replace(/^\//, "")}`;
      if (girdiler.has(yol)) return yol;
    }
  }

  for (const ad of girdiler.keys()) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(ad)) return ad;
  }
  return null;
}

/* --- XML tarayıcıları -------------------------------------------------------- */

const KACISLAR: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function cozXml(metin: string): string {
  return metin.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (tam, kod: string) => {
    if (kod.startsWith("#x") || kod.startsWith("#X")) return String.fromCodePoint(parseInt(kod.slice(2), 16));
    if (kod.startsWith("#")) return String.fromCodePoint(Number(kod.slice(1)));
    return KACISLAR[kod] ?? tam;
  });
}

/**
 * `<t>` parçaları. Boş parça `<t/>` diye yazılabiliyor; `[^>]*` onun eğik
 * çizgisini yutup bir sonraki `</t>`'ye kadar koşmasın diye önce o yakalanır.
 */
function metinParcalari(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*?\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => (t[1] ? cozXml(t[1]) : "")).join("");
}

/** `<si>` başına bütün `<t>` parçaları birleştirilir — zengin metin parçalara bölünmüş olabilir. */
function paylasilanDizgeler(xml: string): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*?\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((e) =>
    e[1] ? metinParcalari(e[1]) : "",
  );
}

/** Biçim indeksi → tarih mi. `cellXfs` sırası hücrelerin `s` özniteliğine karşılık gelir. */
function tarihBicimleri(xml: string): (indeks: number) => boolean {
  if (!xml) return () => false;

  const ozel = new Map<number, string>();
  for (const e of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    ozel.set(Number(e[1]), cozXml(e[2]!));
  }

  const xfler = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const numFmtler = xfler
    ? [...xfler[1]!.matchAll(/<xf\b[^>]*>|<xf\b[^>]*\/>/g)].map((e) => {
        const id = /numFmtId="(\d+)"/.exec(e[0]);
        return id ? Number(id[1]) : 0;
      })
    : [];

  return (indeks: number) => {
    const id = numFmtler[indeks];
    if (id === undefined) return false;
    if (TARIH_BICIMLERI.has(id)) return true;

    const kod = ozel.get(id);
    if (!kod) return false;
    // Tırnak içindeki metin biçim değil; y/m/d harfleri ancak dışarıda sayılır.
    return /[ymd]/.test(kod.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""));
  };
}

/** "AB12" → 27. Hücrenin sütunu adresinden okunuyor: boş hücreler XML'de hiç yazılmıyor. */
function sutunNo(adres: string): number {
  let n = 0;
  for (const harf of adres) {
    const kod = harf.charCodeAt(0);
    if (kod < 65 || kod > 90) break;
    n = n * 26 + (kod - 64);
  }
  return n - 1;
}

function sayfaSatirlari(
  xml: string,
  dizgeler: string[],
  tarihMi: (i: number) => boolean,
  bin904: boolean,
): string[][] {
  const satirlar: string[][] = [];

  for (const satirEsi of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const hucreler: string[] = [];

    for (const hucreEsi of satirEsi[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ozellik = hucreEsi[1]!;
      const govde = hucreEsi[2] ?? "";

      const adres = /r="([A-Z]+)\d+"/.exec(ozellik);
      const sutun = adres ? sutunNo(adres[1]!) : hucreler.length;
      while (hucreler.length < sutun) hucreler.push("");

      hucreler[sutun] = hucreDegeri(ozellik, govde, dizgeler, tarihMi, bin904);
    }

    if (hucreler.some((h) => h.length > 0)) satirlar.push(hucreler);
  }

  return satirlar;
}

/**
 * Tarihler ISO olarak geri yazılıyor ki tarih ayrıştırıcısı tartışmasız bir
 * değer görsün; sayılar para ayrıştırıcısının tartışmasız okuduğu virgüllü biçimde.
 */
function hucreDegeri(
  ozellik: string,
  govde: string,
  dizgeler: string[],
  tarihMi: (i: number) => boolean,
  bin904: boolean,
): string {
  const tur = /t="([^"]+)"/.exec(ozellik)?.[1] ?? "n";

  if (tur === "inlineStr") {
    return metinParcalari(govde).trim();
  }

  const ham = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(govde)?.[1];
  if (ham === undefined) return "";

  if (tur === "s") return (dizgeler[Number(ham)] ?? "").trim();
  if (tur === "str" || tur === "e") return cozXml(ham).trim();
  if (tur === "b") return ham === "1" ? "1" : "0";

  const sayi = Number(ham);
  if (!Number.isFinite(sayi)) return cozXml(ham).trim();

  const bicim = Number(/s="(\d+)"/.exec(ozellik)?.[1] ?? -1);
  if (bicim >= 0 && tarihMi(bicim) && sayi > 0) return seriyiIso(sayi, bin904);

  // "0.############" — gereksiz sıfır kuyruğu yok. Ondalık ayracı virgül:
  // para ayrıştırıcısı noktadan sonra tam üç rakamı binlik sayıyor, "12.345"
  // 12,345 ₺ değil 12.345 ₺ okunurdu. Hücrede binlik ayracı hiç yok, virgül
  // tartışmasız ondalık.
  return String(Number(sayi.toFixed(12))).replace(".", ",");
}

/**
 * Excel'in gün sayacı. 1900 sisteminde var olmayan 29 Şubat 1900 seri 60'ta
 * duruyor; 61'den sonrası bir gün geri alınarak gerçek takvime oturuyor.
 */
function seriyiIso(seri: number, bin904: boolean): string {
  const gun = Math.floor(seri);
  // 1904 sisteminde sayaç 1 Ocak 1904'te 0'dan başlıyor ve sahte artık gün yok.
  if (bin904) return new Date(Date.UTC(1904, 0, 1) + gun * 86400000).toISOString().slice(0, 10);
  const duzeltilmis = gun >= 61 ? gun - 1 : gun;
  const tarih = new Date(Date.UTC(1899, 11, 31) + duzeltilmis * 86400000);
  return tarih.toISOString().slice(0, 10);
}
