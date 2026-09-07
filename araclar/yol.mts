/**
 * Testlerin veri ve anahtar yollarını çözmesi için ortak yardımcı.
 *
 * Kaynak `argos.config.json` — uygulamanın kendisi de aynı dosyadan okuyor.
 * Böylece proje taşındığında tek bir yer güncelleniyor.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const proje = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Ayar {
  dataDir?: string;
  gizliYolu?: string;
}

function ayarOku(): Ayar {
  for (const ad of ["argos.config.local.json", "argos.config.json"]) {
    const f = join(proje, ad);
    if (!existsSync(f)) continue;
    try {
      return JSON.parse(readFileSync(f, "utf8")) as Ayar;
    } catch {
      // Bozuk ayar yok sayılır.
    }
  }
  return {};
}

const coz = (deger: string): string => (isAbsolute(deger) ? deger : resolve(proje, deger));

export function veriYolu(): string {
  const ayar = ayarOku();
  return coz(process.env.ARGOS_DATA || ayar.dataDir || "../personnal_assistant/data");
}

export function gizliYolu(): string {
  const ayar = ayarOku();
  return coz(process.env.ARGOS_GIZLI || ayar.gizliYolu || "../personnal_assistant/gizli.json");
}
