/**
 * Veri katmanı testi. Electron gerektirmez: `node araclar/veri-testi.ts`
 *
 * Test edilen şey, bu tasarımdaki tek gerçek veri kaybı riski: aynı `data/`
 * klasörüne iki uygulama yazıyor (Argos ve eski app.py). Yazma sırasında
 * dosya dışarıdan değiştiyse üzerine yazılmamalı.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ayarCoz, listele, oku, sil, tamYol, yaz } from "../src/main/veri-cekirdek.ts";

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

  await rm(kokDizin, { recursive: true, force: true });

  console.log(`\n${gecen} geçti, ${kalan} kaldı${atlanan > 0 ? `, ${atlanan} atlandı` : ""}`);
  if (kalan > 0) process.exitCode = 1;
}

void calis();
