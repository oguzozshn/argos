import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AYAR_ADLARI, ayarCoz } from "./veri-cekirdek";

/**
 * Ayarın nerede aranacağı. Tek yerde durur, çünkü aynı dosyalar iki şeyi
 * taşıyor: veri klasörü (veri.ts) ve Todoist anahtar dosyası (todoist.ts).
 *
 * Pakette iki kök var. Exe'nin yanı elle koymak için en görünür yer; ama
 * kurulum klasörü her sürümde silinip yeniden yazılıyor, oraya konan ayar
 * güncellemede kayboluyor. Kalıcı yer kullanıcı verisi klasörü — ikinci
 * sırada o okunur, exe'nin yanındaki varsa o kazanır.
 */
export function kokler(): string[] {
  return app.isPackaged ? [dirname(app.getPath("exe")), app.getPath("userData")] : [process.cwd()];
}

const okuyucu = (yol: string): string | null => (existsSync(yol) ? readFileSync(yol, "utf8") : null);

/** Bir ayar alanının mutlak karşılığı. Her çağrıda diskten okur. */
export const ayar = (alan: string, varsayilan: string, ortamYolu?: string): string =>
  ayarCoz(kokler(), alan, varsayilan, okuyucu, ortamYolu);

/**
 * Ayarın konması önerilen yer: kalıcı kök, yereli. Veri klasörü bulunamadığında
 * arayüz bu yolu gösteriyor — "düzelt" demek yetmiyor, nereye yazılacağı da
 * söylenmeli.
 */
export const onerilenAyarYolu = (): string => join(kokler().at(-1) ?? ".", AYAR_ADLARI[0]);
