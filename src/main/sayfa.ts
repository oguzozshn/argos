import { shell, type BrowserWindow } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Pencerelerin ortak yüklenişi. Ana pencere ile hızlı yakalama penceresi
 * aynı arayüz paketini açıyor; ikincisi `?pencere=yakala` ile yalnızca
 * yakalama bileşenini çiziyor.
 */

const devSunucu = (): string | undefined => process.env["ELECTRON_RENDERER_URL"];
const sayfaDosyasi = (): string => join(__dirname, "../renderer/index.html");

/** Preload'lu, yalıtılmış pencere ayarları — iki pencere aynı sınırda. */
export const webAyarlari = () => ({
  preload: join(__dirname, "../preload/index.js"),
  // Preload yalnızca contextBridge/ipcRenderer kullanıyor ve paketli;
  // Node erişimi gerekmiyor.
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
});

/**
 * Pencere yerinde başka bir sayfaya gidemesin: o sayfa `window.argos` ile
 * veri klasörünü okuyup yazabilirdi. Dış bağlantı tarayıcıda açılır.
 * file: için yalnızca kendi sayfamız: pencereye sürüklenen bir HTML dosyası
 * da preload'la açılır ve `window.argos`'a erişirdi.
 */
export function gezinmeyiKilitle(pencere: BrowserWindow): void {
  const sayfaYolu = pathToFileURL(sayfaDosyasi()).href;
  const dev = devSunucu();
  const kendiAdresi = (url: string) =>
    url.split(/[?#]/)[0] === sayfaYolu || (!!dev && url.startsWith(dev));

  pencere.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  pencere.webContents.on("will-navigate", (olay, url) => {
    if (kendiAdresi(url)) return;
    olay.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  pencere.webContents.on("will-redirect", (olay, url) => {
    if (!kendiAdresi(url)) olay.preventDefault();
  });
}

/** Arayüzü yükler; `tur` verilirse o pencere türünün bileşeni çizilir. */
export function sayfayiYukle(pencere: BrowserWindow, tur?: "yakala"): void {
  const dev = devSunucu();
  if (dev) void pencere.loadURL(tur ? `${dev}?pencere=${tur}` : dev);
  else void pencere.loadFile(sayfaDosyasi(), tur ? { query: { pencere: tur } } : undefined);
}
