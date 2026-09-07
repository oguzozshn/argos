import { BrowserWindow, ipcMain, nativeTheme } from "electron";
import { BASLIK_RENKLERI, KANAL } from "../ortak/tipler";
import * as td from "./todoist";
import { listele, oku, ortam, sil, yaz } from "./veri";

/**
 * Arayüzün dosya sistemine tek kapısı. Renderer'da `fs` yok, `nodeIntegration`
 * kapalı — her şey buradan geçer ve her yol dataDir içine kilitlenir (veri.ts).
 */
export function ipcKur(): void {
  ipcMain.handle(KANAL.ortam, () => ortam());
  ipcMain.handle(KANAL.veriOku, (_o, yol: string) => oku(yol));
  ipcMain.handle(KANAL.veriYaz, (_o, yol: string, icerik: unknown, mtime: number | null) =>
    yaz(yol, icerik, mtime),
  );
  ipcMain.handle(KANAL.veriListele, (_o, klasor: string) => listele(klasor));
  ipcMain.handle(KANAL.veriSil, (_o, yol: string) => sil(yol));

  // Tema kararı arayüzde verilir (sistem takibi orada). Ana sürecin işi
  // yalnızca pencere düğmelerinin zeminini aynı renge çekmek.
  ipcMain.handle(KANAL.tema, (olay, tema: "acik" | "koyu") => {
    const p = BrowserWindow.fromWebContents(olay.sender);
    if (!p || p.isDestroyed()) return;
    p.setTitleBarOverlay({ ...BASLIK_RENKLERI[tema] ?? BASLIK_RENKLERI.acik, height: 44 });
    // Yerel iletişim kutuları (dosya seçici, uyarı) da aynı tarafta kalsın.
    nativeTheme.themeSource = tema === "koyu" ? "dark" : "light";
  });

  // Todoist. Anahtar bu tarafta kalır; arayüz yalnızca sonucu görür.
  ipcMain.handle(KANAL.tdDurum, () => td.durum());
  ipcMain.handle(KANAL.tdProjeler, () => td.projeler());
  ipcMain.handle(KANAL.tdGorevler, (_o, projeId: string) => td.gorevler(projeId));
  ipcMain.handle(KANAL.tdBugun, () => td.bugunVeGecikmis());
  ipcMain.handle(KANAL.tdEkle, (_o, g: Parameters<typeof td.ekle>[0]) => td.ekle(g));
  ipcMain.handle(KANAL.tdKapat, (_o, id: string) => td.kapat(id));
  ipcMain.handle(KANAL.tdAc, (_o, id: string) => td.ac(id));
  ipcMain.handle(KANAL.tdTarih, (_o, id: string, metin: string | null) => td.tarihVer(id, metin));
}
