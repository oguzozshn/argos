import { app } from "electron";
import { existsSync } from "node:fs";
import type { Okuma, Ortam, Yazma } from "../ortak/tipler";
import { arananYollar, ayar, ayarKaydet, onerilenAyarYolu, taniYaz } from "./ayar";
import * as cekirdek from "./veri-cekirdek";

/**
 * Çekirdeğin (veri-cekirdek.ts) Electron'a bağlanan ince kabuğu: yalnızca
 * kök dizini çözer ve uygulama bilgisini verir. Dosya işleri çekirdekte.
 */

let _dataDir: string | null = null;
/** Son çözüm denemesinde nereye bakıldı, ne görüldü. */
let _arananlar: { yol: string; bulundu: boolean }[] = [];

/**
 * Veri klasörü. Çözüm YALNIZCA başarılıysa saklanır.
 *
 * Kurulumdan hemen sonraki ilk açılışta ayar dosyası bir an okunamıyor:
 * virüs taraması yeni kurulan uygulamayı tarıyor, eşitleme istemcisi
 * dosyaya giriyor. `existsSync` her hatayı sessizce "yok" diye döndürdüğü
 * için bu, dosyanın olmaması gibi görünüyor.
 *
 * Başarısız çözümü ömür boyu saklamak, kilit kalktıktan sonra bile uygulama
 * kapanana dek boş ekran demekti. Artık çözülen klasör ortada yoksa bir
 * sonraki çağrıda yeniden aranıyor — kilit kalkınca kendiliğinden düzeliyor.
 */
export function dataDir(): string {
  if (_dataDir && existsSync(_dataDir)) return _dataDir;
  const onceki = _dataDir;
  _arananlar = arananYollar();
  _dataDir = ayar("dataDir", "../personnal_assistant/data", process.env.ARGOS_DATA);
  const var_ = existsSync(_dataDir);
  // Her çözüm denemesi tanıya yazılır: dosya son durumu gösterir, ilk
  // denemeyi değil. Toparlanma da böyle görünüyor.
  taniYaz(_dataDir, var_, _arananlar);
  // Klasör kendiliğinden bulunduysa izleyici hâlâ eski (olmayan) yeri
  // dinliyor olabilir; haber verilir.
  if (var_ && _dataDir !== onceki) klasorDinleyici?.(_dataDir);
  return _dataDir;
}

let klasorDinleyici: ((yeni: string) => void) | null = null;

/** Çözülen veri klasörü değişince çağrılır. Tek dinleyici: izleyici. */
export function klasorDegisince(f: ((yeni: string) => void) | null): void {
  klasorDinleyici = f;
}

/**
 * Kullanıcının seçtiği klasörü kalıcı ayara yazar ve çözümü sıfırlar.
 * Bir sonraki `dataDir()` yeni değeri okur.
 */
export async function klasorAyarla(yol: string): Promise<void> {
  await ayarKaydet("dataDir", yol.split("\\").join("/"));
  _dataDir = null;
}

export function ortam(): Ortam {
  const d = dataDir();
  return {
    dataDir: d,
    dataDirVar: existsSync(d),
    ayarYolu: onerilenAyarYolu(),
    arananYollar: _arananlar,
    surum: app.getVersion(),
    platform: process.platform,
    paketli: app.isPackaged,
  };
}

export const oku = <T = unknown,>(yol: string): Promise<Okuma<T>> => cekirdek.oku<T>(dataDir(), yol);

export const yaz = (yol: string, icerik: unknown, mtime: number | null): Promise<Yazma> =>
  cekirdek.yaz(dataDir(), yol, icerik, mtime);

export const listele = (klasor: string): Promise<string[]> => cekirdek.listele(dataDir(), klasor);

export const sil = (yol: string): Promise<{ ok: boolean }> => cekirdek.sil(dataDir(), yol);
