import type { Uygulama } from "@ortak/bot";
import { kopru } from "./kanca";

/**
 * Bir veri dosyasını ekran açmadan günceller: oku → uygula → damgalı yaz.
 * Komut paleti gibi, dosyayı tutan bir `useDosya` örneği olmayan yerler için.
 *
 * Dosya okunduktan sonra dışarıdan değiştiyse (açık ekran, app.py) yeni hâl
 * üzerinden bir kez daha denenir. Açık ekranlar izleyiciden haber alıp
 * kendini tazeler.
 */
export async function dosyayiGuncelle<T>(
  yol: string,
  uygula: (veri: T | null) => Uygulama<T>,
): Promise<Uygulama<T>> {
  const k = kopru();
  if (!k) throw new Error("Uygulama köprüsü yok");
  let okuma = await k.veri.oku<T>(yol);
  for (let deneme = 0; deneme < 2; deneme++) {
    const u = uygula(okuma.veri);
    if (u.tur !== "eklendi") return u;
    const y = await k.veri.yaz(yol, u.veri, okuma.mtime);
    if (y.ok) return u;
    if (y.sebep === "hata") throw new Error(y.mesaj);
    okuma = y.guncel as typeof okuma;
  }
  throw new Error(`${yol} yazılırken iki kez değişti, yeniden dene`);
}
