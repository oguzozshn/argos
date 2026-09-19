import { app, powerMonitor, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bugunIso } from "../ortak/plan";
import { tepsiYedekDurumu } from "./tepsi";
import { dataDir } from "./veri";
import { eskileriSil, yedekAl } from "./yedek-cekirdek";

/**
 * Günlük yedeğin zamanlaması. İş `yedek-cekirdek.ts`'te.
 *
 * Açılıştan biraz sonra, saatte bir ve uykudan dönünce bakılır; o günün
 * yedeği varsa hiçbir şey yapılmaz. Böylece günün yedeği o gün Argos'un ilk
 * açıldığı andaki hâli tutar — gün içinde bozulan bir şey ertesi güne dek
 * yedekten geri alınabilir.
 */

const ILK_BEKLEME = 15_000;
const ARALIK = 60 * 60 * 1000;

export const yedekKlasoru = (): string => join(app.getPath("userData"), "yedekler");

let zamanlayici: NodeJS.Timeout | null = null;
let calisiyor = false;

async function dene(): Promise<void> {
  if (calisiyor) return;
  calisiyor = true;
  try {
    const bugun = bugunIso();
    const r = await yedekAl(dataDir(), yedekKlasoru(), bugun);
    if (r.alindi) console.log(`[yedek] ${bugun}: ${r.dosya} dosya`);
    await eskileriSil(yedekKlasoru());
    tepsiYedekDurumu({ tamam: true, gun: bugun });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("[yedek]", mesaj);
    tepsiYedekDurumu({ tamam: false, hata: mesaj });
  } finally {
    calisiyor = false;
  }
}

export function yedekBaslat(): void {
  if (zamanlayici) return;
  setTimeout(() => void dene(), ILK_BEKLEME);
  zamanlayici = setInterval(() => void dene(), ARALIK);
  powerMonitor.on("resume", () => void dene());
}

export function yedekDurdur(): void {
  if (zamanlayici) clearInterval(zamanlayici);
  zamanlayici = null;
}

/** Yedek klasörünü Gezgin'de açar; henüz yoksa oluşturur ki boş bir hata çıkmasın. */
export async function yedekKlasorunuAc(): Promise<void> {
  const k = yedekKlasoru();
  mkdirSync(k, { recursive: true });
  const hata = await shell.openPath(k);
  if (hata) throw new Error(hata);
}
