import { BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { resolve } from "node:path";
import { BASLIK_RENKLERI, KANAL } from "../ortak/tipler";
import * as td from "./todoist";
import { izlemeyeBasla, izlemeyiDurdur } from "./izle";
import { tepsiOdak, todoistDegistiBildir, yakalamaHatasi, yakalamadanMi, yakalamayiGizle } from "./tepsi";
import { klasorAyarla, listele, oku, ortam, sil, yaz } from "./veri";
import { bildirimGoster } from "./bildirim";
import { yedekKlasorunuAc } from "./yedek";

/**
 * Arayüzün dosya sistemine tek kapısı. Renderer'da `fs` yok, `nodeIntegration`
 * kapalı — her şey buradan geçer ve her yol dataDir içine kilitlenir (veri.ts).
 */
export function ipcKur(): void {
  ipcMain.handle(KANAL.ortam, () => ortam());

  /**
   * Veri klasörünü kullanıcıya seçtirir. Ayar dosyasını elle yerleştirmek
   * zorunda kalmamak için var: klasör bulunamadığında uygulama içinden
   * yapılabilecek tek şey buydu ve yoktu.
   *
   * Seçimden sonra izleyici de yeniden kuruluyor — eski klasörü dinlemeye
   * devam ederse dışarıdan gelen değişiklikler görünmez.
   */
  ipcMain.handle(KANAL.ayarKlasor, async (olay) => {
    const p = BrowserWindow.fromWebContents(olay.sender);
    const secenekler = {
      title: "Veri klasörünü seç",
      properties: ["openDirectory" as const],
      defaultPath: ortam().dataDir,
    };
    const sonuc = p ? await dialog.showOpenDialog(p, secenekler) : await dialog.showOpenDialog(secenekler);
    const secilen = sonuc.filePaths[0];
    if (sonuc.canceled || !secilen) return null;

    await klasorAyarla(secilen);
    if (p && !p.isDestroyed()) {
      await izlemeyiDurdur();
      izlemeyeBasla(p);
    }
    const o = ortam();
    if (resolve(o.dataDir).toLowerCase() !== resolve(secilen).toLowerCase()) {
      o.ayarUyarisi = process.env.ARGOS_DATA?.trim()
        ? "Seçim kaydedildi ama ARGOS_DATA ortam değişkeni ağır basıyor."
        : `Seçim ${o.ayarYolu} dosyasına kaydedildi ama daha önce okunan bir ayar dosyası ağır basıyor.`;
    }
    return o;
  });

  /**
   * Anahtar dosyasını seçtirir. Klasör seçicinin eşi: ayarın ikinci yarısı
   * da uygulama içinden kurulabilsin.
   */
  ipcMain.handle(KANAL.ayarGizli, async (olay) => {
    const p = BrowserWindow.fromWebContents(olay.sender);
    const secenekler = {
      title: "Todoist anahtar dosyasını seç",
      properties: ["openFile" as const],
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: td.gizliYolu(),
    };
    const sonuc = p ? await dialog.showOpenDialog(p, secenekler) : await dialog.showOpenDialog(secenekler);
    const secilen = sonuc.filePaths[0];
    if (sonuc.canceled || !secilen) return null;

    await td.gizliAyarla(secilen);
    return td.durum();
  });

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
    // Yalnızca ana pencerede başlık kaplaması var; hızlı yakalama çerçevesiz.
    try {
      p.setTitleBarOverlay({ ...BASLIK_RENKLERI[tema] ?? BASLIK_RENKLERI.acik, height: 44 });
    } catch {
      // Kaplaması olmayan pencere: yapılacak bir şey yok.
    }
    // Yerel iletişim kutuları (dosya seçici, uyarı) da aynı tarafta kalsın.
    nativeTheme.themeSource = tema === "koyu" ? "dark" : "light";
  });

  // Todoist. Anahtar bu tarafta kalır; arayüz yalnızca sonucu görür.
  ipcMain.handle(KANAL.tdDurum, () => td.durum());
  ipcMain.handle(KANAL.tdProjeler, () => td.projeler());
  ipcMain.handle(KANAL.tdGorevler, (_o, projeId: string) => td.gorevler(projeId));
  ipcMain.handle(KANAL.tdBugun, () => td.bugunVeGecikmis());
  ipcMain.handle(KANAL.tdAralik, (_o, bas: string, son: string) => td.tarihAraligi(bas, son));
  ipcMain.handle(KANAL.tdEkle, (_o, g: Parameters<typeof td.ekle>[0]) => td.ekle(g));
  ipcMain.handle(KANAL.tdKapat, (_o, id: string) => td.kapat(id));
  ipcMain.handle(KANAL.tdAc, (_o, id: string) => td.ac(id));
  ipcMain.handle(KANAL.tdTarih, (_o, id: string, metin: string | null) => td.tarihVer(id, metin));

  // Hızlı yakalama penceresi ve komut paleti. Tepsi balonu yalnızca yakalama
  // penceresi için: palet hatayı kendi içinde gösteriyor.
  ipcMain.handle(KANAL.tdHizli, async (olay, metin: string) => {
    try {
      const gorev = await td.hizliEkle(String(metin ?? "").trim());
      todoistDegistiBildir();
      return gorev;
    } catch (e) {
      if (yakalamadanMi(olay.sender)) yakalamaHatasi(e instanceof Error ? e.message : String(e));
      throw e;
    }
  });
  ipcMain.handle(KANAL.yakalaGizle, () => yakalamayiGizle());
  ipcMain.handle(KANAL.yedekAc, () => yedekKlasorunuAc());
  ipcMain.handle(KANAL.bildirim, (_o, baslik: string, govde: string) =>
    bildirimGoster(String(baslik), String(govde)),
  );
  ipcMain.handle(KANAL.odakTepsi, (_o, metin: string | null) =>
    tepsiOdak(typeof metin === "string" ? metin : null),
  );
}
