import { BrowserWindow, app, ipcMain, screen } from "electron";
import { KANAL, type OdakMiniDurum, type OdakMiniKomut } from "../ortak/tipler";
import { gezinmeyiKilitle, sayfayiYukle, webAyarlari } from "./sayfa";

/**
 * Odak's floating mini window (like TickTick's): a small always-on-top
 * timer that can be dragged anywhere. It keeps no timer of its own; the
 * main window sends its state, and the mini window's buttons go back to it
 * as commands, so the two never disagree.
 */

const EN = 240;
const BOY = 84;

let mini: BrowserWindow | null = null;
/** Where it was last left, for this run. */
let yer: { x: number; y: number } | null = null;

export function odakMiniKur(ana: () => BrowserWindow | null, anaGoster: () => void): void {
  ipcMain.handle(KANAL.odakMiniAc, () => odakMiniAc());
  ipcMain.handle(KANAL.odakMiniKapat, () => mini?.close());
  // The main window's state, every second: passed on only while the mini window is open.
  ipcMain.on(KANAL.odakMiniDurum, (_o, d: OdakMiniDurum) => {
    if (mini && !mini.isDestroyed()) mini.webContents.send(KANAL.odakMiniDurum, d);
  });
  ipcMain.on(KANAL.odakMiniKomut, (_o, k: OdakMiniKomut) => {
    if (k !== "baslat" && k !== "duraklat" && k !== "ac") return;
    if (k === "ac") anaGoster();
    ana()?.webContents.send(KANAL.odakMiniKomut, k);
  });
  app.on("before-quit", () => mini?.destroy());
}

export function odakMiniAc(): void {
  if (mini && !mini.isDestroyed()) {
    mini.show();
    return;
  }
  // First time: the bottom right corner of the screen the pointer is on.
  const ekran = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const { x, y } = yer ?? { x: ekran.x + ekran.width - EN - 24, y: ekran.y + ekran.height - BOY - 24 };
  mini = new BrowserWindow({
    x,
    y,
    width: EN,
    height: BOY,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: "Argos — odak",
    webPreferences: webAyarlari(),
  });
  // Above other windows, full-screen ones included.
  mini.setAlwaysOnTop(true, "floating");
  mini.setVisibleOnAllWorkspaces(true);
  gezinmeyiKilitle(mini);
  sayfayiYukle(mini, "odak");
  mini.once("ready-to-show", () => mini?.showInactive());
  mini.on("moved", () => {
    if (!mini) return;
    const b = mini.getBounds();
    yer = { x: b.x, y: b.y };
  });
  mini.on("closed", () => {
    mini = null;
  });
}
