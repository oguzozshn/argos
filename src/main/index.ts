import { BrowserWindow, app, screen, shell } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ipcKur } from "./ipc";
import { izlemeyeBasla, izlemeyiDurdur } from "./izle";
import { durumuDogrula, type PencereDurumu } from "./pencere-durumu";
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

  const EN_AZ = { width: 880, height: 600 };
  // Veri klasörüne değil: pencere bu makineye ait, eşitlenen klasöre değil.
  const durumYolu = () => join(app.getPath("userData"), "pencere.json");

  function durumOku(): PencereDurumu | null {
    try {
      const ham: unknown = JSON.parse(readFileSync(durumYolu(), "utf8"));
      return durumuDogrula(
        ham,
        screen.getAllDisplays().map((e) => e.workArea),
        EN_AZ,
      );
    } catch {
      return null;
    }
  }

  function durumYaz(p: BrowserWindow): void {
    try {
      // Büyütülmüşken getBounds büyük hâli verir; geri alınınca dönülecek
      // boyut normal sınırlar.
      const s = p.getNormalBounds();
      const d: PencereDurumu = { ...s, buyuk: p.isMaximized() };
      writeFileSync(durumYolu(), JSON.stringify(d) + "\n", "utf8");
    } catch (e) {
      console.error("[pencere] durum yazılamadı:", e);
    }
  }

  function pencereKur(): void {
    // Paketliyken ikon exe'den gelir; geliştirmede dosyadan verilir, yoksa
    // pencere Electron'un varsayılan ikonuyla açılırdı.
    const ikon = join(process.cwd(), "build", "icon.ico");
    const kayitli = durumOku();

    pencere = new BrowserWindow({
      ...(!app.isPackaged && existsSync(ikon) ? { icon: ikon } : {}),
      ...(kayitli
        ? { x: kayitli.x, y: kayitli.y, width: kayitli.width, height: kayitli.height }
        : { width: 1180, height: 800 }),
      minWidth: EN_AZ.width,
      minHeight: EN_AZ.height,
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
    pencere.on("ready-to-show", () => {
      if (kayitli?.buyuk) pencere?.maximize();
      pencere?.show();
    });
    pencere.on("close", () => pencere && durumYaz(pencere));

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
