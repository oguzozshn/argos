import { BrowserWindow, ipcMain, powerMonitor } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { bugunIso } from "../ortak/plan";
import { KANAL } from "../ortak/tipler";
import { anlikGonder, kuyruguIsle, type BotAyari } from "./bot-cekirdek";
import { degisimeAbone } from "./izle";
import { tepsiBotDurumu } from "./tepsi";
import { gizliYolu } from "./todoist";
import { dataDir } from "./veri";
import { jsonCoz } from "./veri-cekirdek";

/**
 * Telegram botuyla eşitlemenin zamanlaması. İşin kendisi `bot-cekirdek.ts`'te.
 *
 *  - Görünüm (plan, alışkanlıklar, Hatırla) açılışta, plan dosyaları
 *    değişince, gün dönünce ve uykudan dönünce Worker'a gider.
 *  - Kuyruk açılışta, uykudan/kilitten dönünce ve 5 dakikada bir çekilir.
 *
 * Ayar `gizli.json`'da (`argosBotUrl`, `argosBotAnahtari`); yoksa hiçbir şey
 * yapılmaz. Her turda yeniden okunur: ayar eklenince yeniden başlatmak
 * gerekmesin.
 */

const KUYRUK_ARALIGI = 5 * 60 * 1000;
/** Dosya değişikliği arka arkaya gelir (arayüzde sürükleme, app.py); biriksin. */
const BEKLEME = 5000;

let anaPencere: () => BrowserWindow | null = () => null;
let zamanlayici: NodeJS.Timeout | null = null;
let bekleyenGonderim: NodeJS.Timeout | null = null;
let sonGun = "";
/**
 * Arayüze henüz söylenmemiş eklemeler. Olay yalnızca "var" der; arayüz
 * görünürken buradan alır. Açılışta kuyruk arayüz yüklenmeden işlenir,
 * pencere tepsideyken de bildirim görülmeden kaybolurdu.
 */
let soylenmedi: string[] = [];
/** İşler sırayla: kuyruk yazarken görünüm aynı dosyaları okumasın, iki kuyruk turu çakışmasın. */
let sira: Promise<void> = Promise.resolve();

function ayar(): BotAyari | null {
  try {
    const f = gizliYolu();
    if (!existsSync(f)) return null;
    const g = jsonCoz<{ argosBotUrl?: string; argosBotAnahtari?: string }>(readFileSync(f, "utf8"));
    const url = g.argosBotUrl?.trim();
    const anahtar = g.argosBotAnahtari?.trim();
    return url && anahtar ? { url, anahtar } : null;
  } catch {
    return null;
  }
}

function sirayaKoy(ad: string, is: (a: BotAyari) => Promise<void>): void {
  sira = sira.then(async () => {
    const a = ayar();
    if (!a) {
      tepsiBotDurumu(null);
      return;
    }
    try {
      await is(a);
      tepsiBotDurumu({ tamam: true, zaman: new Date() });
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      console.error(`[bot] ${ad}:`, mesaj);
      tepsiBotDurumu({ tamam: false, zaman: new Date(), hata: mesaj });
    }
  });
}

const gorunumGonder = () =>
  sirayaKoy("görünüm", (a) => anlikGonder(dataDir(), a, bugunIso(), new Date().toISOString()));

const kuyruguCek = () =>
  sirayaKoy("kuyruk", async (a) => {
    const s = await kuyruguIsle(dataDir(), a, bugunIso());
    if (s.eklenenler.length === 0) return;
    const p = anaPencere();
    soylenmedi.push(...s.eklenenler);
    if (p && !p.isDestroyed()) p.webContents.send(KANAL.botAktarildi);
    // Kendi yazmamız izleyiciden de gelir ama beklemeden gönderilsin:
    // Telegram'daki ⏳ satırları hemen plana dönüşsün.
    gorunumGonder();
  });

function gecikmeliGonder(): void {
  if (bekleyenGonderim) clearTimeout(bekleyenGonderim);
  bekleyenGonderim = setTimeout(() => {
    bekleyenGonderim = null;
    gorunumGonder();
  }, BEKLEME);
}

export function botBaslat(pencere: () => BrowserWindow | null): void {
  if (zamanlayici) return;
  anaPencere = pencere;
  sonGun = bugunIso();
  ipcMain.handle(KANAL.botAl, () => {
    const x = soylenmedi;
    soylenmedi = [];
    return x;
  });

  gorunumGonder();
  kuyruguCek();

  zamanlayici = setInterval(() => {
    // Görünüm "bugünden 14 gün"; gün dönünce pencere kayar.
    if (bugunIso() !== sonGun) {
      sonGun = bugunIso();
      gorunumGonder();
    }
    kuyruguCek();
  }, KUYRUK_ARALIGI);

  const uyaninca = () => {
    gorunumGonder();
    kuyruguCek();
  };
  powerMonitor.on("resume", uyaninca);
  powerMonitor.on("unlock-screen", uyaninca);

  degisimeAbone((yol) => {
    if (/^W\d{1,2}\.json$/.test(yol) || yol === "kurallar.json" || yol === "hatirla.json") gecikmeliGonder();
  });
}

export function botDurdur(): void {
  if (zamanlayici) clearInterval(zamanlayici);
  if (bekleyenGonderim) clearTimeout(bekleyenGonderim);
  zamanlayici = null;
  bekleyenGonderim = null;
}
