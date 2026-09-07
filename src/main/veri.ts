import { app } from "electron";
import { existsSync } from "node:fs";
import type { Okuma, Ortam, Yazma } from "../ortak/tipler";
import { ayar, onerilenAyarYolu } from "./ayar";
import * as cekirdek from "./veri-cekirdek";

/**
 * Çekirdeğin (veri-cekirdek.ts) Electron'a bağlanan ince kabuğu: yalnızca
 * kök dizini çözer ve uygulama bilgisini verir. Dosya işleri çekirdekte.
 */

let _dataDir: string | null = null;

export function dataDir(): string {
  if (!_dataDir) _dataDir = ayar("dataDir", "../personnal_assistant/data", process.env.ARGOS_DATA);
  return _dataDir;
}

export function ortam(): Ortam {
  const d = dataDir();
  return {
    dataDir: d,
    dataDirVar: existsSync(d),
    ayarYolu: onerilenAyarYolu(),
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
