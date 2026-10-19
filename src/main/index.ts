import { BrowserWindow, app, screen } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { botBaslat, botDurdur } from "./bot";
import { startTodoistSync } from "./todoist-sync";
import { ipcKur } from "./ipc";
import { yedekBaslat, yedekDurdur, yedekKlasorunuAc } from "./yedek";
import { izlemeyeBasla, izlemeyiDurdur } from "./izle";
import { durumuDogrula, type PencereDurumu } from "./pencere-durumu";
import { gezinmeyiKilitle, sayfayiYukle, webAyarlari } from "./sayfa";
import { odakMiniKur } from "./odak-mini";
import { anaPencereyiGoster, tepsiIpucu, tepsiKapat, tepsiKullanilabilir, tepsiKur, tepsiYedekAcici } from "./tepsi";
import { dataDir, ortam } from "./veri";

// Tek örnek: ikinci kez açılırsa var olan pencere öne gelir. İki örnek aynı
// JSON dosyalarına yazarsa çakışma kontrolü gereksiz yere devreye girer.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let pencere: BrowserWindow | null = null;
  /**
   * Gerçekten çıkılıyor mu. Değilse kapat düğmesi pencereyi tepsiye gizler.
   * Tepsi menüsündeki "Çıkış" ve Windows oturum kapanışı bunu açar; yoksa
   * gizleme kapanışı engeller, Windows da uygulamayı "kapanmıyor" diye bekletir.
   */
  let cikiliyor = false;

  app.on("second-instance", () => {
    // Pencere tepsideyse ikinci açılış onu geri getirir.
    anaPencereyiGoster();
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

  /**
   * Ana pencereyi öne getirir; yok olmuşsa yeniden kurar. İzleyici eski
   * pencereye bağlı ve ikinci kez başlamayı reddediyor: önce durdurulur.
   */
  async function anaPencereyiAc(): Promise<void> {
    if (!pencere || pencere.isDestroyed()) {
      if (cikiliyor) return;
      await izlemeyiDurdur();
      pencereKur();
      return;
    }
    if (pencere.isMinimized()) pencere.restore();
    pencere.show();
    pencere.focus();
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
      webPreferences: webAyarlari(),
    });

    // Beyaz parlama olmasın: hazır olunca göster.
    pencere.on("ready-to-show", () => {
      if (kayitli?.buyuk) pencere?.maximize();
      pencere?.show();
    });
    pencere.on("close", (olay) => {
      if (!pencere) return;
      durumYaz(pencere);
      // Tepside simge yoksa gizlemek pencereyi kaybetmek olur: gerçekten kapanır.
      if (cikiliyor || !tepsiKullanilabilir()) return;
      // Kapat düğmesi çıkmaz, tepsiye gizler: odak sayacı ve kısayol sürer.
      olay.preventDefault();
      pencere.hide();
      tepsiIpucu();
    });
    // Windows oturumu kapanırken gizleme kapanışı engellemesin.
    // Windows'ta sistem kapanışında before-quit gelmiyor, close da gelmeyebilir:
    // pencere durumu burada yazılır.
    pencere.on("session-end", () => {
      cikiliyor = true;
      if (pencere) durumYaz(pencere);
    });

    gezinmeyiKilitle(pencere);
    sayfayiYukle(pencere);

    izlemeyeBasla(pencere);
    pencere.on("closed", () => {
      pencere = null;
    });
  }

  // Windows bildirimleri uygulamanın kimliğini ister; yoksa bildirim hiç çıkmaz.
  app.setAppUserModelId("com.oguzozsahin.argos");

  app.whenReady().then(() => {
    console.log("[argos] veri klasörü:", dataDir());
    const o = ortam();
    for (const y of o.arananYollar) {
      console.log(`[argos] ayar arandı: ${y.bulundu ? "VAR" : "yok"} — ${y.yol}`);
    }
    ipcKur();
    pencereKur();
    tepsiKur(() => pencere, anaPencereyiAc);
    odakMiniKur(() => pencere, () => void anaPencereyiAc());
    botBaslat(() => pencere);
    tepsiYedekAcici(() => void yedekKlasorunuAc().catch((e) => console.error("[yedek] açılamadı:", e)));
    yedekBaslat();
    startTodoistSync(() => pencere);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) pencereKur();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    cikiliyor = true;
    botDurdur();
    yedekDurdur();
    void izlemeyiDurdur();
  });

  app.on("will-quit", () => {
    tepsiKapat();
  });
}
