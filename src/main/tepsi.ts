import { BrowserWindow, Menu, Tray, app, globalShortcut, nativeImage, screen, type MenuItemConstructorOptions } from "electron";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KANAL } from "../ortak/tipler";
import { gezinmeyiKilitle, sayfayiYukle, webAyarlari } from "./sayfa";

/**
 * Tepsi simgesi, genel kısayol ve hızlı yakalama penceresi.
 *
 * Pencere kapatılınca uygulama tepside kalır: odak sayacı sürer, kısayol
 * çalışır. Çıkış tepsi menüsünden. Kısayol uygulama arkadayken de küçük bir
 * pencere açar; yazılan satır Todoist'e doğal dil hızlı eklemeyle gider.
 */

export const YAKALA_KISAYOLU = "Control+Alt+N";
const KISAYOL_METNI = "Ctrl+Alt+N";

let tepsi: Tray | null = null;
let yakala: BrowserWindow | null = null;
let anaPencere: () => BrowserWindow | null = () => null;
let anaGoster: () => void = () => undefined;
/** Tepside görünür bir simge var mı. Yoksa pencereyi gizlemek onu kaybetmek olur. */
let simgeVar = false;
let kisayolAlindi = true;
/** Telegram eşitlemesinin son hâli; ayar yoksa null ve menüde satır yok. */
let botDurumu: { tamam: boolean; zaman: Date; hata?: string } | null = null;
let cikiliyor = false;

/** Paketliyken ikon kaynaklara kopyalanıyor (package.json `extraResources`). */
function ikonYolu(): string {
  return app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(process.cwd(), "build", "icon.ico");
}

/**
 * Ana pencereyi öne getirir; yok olmuşsa (renderer'dan window.close, çökme)
 * yeniden kurdurur. Yoksa elde işe yaramayan bir tepsi simgesi kalırdı.
 */
export function anaPencereyiGoster(): void {
  anaGoster();
}

/** Kapat düğmesi pencereyi gizleyebilir mi: yalnızca tepside görünür bir simge varsa. */
export const tepsiKullanilabilir = (): boolean => simgeVar && tepsi !== null;

export function tepsiKur(ana: () => BrowserWindow | null, goster: () => void): void {
  anaPencere = ana;
  anaGoster = goster;
  app.on("before-quit", () => {
    cikiliyor = true;
  });
  const yol = ikonYolu();
  const ikon = existsSync(yol) ? nativeImage.createFromPath(yol) : nativeImage.createEmpty();
  simgeVar = !ikon.isEmpty();
  if (!simgeVar) console.error(`[tepsi] ikon bulunamadı: ${yol} — kapat düğmesi pencereyi gizlemeyecek`);
  tepsi = new Tray(ikon);
  tepsi.setToolTip("Argos");
  tepsi.on("click", anaPencereyiGoster);
  menuKur();

  const kaydedildi = globalShortcut.register(YAKALA_KISAYOLU, yakalamayiAcKapat);
  if (!kaydedildi) {
    // Başka bir uygulama kısayolu tutuyor. Konsolu kimse görmüyor: tepsiden
    // söylenir, pencere menüden yine açılabilir.
    console.error(`[tepsi] ${KISAYOL_METNI} kaydedilemedi — başka bir uygulama kullanıyor olabilir`);
    kisayolAlindi = false;
    menuKur();
    tepsi.displayBalloon({
      title: `${KISAYOL_METNI} kullanılamıyor`,
      content: "Başka bir uygulama bu kısayolu tutuyor. Hızlı görev eklemeyi tepsi simgesinin menüsünden açabilirsin.",
      iconType: "warning",
    });
  }

  // İlk açılış yavaş olmasın: pencere arkada hazır beklesin.
  yakalaPenceresi();
}

/** Telegram eşitlemesinin sonucu; menüdeki durum satırı güncellenir. */
export function tepsiBotDurumu(d: typeof botDurumu): void {
  botDurumu = d;
  menuKur();
}

function botSatiri(): MenuItemConstructorOptions[] {
  if (!botDurumu) return [];
  const saat = botDurumu.zaman.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const label = botDurumu.tamam
    ? `Telegram: son eşitleme ${saat}`
    : `Telegram: eşitlenemedi (${saat}) — ${botDurumu.hata ?? "bilinmeyen hata"}`;
  return [{ label, enabled: false }, { type: "separator" }];
}

function menuKur(): void {
  const kisayolVar = kisayolAlindi;
  tepsi?.setContextMenu(
    Menu.buildFromTemplate([
      ...botSatiri(),
      { label: "Argos'u aç", click: anaPencereyiGoster },
      {
        label: kisayolVar ? `Hızlı görev ekle\t${KISAYOL_METNI}` : "Hızlı görev ekle (kısayol alınamadı)",
        click: yakalamayiGoster,
      },
      { type: "separator" },
      { label: "Çıkış", click: () => app.quit() },
    ]),
  );
}

export function tepsiKapat(): void {
  globalShortcut.unregister(YAKALA_KISAYOLU);
  tepsi?.destroy();
  tepsi = null;
}

/**
 * Pencere ilk kez tepsiye gizlenince bir kez söylenir; kullanıcı uygulamanın
 * kapandığını sanıp ikinci kez açmaya çalışmasın. İşaret makineye ait.
 */
export function tepsiIpucu(): void {
  const isaret = join(app.getPath("userData"), "tepsi-ipucu-gosterildi");
  if (!tepsi || existsSync(isaret)) return;
  tepsi.displayBalloon({
    title: "Argos arka planda çalışıyor",
    content: `Pencereyi kapatınca tepside kalır. ${KISAYOL_METNI} ile hızlı görev ekle; çıkmak için simgeye sağ tıkla.`,
    iconType: "info",
  });
  try {
    writeFileSync(isaret, new Date().toISOString(), "utf8");
  } catch {
    // Yazılamazsa bir dahaki gizlemede yine söylenir; zararı yok.
  }
}

/* --- hızlı yakalama penceresi ---------------------------------------------- */

const YAKALA_EN = 640;
const YAKALA_BOY = 168;

function yakalaPenceresi(): BrowserWindow {
  if (yakala && !yakala.isDestroyed()) return yakala;
  yakala = new BrowserWindow({
    width: YAKALA_EN,
    height: YAKALA_BOY,
    show: false,
    frame: false,
    // Gölge ve yuvarlak köşe arayüzde çiziliyor; pencere zemini saydam.
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "Argos — hızlı ekle",
    webPreferences: webAyarlari(),
  });
  gezinmeyiKilitle(yakala);
  sayfayiYukle(yakala, "yakala");
  // Başka yere tıklanınca kaybolur (Todoist Quick Add gibi).
  yakala.on("blur", () => yakala?.hide());
  yakala.on("closed", () => {
    yakala = null;
    // Alt+F4 ile yok edildiyse arkada yeniden hazırlansın: kısayolla açılınca
    // yüklenmemiş, boş bir kare görünmesin.
    if (!cikiliyor) setTimeout(() => void yakalaPenceresi(), 0);
  });
  return yakala;
}

function yakalamayiGoster(): void {
  const p = yakalaPenceresi();
  // İmlecin olduğu ekranda, üst üçte birde: göz orada.
  const ekran = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  p.setBounds({
    x: Math.round(ekran.x + (ekran.width - YAKALA_EN) / 2),
    y: Math.round(ekran.y + ekran.height * 0.22),
    width: YAKALA_EN,
    height: YAKALA_BOY,
  });
  p.show();
  p.focus();
  p.webContents.send(KANAL.yakalaAcildi);
}

function yakalamayiAcKapat(): void {
  if (yakala && !yakala.isDestroyed() && yakala.isVisible()) yakala.hide();
  else yakalamayiGoster();
}

/**
 * Gönderim sürerken başka yere tıklanınca pencere gizlenir; hata dönerse
 * gizli pencerede kalır ve görev sessizce kaybolurdu. O durumda tepsiden
 * söylenir.
 */
export function yakalamaHatasi(mesaj: string): void {
  if (yakala && !yakala.isDestroyed() && yakala.isVisible()) return;
  tepsi?.displayBalloon({ title: "Görev eklenemedi", content: mesaj, iconType: "error" });
}

export function yakalamayiGizle(): void {
  if (yakala && !yakala.isDestroyed()) yakala.hide();
}

/** Hızlı eklemeden sonra ana penceredeki görev listeleri tazelensin. */
export function todoistDegistiBildir(): void {
  const p = anaPencere();
  if (p && !p.isDestroyed()) p.webContents.send(KANAL.tdDegisti);
}
