/**
 * Parite testi: `node araclar/parite-testi.mts`
 *
 * Faz 5'in yöntemi bu. Taşınan her fonksiyon, eski uygulamayla AYNI veriden
 * AYNI çıktıyı vermek zorunda. Referans `app.py`'nin kendisinden üretilir
 * (araclar/parite-uret.py), sonra TypeScript sürümüyle derinlemesine
 * karşılaştırılır. Fark varsa taşıma bitmemiş demektir.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aliskanlikOzet,
  arsiv,
  haftalikHiz,
  hedefOzet,
  planliHiz,
  roadmapOzet,
  takvim,
  zamanOzet,
  type HaftaKayit,
  type Kurallar,
  type Roadmap,
} from "../src/ortak/ozet.ts";
import { veriYolu } from "./yol.mts";

const buradan = dirname(fileURLToPath(import.meta.url));

let gecen = 0;
let kalan = 0;

/** Anahtar sırasından bağımsız derin karşılaştırma. */
function duzle(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(duzle);
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const cikti: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) cikti[k] = duzle(o[k]);
    return cikti;
  }
  return x;
}

function ilkFark(a: unknown, b: unknown, yol = ""): string | null {
  const x = duzle(a);
  const y = duzle(b);
  if (JSON.stringify(x) === JSON.stringify(y)) return null;

  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.length !== y.length) return `${yol}: uzunluk ${x.length} ≠ ${y.length}`;
    for (let i = 0; i < x.length; i++) {
      const f = ilkFark(x[i], y[i], `${yol}[${i}]`);
      if (f) return f;
    }
  }
  if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) {
    const ax = x as Record<string, unknown>;
    const ay = y as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ax), ...Object.keys(ay)])) {
      const f = ilkFark(ax[k], ay[k], yol ? `${yol}.${k}` : k);
      if (f) return f;
    }
  }
  const kisa = (v: unknown) => JSON.stringify(v)?.slice(0, 120);
  return `${yol}: ${kisa(x)} ≠ ${kisa(y)}`;
}

function esit(ad: string, python: unknown, bizim: unknown): void {
  const fark = ilkFark(python, bizim);
  if (fark === null) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}\n      ${fark}`);
  }
}

/* --- veri --------------------------------------------------------------- */

const oku = <T,>(yol: string): T => JSON.parse(readFileSync(yol, "utf8")) as T;

function haftalariOku(dataDir: string): HaftaKayit[] {
  return readdirSync(dataDir)
    .filter((d) => /^W\d{1,2}\.json$/.test(d))
    .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)))
    .map((d) => ({ kod: d.slice(0, -5), veri: oku(join(dataDir, d)) }));
}

function roadmapleriOku(dataDir: string): Roadmap[] {
  const klasor = join(dataDir, "roadmap");
  if (!existsSync(klasor)) return [];
  return readdirSync(klasor)
    .filter((d) => d.endsWith(".json"))
    .map((d) => oku<Roadmap>(join(klasor, d)));
}

/* --- koşum -------------------------------------------------------------- */

const dataDir = veriYolu();
const depoKoku = resolve(dataDir, "..");

if (!existsSync(join(depoKoku, "app.py"))) {
  console.log(`Parite atlandı — ${depoKoku} altında app.py yok.`);
  process.exit(0);
}

console.log(`Referans: ${join(depoKoku, "app.py")}\n`);

const ham = execFileSync("python", [join(buradan, "parite-uret.py"), depoKoku], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const ref = JSON.parse(ham) as Record<string, any>;
const bugun = ref.bugun as string;

const haftalar = haftalariOku(dataDir);
const kurallar = oku<Kurallar>(join(dataDir, "kurallar.json"));
const roadmapler = roadmapleriOku(dataDir);
const hedefDosyasi = join(dataDir, "hedefler.json");
const hedefler = existsSync(hedefDosyasi)
  ? oku<{ hedefler?: { id: string }[] }>(hedefDosyasi)
  : { hedefler: [] };

console.log(`${haftalar.length} hafta dosyası, ${roadmapler.length} yol haritası\n`);

console.log("Arşiv");
esit("arsiv()", ref.arsiv, arsiv(haftalar, bugun));

console.log("\nHız");
esit(
  "haftalik_hiz()",
  ref.haftalikHiz,
  Object.fromEntries([...haftalikHiz(haftalar, bugun)].map(([a, v]) => [a, v])),
);
esit("planli_hiz()", ref.planliHiz, Object.fromEntries(planliHiz(haftalar, kurallar)));

console.log("\nYol haritaları ve hedefler");
const rm = roadmapOzet(haftalar, kurallar, roadmapler, bugun);
esit("roadmap_ozet()", ref.roadmapOzet, rm);
esit("hedef_ozet()", ref.hedefOzet, hedefOzet(hedefler, rm, kurallar));

console.log("\nAlışkanlıklar");
esit("aliskanlik_ozet()", ref.aliskanlikOzet, aliskanlikOzet(haftalar, kurallar, null, bugun));
esit("aliskanlik_ozet(2026)", ref.aliskanlikOzet2026, aliskanlikOzet(haftalar, kurallar, 2026, bugun));

console.log("\nZaman özeti");
for (const [anahtar, beklenen] of Object.entries(ref.zamanOzet)) {
  const [kapsam, tarih] = anahtar.split("|");
  esit(`zaman_ozet(${kapsam}, ${tarih})`, beklenen, zamanOzet(haftalar, kapsam!, tarih!, bugun));
}

console.log("\nTakvim");
for (const [anahtar, beklenen] of Object.entries(ref.takvim)) {
  const [yil, ay] = anahtar.split("-").map(Number);
  esit(`takvim(${anahtar})`, beklenen, takvim(haftalar, yil!, ay!));
}

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
