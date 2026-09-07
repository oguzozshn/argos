import { BrowserWindow, app, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ipcKur } from "./ipc";
import { izlemeyeBasla, izlemeyiDurdur } from "./izle";
import { dataDir, ortam } from "./veri";

// Tek örnek: ikinci kez açılırsa var olan pencere öne gelir. İki örnek aynı
// JSON dosyalarına yazarsa çakışma kontrolü gereksiz yere devreye girer.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let pencere: BrowserWindow | null = null;

  app.on("second-instance", () => {
    if (!pencere) return;
    if (pencere.isMinimized()) pencere.restore();
    pencere.focus();
  });

  function pencereKur(): void {
    // Paketliyken ikon exe'den gelir; geliştirmede dosyadan verilir, yoksa
    // pencere Electron'un varsayılan ikonuyla açılırdı.
    const ikon = join(process.cwd(), "build", "icon.ico");

    pencere = new BrowserWindow({
      ...(!app.isPackaged && existsSync(ikon) ? { icon: ikon } : {}),
      width: 1180,
      height: 800,
      minWidth: 880,
      minHeight: 600,
      show: false,
      backgroundColor: "#F5F4F0",
      // Kendi başlık çubuğumuzu çiziyoruz ama pencere düğmeleri yerel kalıyor:
      // Windows 11'in yerleşim menüsü (hover) ve büyüt/küçült davranışı bozulmasın.
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#F5F4F0", symbolColor: "#5A574F", height: 44 },
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Beyaz parlama olmasın: hazır olunca göster.
    pencere.on("ready-to-show", () => pencere?.show());

    // Dış bağlantılar uygulamanın içinde açılmaz, tarayıcıya gider.
    pencere.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });

    const devSunucu = process.env["ELECTRON_RENDERER_URL"];
    if (devSunucu) pencere.loadURL(devSunucu);
    else pencere.loadFile(join(__dirname, "../renderer/index.html"));

    izlemeyeBasla(pencere);
    pencere.on("closed", () => {
      pencere = null;
    });
  }

  app.whenReady().then(() => {
    console.log("[argos] veri klasörü:", dataDir());
    const o = ortam();
    for (const y of o.arananYollar) {
      console.log(`[argos] ayar arandı: ${y.bulundu ? "VAR" : "yok"} — ${y.yol}`);
    }
    ipcKur();
    pencereKur();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) pencereKur();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    void izlemeyiDurdur();
  });
}
