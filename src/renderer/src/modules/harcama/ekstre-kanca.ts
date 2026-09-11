import { useCallback, useEffect, useMemo, useRef } from "react";
import { kuralYerlestir, tohumKurallari, type EkstreDosyasi, type Kural, type Parti } from "@ortak/ekstre-aktar";
import type { Kategori } from "@ortak/harcama";
import { useDosya } from "@/veri/kanca";
import { EKSTRE_YOLU, normalizeEkstre, yeniId } from "./tipler";

/**
 * Kategori kuralları ve içe aktarma partileri. Defterin kendisinden ayrı bir
 * dosyada durduğu için ayrı bir kanca; yalnızca ekstre ekranı okuyor.
 *
 * Kurallar dosya ilk kez oluşurken tohumlanıyor: ilk içe aktarma bile çoğu
 * satırı kategorili getirsin diye.
 */

export interface EkstreVerisi {
  kurallar: Kural[];
  partiler: Parti[];
  yukleniyor: boolean;
  hata: string | null;
  kuralKaydet: (icerir: string, kategoriId: string, transfer: boolean) => Promise<Kural | null>;
  kuralSil: (id: string) => Promise<void>;
  /**
   * Partiyi ve uygulanan kuralların sayacını tek yazmada kaydeder. İkisi ayrı
   * yazılsaydı ikincisi, birincinin eklediğini görmeyen bir kopyanın üstüne
   * yazıp partiyi düşürürdü.
   */
  aktarmayiKaydet: (parti: Parti, kuralIdler: string[]) => Promise<boolean>;
  partiSil: (id: string) => Promise<void>;
}

let tohumlandi = false;

export function useEkstre(kategoriler: Kategori[]): EkstreVerisi {
  const dosya = useDosya<EkstreDosyasi>(EKSTRE_YOLU);
  const veri = useMemo(() => normalizeEkstre(dosya.veri), [dosya.veri]);
  const tohumSuruyor = useRef(false);

  useEffect(() => {
    if (dosya.yukleniyor || dosya.veri !== null || tohumlandi || tohumSuruyor.current) return;
    if (kategoriler.length === 0) return;
    tohumlandi = true;
    tohumSuruyor.current = true;
    void dosya.yaz({ kurallar: tohumKurallari(kategoriler), partiler: [] });
  }, [dosya, kategoriler]);

  const kuralKaydet = useCallback(
    async (icerir: string, kategoriId: string, transfer: boolean): Promise<Kural | null> => {
      const id = yeniId();
      const kurallar = kuralYerlestir(veri.kurallar, { icerir, kategoriId, transfer }, id);
      if (!kurallar) return null;
      await dosya.yaz({ ...veri, kurallar });
      // Yerleştirme ya yeni kuralı ekledi ya da aynı deseni taşıyanı güncelledi.
      return kurallar.find((k) => k.id === id) ?? kurallar.find((k) => k.kategoriId === kategoriId) ?? null;
    },
    [veri, dosya],
  );

  const kuralSil = useCallback(
    async (id: string) => {
      await dosya.yaz({ ...veri, kurallar: veri.kurallar.filter((k) => k.id !== id) });
    },
    [veri, dosya],
  );

  const aktarmayiKaydet = useCallback(
    async (parti: Parti, kuralIdler: string[]) => {
      const sayilacak = new Set(kuralIdler.filter(Boolean));
      return dosya.yaz({
        kurallar: veri.kurallar.map((k) => (sayilacak.has(k.id) ? { ...k, kullanim: k.kullanim + 1 } : k)),
        partiler: [parti, ...veri.partiler],
      });
    },
    [veri, dosya],
  );

  const partiSil = useCallback(
    async (id: string) => {
      await dosya.yaz({ ...veri, partiler: veri.partiler.filter((p) => p.id !== id) });
    },
    [veri, dosya],
  );

  return {
    kurallar: veri.kurallar,
    partiler: veri.partiler,
    yukleniyor: dosya.yukleniyor,
    hata: dosya.hata,
    kuralKaydet,
    kuralSil,
    aktarmayiKaydet,
    partiSil,
  };
}
