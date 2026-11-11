import { BrowserWindow, ipcMain, powerMonitor } from "electron";
import { readFileSync } from "node:fs";
import { bugunIso } from "../ortak/plan";
import { KANAL } from "../ortak/tipler";
import { anlikGonder, kuyruguIsle, type BotAyari } from "./bot-cekirdek";
import { botLog } from "./bot-log";
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
/** Plan değişmese de görünüm bu kadar eskiyince yeniden gider ("son güncelleme" satırı bayatlamasın). */
const TAZELEME = 60 * 60 * 1000;

let anaPencere: () => BrowserWindow | null = () => null;
let zamanlayici: NodeJS.Timeout | null = null;
let bekleyenGonderim: NodeJS.Timeout | null = null;
let sonGun = "";
/**
 * Görünümün Worker'a son başarıyla gittiği an. Başarısız gönderim yeniden
 * denenmeliydi: kurulumdan sonraki ilk açılışta ağ hazır değilken giden
 * istek düşünce plan, bir dosya değişene dek hiç gitmiyordu.
 */
let sonGorunum = 0;
/**
 * Arayüze henüz söylenmemiş eklemeler. Olay yalnızca "var" der; arayüz
 * görünürken buradan alır. Açılışta kuyruk arayüz yüklenmeden işlenir,
 * pencere tepsideyken de bildirim görülmeden kaybolurdu.
 */
let soylenmedi: string[] = [];
/** İşler sırayla: kuyruk yazarken görünüm aynı dosyaları okumasın, iki kuyruk turu çakışmasın. */
let sira: Promise<void> = Promise.resolve();

const hataMetni = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Why the bot cannot run, when it cannot. "Could not read the file" and "the
 * keys are not in it" used to collapse into one `null`, and the log could not
 * tell them apart — the secrets file held all three keys and was still read as
 * empty nine milliseconds into start-up.
 */
type AyarSonucu =
  | { tur: "var"; ayar: BotAyari }
  | { tur: "dosyaYok"; yol: string }
  | { tur: "eksik"; yol: string }
  | { tur: "okunamadi"; yol: string; sebep: string };

function ayar(): AyarSonucu {
  let f: string;
  try {
    f = gizliYolu();
  } catch (e) {
    return { tur: "okunamadi", yol: "(ayar çözülemedi)", sebep: hataMetni(e) };
  }
  let metin: string;
  try {
    // Read first and let it fail: `existsSync` answers false for a file that
    // is there but cannot be opened, and those two want different answers.
    metin = readFileSync(f, "utf8");
  } catch (e) {
    const kod = (e as NodeJS.ErrnoException).code;
    return kod === "ENOENT"
      ? { tur: "dosyaYok", yol: f }
      : { tur: "okunamadi", yol: f, sebep: `${kod ?? ""} ${hataMetni(e)}`.trim() };
  }
  let g: { argosBotUrl?: string; argosBotAnahtari?: string };
  try {
    g = jsonCoz<{ argosBotUrl?: string; argosBotAnahtari?: string }>(metin);
  } catch (e) {
    return { tur: "okunamadi", yol: f, sebep: hataMetni(e) };
  }
  const url = g.argosBotUrl?.trim();
  const anahtar = g.argosBotAnahtari?.trim();
  return url && anahtar ? { tur: "var", ayar: { url, anahtar } } : { tur: "eksik", yol: f };
}

/**
 * The steady "cannot run" state is repeated this often, not once per process.
 * Logged once, a bot stuck on it looked exactly like a bot whose turns had
 * stopped; now silence in the log means one thing only — no turn ran.
 */
const SESSIZ_TEKRAR_MS = 60 * 60 * 1000;
let sonSessizKayit = 0;

function sessizKaydet(satir: string): void {
  const simdi = Date.now();
  if (sonSessizKayit !== 0 && simdi - sonSessizKayit < SESSIZ_TEKRAR_MS) return;
  sonSessizKayit = simdi;
  botLog(satir);
}

async function turuCalistir(ad: string, is: (a: BotAyari) => Promise<void>): Promise<void> {
  const a = ayar();
  if (a.tur !== "var") {
    tepsiBotDurumu(null);
    sessizKaydet(
      a.tur === "dosyaYok"
        ? `anahtar dosyası yok — ${a.yol}; bot duruyor`
        : a.tur === "eksik"
          ? `ayar yok — ${a.yol} okundu, içinde argosBotUrl ya da argosBotAnahtari yok; bot duruyor`
          : `anahtar dosyası okunamadı — ${a.yol}: ${a.sebep}; bot duruyor`,
    );
    return;
  }
  // Settings are back: the next outage is worth a line straight away.
  sonSessizKayit = 0;
  const basladi = Date.now();
  try {
    await is(a.ayar);
    tepsiBotDurumu({ tamam: true, zaman: new Date() });
    botLog(`${ad}: tamam (${Date.now() - basladi} ms)`);
  } catch (e) {
    const mesaj = hataMetni(e);
    console.error(`[bot] ${ad}:`, mesaj);
    tepsiBotDurumu({ tamam: false, zaman: new Date(), hata: mesaj });
    botLog(`${ad}: HATA (${Date.now() - basladi} ms) — ${mesaj}`);
  }
}

/**
 * Turns run one after another on `sira`. The chain MUST never be left
 * rejected: `sira.then(...)` on a rejected promise skips the callback, so a
 * single throw used to stop every later turn for the rest of the session —
 * the five-minute timer kept firing and nothing kept happening. The `catch`
 * here is what keeps the bot alive, so nothing may be added after it.
 */
function sirayaKoy(ad: string, is: (a: BotAyari) => Promise<void>): void {
  sira = sira
    .then(() => turuCalistir(ad, is))
    .catch((e) => {
      botLog(`${ad}: beklenmeyen hata — ${hataMetni(e)}`);
    });
}

const gorunumGonder = () =>
  sirayaKoy("görünüm", async (a) => {
    await anlikGonder(dataDir(), a, bugunIso(), new Date().toISOString());
    sonGorunum = Date.now();
  });

const kuyruguCek = () =>
  sirayaKoy("kuyruk", async (a) => {
    const s = await kuyruguIsle(dataDir(), a, bugunIso());
    // A record left behind is reported every turn: it stays in the queue
    // until it succeeds, and the reason is the only clue to why it does not.
    if (s.sonuclar.length > 0 || s.bekleyen > 0) {
      botLog(
        `kuyruk: ${s.sonuclar.length} işlendi, ${s.bekleyen} bekliyor` +
          (s.bekleyenSebepler.length > 0 ? ` — ${s.bekleyenSebepler.join("; ")}` : ""),
      );
    }
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

  botLog(`başladı — veri klasörü ${dataDir()}`);
  gorunumGonder();
  kuyruguCek();

  zamanlayici = setInterval(() => {
    // Görünüm "bugünden 14 gün"; gün dönünce pencere kayar. Son gönderim
    // düştüyse ya da eskidiyse de yeniden gider.
    if (bugunIso() !== sonGun || Date.now() - sonGorunum > TAZELEME) {
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
    // Argos tasks and their reminders travel in the snapshot too.
    if (/^W\d{1,2}\.json$/.test(yol) || yol === "kurallar.json" || yol === "hatirla.json" || yol.startsWith("tasks/")) {
      gecikmeliGonder();
    }
  });
}

export function botDurdur(): void {
  if (zamanlayici) clearInterval(zamanlayici);
  if (bekleyenGonderim) clearTimeout(bekleyenGonderim);
  zamanlayici = null;
  bekleyenGonderim = null;
}
