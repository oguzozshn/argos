import { watch, type FSWatcher } from "chokidar";
import type { BrowserWindow } from "electron";
import { relative, sep } from "node:path";
import { KANAL, type DegisimOlayi } from "../ortak/tipler";
import { dataDir, klasorDegisince } from "./veri";

/**
 * Veri klasörü iki uygulama tarafından yazılıyor: burası ve eski app.py
 * (sabah mutabakatı, asistan düzenlemeleri). Dışarıdan gelen değişiklik
 * arayüze bildirilir ki ekranda bayat veri kalmasın.
 */

let izleyici: FSWatcher | null = null;
let izlenen: string | null = null;
/** Ana süreçteki dinleyiciler (Telegram eşitlemesi); izleyici yeniden kurulsa da kalır. */
const aboneler = new Set<(yol: string) => void>();

/** Veri klasöründe bir dosya eklenince, değişince ya da silinince çağrılır. Göreli yol, `/` ayraçlı. */
export function degisimeAbone(f: (yol: string) => void): () => void {
  aboneler.add(f);
  return () => aboneler.delete(f);
}

export function izlemeyeBasla(pencere: BrowserWindow): void {
  if (izleyici) return;

  // Açılışta klasör bulunamadıysa izleyici olmayan bir yeri dinler. Klasör
  // sonradan bulununca yeni yere taşınır; yoksa dış değişiklikler görünmez.
  klasorDegisince((yeni) => {
    // Kurulum sırasındaki ilk çözüm de buraya düşer; izleyici henüz yokken
    // yeniden başlatmak çift izleyici demek.
    if (!izleyici || yeni === izlenen || pencere.isDestroyed()) return;
    void izlemeyiDurdur().then(() => izlemeyeBasla(pencere));
  });

  const kok = dataDir();
  izlenen = kok;
  izleyici = watch(kok, {
    ignoreInitial: true,
    depth: 4,
    // Yedek ve geçici dosyalar olay üretmesin; kendi yazmamız da .tmp kullanıyor.
    ignored: (yol) => /\.(bak|tmp)$|[\\/]\.git[\\/]/.test(yol),
    // Yazma bitmeden okumaya kalkmayalım — yarım JSON parse hatası verir.
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  });

  const bildir = (tur: DegisimOlayi["tur"]) => (tamYol: string) => {
    const yol = relative(kok, tamYol).split(sep).join("/");
    for (const f of aboneler) f(yol);
    if (pencere.isDestroyed()) return;
    pencere.webContents.send(KANAL.degisim, { yol, tur } satisfies DegisimOlayi);
  };

  izleyici
    .on("add", bildir("eklendi"))
    .on("change", bildir("degisti"))
    .on("unlink", bildir("silindi"))
    .on("error", (e) => console.error("[izle]", e));
}

export async function izlemeyiDurdur(): Promise<void> {
  const eski = izleyici;
  izleyici = null;
  izlenen = null;
  await eski?.close();
}
