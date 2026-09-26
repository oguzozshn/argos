import { useCallback, useRef, useState, type DragEvent } from "react";
import s from "./surukle.module.css";

/**
 * Sürükle-bırak gövdesi. Takvim ve Hafta ekranları aynı sözleşmeyi kullanıyor;
 * modüller birbirini import etmediği için ortak katmanda duruyor.
 *
 * Yük tipi dışarıdan geliyor: Takvim yalnızca görev taşıyor, Hafta hem görev
 * hem slot taşıyor ve hedefler hangisini kabul ettiğini kendisi söylüyor.
 *
 * Anahtar bir dizge — hedefi ne tanımlıyorsa o. Gün için ISO tarih, slot için
 * slot ID'si.
 */
export interface SurukleDurumu<Y> {
  /** Şu an sürüklenen yük; hiçbir şey sürüklenmiyorsa null. */
  aktif: Y | null;
  /** Üzerinde durulan hedefin anahtarı. */
  hedef: string | null;
  basla: (yuk: Y) => void;
  bitir: () => void;
  uzerinde: (anahtar: string | null) => void;
  birak: (anahtar: string) => void;
}

export function useSurukle<Y>(birakildi: (yuk: Y, anahtar: string) => void): SurukleDurumu<Y> {
  const [aktif, setAktif] = useState<Y | null>(null);
  const [hedef, setHedef] = useState<string | null>(null);
  // Bırakma anında yükü state'ten değil ref'ten okuyoruz: state güncellemesi
  // ertelenebilir, bırakma ertelenemez.
  const yuk = useRef<Y | null>(null);

  const basla = useCallback((y: Y) => {
    yuk.current = y;
    setAktif(y);
  }, []);

  const bitir = useCallback(() => {
    yuk.current = null;
    setAktif(null);
    setHedef(null);
  }, []);

  const birak = useCallback(
    (anahtar: string) => {
      const y = yuk.current;
      yuk.current = null;
      setAktif(null);
      setHedef(null);
      if (y !== null) birakildi(y, anahtar);
    },
    [birakildi],
  );

  return { aktif, hedef, basla, bitir, uzerinde: setHedef, birak };
}

/**
 * Sürüklenen öğenin nitelikleri. `kapali` verilirse öğe sürüklenmez —
 * tekrarlı görevde olduğu gibi, taşımanın yasak olduğu durumlar için.
 */
export function kaynakOzellikleri<Y>(
  yuk: Y,
  sr: SurukleDurumu<Y>,
  secenek: { kapali?: boolean } = {},
) {
  if (secenek.kapali) return { draggable: false };
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      // İç içe sürüklenebilir öğe var: slot satırının içindeki görev cipi
      // sürüklenirken slot sürüklenmemeli.
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
      sr.basla(yuk);
    },
    onDragEnd: () => sr.bitir(),
  };
}

/** Hedefin bu yükü kabul edip etmediği; `kabul` verilmezse her yük kabul edilir. */
const kabulEder = <Y,>(sr: SurukleDurumu<Y>, kabul?: (yuk: Y) => boolean): boolean =>
  sr.aktif !== null && (!kabul || kabul(sr.aktif));

/**
 * Hedefin içindeki konumu da önemliyse verilen kancalar. Takvim ekseninde
 * bırakılan görev sütunun neresine düştüğüne göre saat alıyor.
 *
 * `gezinme` ayrı bir `onDragOver` yazmak yerine kanca olarak veriliyor:
 * yayılan nitelikten sonra kendi `onDragOver`'ını yazan hedef, buradaki
 * `preventDefault`'u ezer ve bırakma hiç çalışmaz.
 */
export interface HedefSecenegi {
  /** Bırakma anında anahtarı olaydan üretir; verilmezse sabit anahtar kullanılır. */
  birakAnahtari?: (e: DragEvent) => string;
  /** Sürükleme hedefin üstünde gezerken; saat önizlemesi için. */
  gezinme?: (e: DragEvent) => void;
}

/** Bırakma hedefinin nitelikleri. Kabul etmeyen hedef hiç dinlemez. */
export function hedefOzellikleri<Y>(
  anahtar: string,
  sr: SurukleDurumu<Y>,
  kabul?: (yuk: Y) => boolean,
  secenek: HedefSecenegi = {},
) {
  if (!kabulEder(sr, kabul)) return {};
  return {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move" as const;
      secenek.gezinme?.(e);
    },
    onDragEnter: () => sr.uzerinde(anahtar),
    onDragLeave: () => sr.uzerinde(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      // İç hedef dıştakine de düşmesin: slota bırakılan görev güne düşmez.
      e.stopPropagation();
      sr.birak(secenek.birakAnahtari?.(e) ?? anahtar);
    },
  };
}

/** Hedefin görünür sınıfı: sürükleme sürerken çerçeve, üstündeyken dolgu. */
export function hedefSinifi<Y>(
  anahtar: string,
  sr: SurukleDurumu<Y>,
  kabul?: (yuk: Y) => boolean,
): string | false {
  if (!kabulEder(sr, kabul)) return false;
  return sr.hedef === anahtar ? s.hedefUstunde : s.hedef;
}
