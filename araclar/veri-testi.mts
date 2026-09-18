/**
 * Veri katmanı testi. Electron gerektirmez: `node araclar/veri-testi.ts`
 *
 * Test edilen şey, bu tasarımdaki tek gerçek veri kaybı riski: aynı `data/`
 * klasörüne iki uygulama yazıyor (Argos ve eski app.py). Yazma sırasında
 * dosya dışarıdan değiştiyse üzerine yazılmamalı.
 */

import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ayarCoz, listele, oku, sil, tamYol, yaz } from "../src/main/veri-cekirdek.ts";
import { disDegisimBekcisi, sirali } from "../src/ortak/sirali.ts";

let gecen = 0;
let kalan = 0;
let atlanan = 0;

function kontrol(ad: string, kosul: boolean, ek = ""): void {
  if (kosul) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}${ek ? " — " + ek : ""}`);
  }
}

/**
 * Bu platformda anlamı olmayan iddia. Geçmiş sayılmıyor: sayıya karışsa
 * koşulmayan bir şey koşmuş gibi görünürdü, sebebi de kaybolurdu.
 */
function atla(ad: string, sebep: string): void {
  atlanan++;
  console.log(`  ⊘ ${ad} — ${sebep}`);
}

async function calis(): Promise<void> {
  const kokDizin = await mkdtemp(join(tmpdir(), "argos-test-"));
  console.log("Geçici veri klasörü:", kokDizin, "\n");

  console.log("Yol kilidi");
  const kacmayiDene = (kotu: string): boolean => {
    try {
      tamYol(kokDizin, kotu);
      return false;
    } catch {
      return true;
    }
  };

  for (const kotu of ["../disari.json", "a/../../disari.json"]) {
    kontrol(`"${kotu}" reddedilir`, kacmayiDene(kotu));
  }

  // Ters bölü yalnızca Windows'ta yol ayracı. Başka yerde dosya adının bir
  // parçası: `resolve` onu klasörün İÇİNDE, adında ters bölü olan bir dosya
  // olarak çözüyor — yani kaçış denemesi değil, kilidin yakalayacağı bir şey
  // de yok. Uygulamanın hedefi Windows olduğu için iddia orada koşuyor.
  const tersBolu = "..\\disari.json";
  if (process.platform === "win32") {
    kontrol(`"${tersBolu}" reddedilir`, kacmayiDene(tersBolu));
  } else {
    atla(`"${tersBolu}" reddedilir`, "ters bölü yalnızca Windows'ta yol ayracı");
    kontrol(
      `"${tersBolu}" burada klasörün içinde kalıyor`,
      tamYol(kokDizin, tersBolu).startsWith(kokDizin + "/"),
    );
  }
  kontrol("normal yol kabul edilir", tamYol(kokDizin, "hobiler/a.json").startsWith(kokDizin));
  kontrol("adı iki noktayla başlayan dosya klasörün içindedir", !kacmayiDene("..notlar.json"));
  if (process.platform === "win32") {
    // Sürücü kökünde `kok + sep` "D:\\" olurdu ve her yol dışarıda sayılırdı.
    kontrol("sürücü kökü veri klasörü olabilir", tamYol("D:\\", "a.json") === "D:\\a.json");
    const kokKacis = (() => {
      try {
        tamYol("D:\\x", "..\\..\\y.json");
        return false;
      } catch {
        return true;
      }
    })();
    kontrol("sürücü kökünden de kaçılamaz", kokKacis);
  } else {
    kontrol("dosya sistemi kökü veri klasörü olabilir", tamYol("/", "a.json") === "/a.json");
  }

  console.log("\nOkuma");
  const yokOkuma = await oku(kokDizin, "yok.json");
  kontrol("olmayan dosya hata değil", yokOkuma.veri === null && yokOkuma.mtime === null);

  console.log("\nYazma");
  const ilk = await yaz(kokDizin, "hobiler/oyunlar.json", { ad: "Oyunlar", maddeler: [] }, null);
  kontrol("yeni dosya yazılır (klasör açılır)", ilk.ok === true);

  const okundu = await oku<{ ad: string }>(kokDizin, "hobiler/oyunlar.json");
  kontrol("yazılan geri okunur", okundu.veri?.ad === "Oyunlar");
  kontrol("mtime döner", typeof okundu.mtime === "number");

  const metin = await readFile(join(kokDizin, "hobiler/oyunlar.json"), "utf8");
  kontrol("dosya sonu satır başıyla biter (app.py biçimi)", metin.endsWith("\n"));
  kontrol("iki boşluk girintili", metin.includes('\n  "ad"'));

  console.log("\nÇakışma");
  // Aynı mtime ile ikinci yazma: normal düzenleme akışı, geçmeli.
  const ikinci = await yaz(
    kokDizin,
    "hobiler/oyunlar.json",
    { ad: "Oyunlar", maddeler: [{ id: "1" }] },
    okundu.mtime,
  );
  kontrol("güncel mtime ile yazma geçer", ikinci.ok === true);

  // Dışarıdan değiştir (eski app.py / sabah mutabakatı gibi), sonra bayat
  // mtime ile yazmayı dene: reddedilmeli ve dosya bozulmamalı.
  await new Promise((r) => setTimeout(r, 20));
  await writeFile(
    join(kokDizin, "hobiler/oyunlar.json"),
    JSON.stringify({ ad: "Oyunlar", maddeler: [{ id: "disaridan" }] }, null, 2) + "\n",
    "utf8",
  );

  const bayat = await yaz(kokDizin, "hobiler/oyunlar.json", { ad: "EZİLDİ" }, okundu.mtime);
  kontrol("bayat mtime ile yazma reddedilir", bayat.ok === false);
  kontrol(
    "red sebebi çakışma",
    bayat.ok === false && bayat.sebep === "cakisma",
    bayat.ok === false ? bayat.sebep : "",
  );

  const sonra = await oku<{ ad: string; maddeler: { id: string }[] }>(
    kokDizin,
    "hobiler/oyunlar.json",
  );
  kontrol("dışarıdan yazılan içerik korunur", sonra.veri?.maddeler?.[0]?.id === "disaridan");
  kontrol(
    "çakışma cevabı güncel hâli taşır",
    bayat.ok === false && bayat.sebep === "cakisma" && bayat.guncel.mtime === sonra.mtime,
  );

  console.log("\nYedek");
  const yedek = await readFile(join(kokDizin, "hobiler/oyunlar.json.bak"), "utf8").catch(() => null);
  kontrol("üzerine yazmadan önce .bak bırakılır", yedek !== null);

  console.log("\nListeleme");
  await yaz(kokDizin, "hobiler/diziler.json", { ad: "Diziler" }, null);
  await writeFile(join(kokDizin, "hobiler/not.txt"), "json değil", "utf8");
  const liste = await listele(kokDizin, "hobiler");
  kontrol("yalnızca .json dosyaları listelenir", !liste.includes("not.txt"));
  kontrol("iki alan görünür", liste.includes("oyunlar.json") && liste.includes("diziler.json"));
  kontrol(".bak dosyaları listeye girmez", !liste.some((x) => x.endsWith(".bak")));
  kontrol("olmayan klasör boş dizi döner", (await listele(kokDizin, "yokklasor")).length === 0);

  console.log("\nSilme");
  await sil(kokDizin, "hobiler/diziler.json");
  kontrol("dosya silinir", (await oku(kokDizin, "hobiler/diziler.json")).veri === null);
  kontrol(
    "silinenin yedeği kalır",
    (await readFile(join(kokDizin, "hobiler/diziler.json.bak"), "utf8").catch(() => null)) !== null,
  );

  console.log("\nAyar çözümü");
  // Kökler diskte olmak zorunda değil: okuyucu dışarıdan geliyor.
  const kurgu = (dosyalar: Record<string, string>) => (yol: string) => dosyalar[yol] ?? null;
  const exeKok = join(kokDizin, "exe");
  const kaliciKok = join(kokDizin, "kalici");
  const yerel = join(exeKok, "argos.config.local.json");
  const genel = join(exeKok, "argos.config.json");
  const kalici = join(kaliciKok, "argos.config.local.json");

  kontrol(
    "ayar yoksa varsayılan ilk köke göre çözülür",
    ayarCoz([exeKok, kaliciKok], "dataDir", "../veri", kurgu({})) === resolve(exeKok, "../veri"),
  );
  kontrol(
    "yerel dosya genelden önce gelir",
    ayarCoz(
      [exeKok],
      "dataDir",
      "../veri",
      kurgu({ [yerel]: `{"dataDir": "/y"}`, [genel]: `{"dataDir": "/g"}` }),
    ) === resolve("/y"),
  );
  kontrol(
    "ilk kök boşsa ikinci kök okunur (kurulum silinse de ayar kalır)",
    ayarCoz([exeKok, kaliciKok], "dataDir", "../veri", kurgu({ [kalici]: `{"dataDir": "/k"}` })) ===
      resolve("/k"),
  );
  kontrol(
    "göreli yol ayarın bulunduğu köke göre çözülür",
    ayarCoz([exeKok, kaliciKok], "dataDir", "../veri", kurgu({ [kalici]: `{"dataDir": "data"}` })) ===
      resolve(kaliciKok, "data"),
  );
  kontrol(
    "bozuk JSON atlanır, arama sürer",
    ayarCoz(
      [exeKok, kaliciKok],
      "dataDir",
      "../veri",
      kurgu({ [yerel]: "{ bozuk", [kalici]: `{"dataDir": "/k"}` }),
    ) === resolve("/k"),
  );
  kontrol(
    "alan yoksa sonraki dosyaya düşülür",
    ayarCoz(
      [exeKok],
      "gizliYolu",
      "../gizli.json",
      kurgu({ [yerel]: `{"dataDir": "/y"}`, [genel]: `{"gizliYolu": "/g.json"}` }),
    ) === resolve("/g.json"),
  );
  kontrol(
    "ortam değişkeni ayarı ezer",
    ayarCoz([exeKok], "dataDir", "../veri", kurgu({ [yerel]: `{"dataDir": "/y"}` }), "/ortam") ===
      resolve("/ortam"),
  );

  console.log("\nHızlı yazım (tuş başına yazma)");
  // Arayüz her tuşta yazıyor. İki yazma aynı eski mtime'la yola çıkarsa
  // ikincisi kendi yazmamıza çarpar — kullanıcının son harfi kaybolur.
  const hizli = "hobiler/hizli.json";
  const hBas = await yaz(kokDizin, hizli, { not: "" }, null);
  const hMtime = hBas.ok ? hBas.mtime : null;
  // İkinci tuşun yazması, birincinin cevabı arayüze dönmeden gönderildi:
  // elindeki mtime hâlâ ilk okumanınki.
  await new Promise((r) => setTimeout(r, 20));
  const h1 = await yaz(kokDizin, hizli, { not: "a" }, hMtime);
  const h2 = await yaz(kokDizin, hizli, { not: "ab" }, hMtime);
  kontrol(
    "sırasız: eski mtime'la giden ikinci tuş kendi yazmamıza çarpar (düzeltilen hata)",
    h1.ok && !h2.ok && h2.sebep === "cakisma",
  );

  // Kancadaki akışın aynısı: mtime her başarılı yazmadan sonra güncellenir.
  let mt = (await oku(kokDizin, hizli)).mtime;
  const kuyruk = sirali(
    async (v: { not: string }) => {
      const r = await yaz(kokDizin, hizli, v, mt);
      if (r.ok) mt = r.mtime;
      return r;
    },
    (r) => r.ok,
  );
  const metinler = ["m", "me", "mer", "merh", "merha", "merhab", "merhaba"];
  const sonuclar = await Promise.all(metinler.map((m) => kuyruk({ not: m })));
  kontrol(
    "sıralı: hiçbir yazma çakışmaz",
    sonuclar.every((r) => r.ok),
  );
  kontrol(
    "sıralı: dosyada son hâl durur",
    (await oku<{ not: string }>(kokDizin, hizli)).veri?.not === "merhaba",
  );
  kontrol("sıralı: kuyruk boşalınca meşgul değil", !kuyruk.mesgul());

  let yazmaSayisi = 0;
  const sayan = sirali(
    async (v: { not: string }) => {
      yazmaSayisi++;
      const r = await yaz(kokDizin, hizli, v, mt);
      if (r.ok) mt = r.mtime;
      return r;
    },
    (r) => r.ok,
  );
  await Promise.all(metinler.map((m) => sayan({ not: m })));
  kontrol("uçuş sürerken gelenler birikir (7 tuş, 2 yazma)", yazmaSayisi === 2, `${yazmaSayisi}`);

  // Çakışmadan sonra bekleyen değer yazılmamalı: eski hâlin üstüne kurulu,
  // yazılırsa dışarıdan geleni ezer.
  await new Promise((r) => setTimeout(r, 20));
  await writeFile(join(kokDizin, hizli), JSON.stringify({ not: "disaridan" }) + "\n", "utf8");
  const [c1, c2] = await Promise.all([kuyruk({ not: "x" }), kuyruk({ not: "xy" })]);
  kontrol("çakışmada bekleyen de düşer", !c1.ok && !c2.ok);
  kontrol(
    "çakışmadan sonra dışarıdan gelen korunur",
    (await oku<{ not: string }>(kokDizin, hizli)).veri?.not === "disaridan",
  );

  console.log("\nDış değişim bekçisi (izleyici yarışları)");
  {
    // Sahte disk: okuma elle çözülür, böylece yazmanın okumanın ortasına
    // düşmesi kurulabilir.
    let disk = { veri: "v0", mtime: 1 };
    let bilinen: number | null = 1;
    let okumaBitir: (() => void) | null = null;
    const oku = () =>
      new Promise<{ veri: string; mtime: number }>((coz) => {
        const anlik = { ...disk };
        okumaBitir = () => coz(anlik);
      });
    const uygulananlar: string[] = [];
    const kuyruk = sirali(
      async (v: string) => {
        disk = { veri: v, mtime: disk.mtime + 1 };
        bilinen = disk.mtime;
        return { ok: true };
      },
      () => true,
      () => void bekci.kuyrukBosaldi(),
    );
    const bekci = disDegisimBekcisi({
      kuyruk,
      oku,
      bilinen: () => bilinen,
      uygula: (o) => {
        uygulananlar.push(o.veri);
        bilinen = o.mtime;
      },
    });

    // Olay gelir, okuma başlar; okuma bitmeden kullanıcı yazar.
    const olay = bekci.olay();
    await kuyruk("v1");
    okumaBitir!();
    await olay;
    kontrol("okuma sürerken yazıldıysa bayat okuma uygulanmaz", uygulananlar.length === 0);
    kontrol("bilinen mtime geriye sarılmaz", bilinen === disk.mtime);

    // Yazma uçuştayken dış değişiklik gelir: yutulmamalı.
    let yazmaBitir: (() => void) | null = null;
    const yavasKuyruk = sirali(
      (v: string) =>
        new Promise<{ ok: boolean }>((coz) => {
          yazmaBitir = () => {
            disk = { veri: v, mtime: disk.mtime + 1 };
            bilinen = disk.mtime;
            // Eşitleme, bizim yazmamız biter bitmez dosyaya dokundu.
            disk = { veri: "disaridan", mtime: disk.mtime + 1 };
            coz({ ok: true });
          };
        }),
      () => true,
      () => void bekci2.kuyrukBosaldi(),
    );
    const bekci2 = disDegisimBekcisi({
      kuyruk: yavasKuyruk,
      oku: async () => ({ ...disk }),
      bilinen: () => bilinen,
      uygula: (o) => {
        uygulananlar.push(o.veri);
        bilinen = o.mtime;
      },
    });
    const yazma = yavasKuyruk("v2");
    await bekci2.olay(); // yazma sürerken olay: işaretlenir
    kontrol("yazma sürerken gelen olay hemen uygulanmaz", uygulananlar.length === 0);
    yazmaBitir!();
    await yazma;
    await new Promise((r) => setTimeout(r, 0));
    kontrol(
      "kuyruk boşalınca kaçan olaya bakılır ve dış değişiklik uygulanır",
      uygulananlar.includes("disaridan"),
      uygulananlar.join(","),
    );

    const once = uygulananlar.length;
    await bekci2.olay(); // kendi son hâlimiz: mtime aynı
    kontrol("kendi yazmamızın olayı dış değişiklik sayılmaz", uygulananlar.length === once);
  }

  console.log("\nAynı dosyaya eşzamanlı yazma");
  // İki yazma aynı damgayla aynı anda gelirse ikisi de kontrolü geçip biri
  // ötekini sessizce eziyordu. Sırayla işlenince ikincisi çakışma görür.
  const es = "hobiler/es.json";
  const esBas = await yaz(kokDizin, es, { n: 0 }, null);
  const esMt = esBas.ok ? esBas.mtime : null;
  await new Promise((r) => setTimeout(r, 20));
  const [e1, e2] = await Promise.all([yaz(kokDizin, es, { n: 1 }, esMt), yaz(kokDizin, es, { n: 2 }, esMt)]);
  kontrol("biri yazılır, öteki çakışır", e1.ok && !e2.ok && e2.sebep === "cakisma", JSON.stringify([e1.ok, e2.ok]));
  kontrol("dosyada yazılan durur", (await oku<{ n: number }>(kokDizin, es)).veri?.n === 1);
  const artik = (await readdir(join(kokDizin, "hobiler"))).filter((d) => d.endsWith(".tmp"));
  kontrol("geçici dosya kalmaz", artik.length === 0, artik.join(","));

  console.log("\nVeri klasörü yokken");
  // Ayar henüz okunamamışken yazma yanlış yerde klasör açıp kendini
  // toparlamayı kilitliyordu.
  const yokKok = join(kokDizin, "olmayan-veri");
  const yokYazma = await yaz(yokKok, "harcama/tanimlar.json", { a: 1 }, null);
  kontrol("kök yoksa yazma reddedilir", !yokYazma.ok && yokYazma.sebep === "hata");
  kontrol("kök klasör açılmaz", !existsSync(yokKok));
  kontrol("tanımsız içerik yazılmaz", !(await yaz(kokDizin, "hobiler/bos.json", undefined, null)).ok);

  await rm(kokDizin, { recursive: true, force: true });

  console.log(`\n${gecen} geçti, ${kalan} kaldı${atlanan > 0 ? `, ${atlanan} atlandı` : ""}`);
  if (kalan > 0) process.exitCode = 1;
}

void calis();
