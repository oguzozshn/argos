import { watch, type FSWatcher } from "chokidar";
import type { BrowserWindow } from "electron";
import { relative, sep } from "node:path";
import { KANAL, type DegisimOlayi } from "../ortak/tipler";
import { dataDir } from "./veri";

/**
 * Veri klasörü iki uygulama tarafından yazılıyor: burası ve eski app.py
 * (sabah mutabakatı, asistan düzenlemeleri). Dışarıdan gelen değişiklik
 * arayüze bildirilir ki ekranda bayat veri kalmasın.
 */

let izleyici: FSWatcher | null = null;

export function izlemeyeBasla(pencere: BrowserWindow): void {
  if (izleyici) return;

  izleyici = watch(dataDir(), {
    ignoreInitial: true,
    depth: 4,
    // Yedek ve geçici dosyalar olay üretmesin; kendi yazmamız da .tmp kullanıyor.
    ignored: (yol) => /\.(bak|tmp)$|[\\/]\.git[\\/]/.test(yol),
    // Yazma bitmeden okumaya kalkmayalım — yarım JSON parse hatası verir.
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  });

  const bildir = (tur: DegisimOlayi["tur"]) => (tamYol: string) => {
    if (pencere.isDestroyed()) return;
    const yol = relative(dataDir(), tamYol).split(sep).join("/");
    pencere.webContents.send(KANAL.degisim, { yol, tur } satisfies DegisimOlayi);
  };

  izleyici
    .on("add", bildir("eklendi"))
    .on("change", bildir("degisti"))
    .on("unlink", bildir("silindi"))
    .on("error", (e) => console.error("[izle]", e));
}

export async function izlemeyiDurdur(): Promise<void> {
  await izleyici?.close();
  izleyici = null;
}
