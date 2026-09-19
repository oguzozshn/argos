/**
 * Günlük yedek testi: `node araclar/yedek-testi.mts`
 *
 * Geçici klasörlerde çalışır; gerçek veri klasörüne dokunmaz.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eskileriSil, yedekAl, yedekGunleri } from "../src/main/yedek-cekirdek.ts";

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

const kok = mkdtempSync(join(tmpdir(), "argos-yedek-"));
const veri = join(kok, "data");
const yedek = join(kok, "yedekler");
mkdirSync(join(veri, "harcama"), { recursive: true });
mkdirSync(join(veri, ".git"), { recursive: true });
writeFileSync(join(veri, "W38.json"), '{"hafta":38}');
writeFileSync(join(veri, "W38.json.bak"), "eski");
writeFileSync(join(veri, "W38.json.123-1.tmp"), "yarım");
writeFileSync(join(veri, "harcama", "2026-09.json"), '{"ay":"2026-09"}');
writeFileSync(join(veri, ".git", "x.json"), "{}");
writeFileSync(join(veri, "notlar.txt"), "json değil");

try {
  console.log("\nyedek alma");
  const r1 = await yedekAl(veri, yedek, "2026-09-19");
  const gun = join(yedek, "2026-09-19");
  kontrol("alındı, iki JSON", r1.alindi && r1.dosya === 2, JSON.stringify(r1));
  kontrol("alt klasör korunur", readFileSync(join(gun, "harcama", "2026-09.json"), "utf8") === '{"ay":"2026-09"}');
  kontrol(".bak, .tmp, .git ve JSON olmayan kopyalanmaz", readdirSync(gun).sort().join() === "W38.json,harcama");

  writeFileSync(join(veri, "W38.json"), '{"hafta":38,"degisti":true}');
  const r2 = await yedekAl(veri, yedek, "2026-09-19");
  kontrol("aynı gün ikinci kez alınmaz", !r2.alindi);
  kontrol("günün yedeği ilk hâli tutar", readFileSync(join(gun, "W38.json"), "utf8") === '{"hafta":38}');

  const r3 = await yedekAl(veri, yedek, "2026-09-20");
  kontrol("ertesi gün yeni yedek, yeni hâl", r3.alindi && readFileSync(join(yedek, "2026-09-20", "W38.json"), "utf8").includes("degisti"));

  console.log("\nyarım kalan kopya");
  mkdirSync(join(yedek, "2026-09-21.yarim-999999"));
  writeFileSync(join(yedek, "2026-09-21.yarim-999999", "W38.json"), "{");
  const r4 = await yedekAl(veri, yedek, "2026-09-21");
  kontrol("yarım kopya tam sayılmaz, yedek alınır", r4.alindi && existsSync(join(yedek, "2026-09-21", "W38.json")));

  console.log("\nbudama");
  for (let g = 1; g <= 9; g++) mkdirSync(join(yedek, `2026-08-0${g}`));
  mkdirSync(join(yedek, "benim-klasorum"));
  const silinen = await eskileriSil(yedek, 5);
  const kalanlar = await yedekGunleri(yedek);
  kontrol("en yeni 5 gün kalır", kalanlar.join() === "2026-09-21,2026-09-20,2026-09-19,2026-08-09,2026-08-08", kalanlar.join());
  kontrol("yarım kopya silinir", silinen.includes("2026-09-21.yarim-999999"));
  kontrol("gün adı olmayan klasöre dokunulmaz", existsSync(join(yedek, "benim-klasorum")));
  kontrol("yedek klasörü yoksa sessiz", (await eskileriSil(join(kok, "yok"))).length === 0);

  console.log("\nhata");
  let hata: unknown = null;
  try {
    await yedekAl(join(kok, "olmayan"), yedek, "2026-09-22");
  } catch (e) {
    hata = e;
  }
  kontrol("veri klasörü yoksa hata, boş yedek yok", hata instanceof Error && !existsSync(join(yedek, "2026-09-22")));
} finally {
  rmSync(kok, { recursive: true, force: true });
}

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
