/**
 * Asistan verisi testi: `node araclar/asistan-testi.mts`
 *
 * Asıl mesele parite. "Bugün aklında tut" seçimi eski uygulamayla (app.py'deki
 * `hatirla_bugun`) AYNI maddeleri vermeli — yoksa aynı gün iki uygulama iki
 * farklı şey gösterir. `araclar/hatirla-parite.json` app.py'nin kendi
 * gövdesinden üretildi; burada TypeScript sürümü ona karşı sınanıyor.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  bugunGunNo,
  bugunIso,
  hatirlaBugun,
  type HatirlaMaddesi,
} from "../src/ortak/plan.ts";

const buradan = dirname(fileURLToPath(import.meta.url));

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

interface PariteSatiri {
  iso: string;
  toplam: number;
  adet: number;
  secim: number[];
}

console.log("hatirla_bugun paritesi (app.py'ye karşı)");

const tablo = JSON.parse(
  readFileSync(join(buradan, "hatirla-parite.json"), "utf8"),
) as PariteSatiri[];

let sapan = 0;
for (const satir of tablo) {
  const maddeler: HatirlaMaddesi[] = Array.from({ length: satir.toplam }, (_, i) => ({
    id: String(i),
    metin: `m${i}`,
    eklendi: "2026-01-01",
  }));
  // Yerel gün: uygulama da yerel tarihe göre seçiyor.
  const [y, a, g] = satir.iso.split("-").map(Number);
  const bizim = hatirlaBugun(maddeler, satir.adet, new Date(y!, a! - 1, g!)).map((m) =>
    Number(m.id),
  );
  if (JSON.stringify(bizim) !== JSON.stringify(satir.secim)) {
    sapan++;
    if (sapan <= 3) {
      console.log(
        `    ${satir.iso} toplam=${satir.toplam} adet=${satir.adet}: ` +
          `beklenen ${JSON.stringify(satir.secim)}, gelen ${JSON.stringify(bizim)}`,
      );
    }
  }
}
kontrol(`${tablo.length} kombinasyonun tamamı eşleşir`, sapan === 0, `${sapan} sapma`);

console.log("\nSeçimin davranışı");
const on: HatirlaMaddesi[] = Array.from({ length: 10 }, (_, i) => ({
  id: String(i),
  metin: `m${i}`,
  eklendi: "2026-01-01",
}));
const bugunSecim = hatirlaBugun(on, 3, new Date(2026, 8, 5));
const yineBugun = hatirlaBugun(on, 3, new Date(2026, 8, 5));
const yarinSecim = hatirlaBugun(on, 3, new Date(2026, 8, 6));
kontrol("aynı gün aynı sonuç", JSON.stringify(bugunSecim) === JSON.stringify(yineBugun));
kontrol("ertesi gün kayar", JSON.stringify(bugunSecim) !== JSON.stringify(yarinSecim));
kontrol("istenen adet kadar döner", bugunSecim.length === 3);
kontrol("aynı madde iki kez gelmez", new Set(bugunSecim.map((m) => m.id)).size === 3);

const arsivli: HatirlaMaddesi[] = [
  { id: "a", metin: "aktif", eklendi: "2026-01-01" },
  { id: "b", metin: "arşiv", eklendi: "2026-01-01", arsiv: true },
];
kontrol(
  "arşivlenmiş madde öne çıkmaz",
  hatirlaBugun(arsivli, 3).every((m) => m.id !== "b"),
);
kontrol("boş liste boş döner", hatirlaBugun([], 3).length === 0);
kontrol("adet 0 ise boş döner", hatirlaBugun(on, 0).length === 0);
kontrol("adet listeden büyükse liste boyu kadar döner", hatirlaBugun(on, 50).length === 10);

console.log("\nGün numarası ve tarih");
// ISO: Pazartesi 1 … Pazar 7. 2026-09-05 cumartesi, 2026-09-06 pazar.
kontrol("cumartesi 6", bugunGunNo(new Date(2026, 8, 5)) === 6);
kontrol("pazar 7 (JS'te 0)", bugunGunNo(new Date(2026, 8, 6)) === 7);
kontrol("pazartesi 1", bugunGunNo(new Date(2026, 8, 7)) === 1);
kontrol("yerel tarih UTC'ye kaymaz", bugunIso(new Date(2026, 8, 5, 23, 30)) === "2026-09-05");
kontrol("gün başında da doğru", bugunIso(new Date(2026, 8, 5, 0, 15)) === "2026-09-05");

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
