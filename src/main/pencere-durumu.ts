/**
 * Pencerenin boyutu, konumu ve büyütülmüş olup olmadığı — kapanırken
 * yazılır, açılırken okunur. Her açılışta 1180×800'e dönmek, her gün aynı
 * pencereyi elle büyütmek demekti.
 *
 * Electron'a bağlı değil: ekran listesi dışarıdan verilir, düz Node ile
 * test edilir.
 */

export interface Dikdortgen {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PencereDurumu extends Dikdortgen {
  buyuk: boolean;
}

/** Görünür sayılmak için pencerenin bir ekranda kalması gereken en az parça. */
const EN_AZ_GORUNEN = 120;

const sayiMi = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Kayıtlı durumu doğrular. Bozuksa, çok küçükse ya da hiçbir ekranda
 * yeterince görünmüyorsa (ikinci monitör çıkarıldı) null — pencere
 * varsayılanla açılır, ekran dışında kaybolmaz.
 */
export function durumuDogrula(
  ham: unknown,
  ekranlar: Dikdortgen[],
  enAz: { width: number; height: number },
): PencereDurumu | null {
  if (!ham || typeof ham !== "object") return null;
  const d = ham as Record<string, unknown>;
  const { x, y, width, height } = d;
  if (!sayiMi(x) || !sayiMi(y) || !sayiMi(width) || !sayiMi(height)) return null;
  if (width < enAz.width || height < enAz.height) return null;

  const gorunur = ekranlar.some((e) => {
    const yatay = Math.min(x + width, e.x + e.width) - Math.max(x, e.x);
    const dikey = Math.min(y + height, e.y + e.height) - Math.max(y, e.y);
    return yatay >= EN_AZ_GORUNEN && dikey >= EN_AZ_GORUNEN;
  });
  if (!gorunur) return null;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    buyuk: d.buyuk === true,
  };
}
