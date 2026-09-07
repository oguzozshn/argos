import { useCallback, useEffect, useRef, useState } from "react";
import type { ArgosApi, Okuma, Ortam } from "@ortak/tipler";

/**
 * Bir JSON dosyasını okur, dışarıdan değişirse kendini tazeler, yazarken
 * çakışmayı yakalar.
 *
 * Çakışma neden var: aynı `data/` klasörüne eski Python uygulaması ve sabah
 * mutabakatı da yazıyor. Yazma anında dosya değişmişse yazmayız — diskteki
 * hâli alır, kullanıcıya söyleriz. Sessiz üzerine yazmak veri kaybıdır.
 */

/**
 * Preload köprüsü. Yüklenemezse (preload hatası, ya da sayfa Electron dışında
 * açılmışsa) null döner — arayüz beyaz ekran vermek yerine sebebi söyler.
 */
export function kopru(): ArgosApi | null {
  return typeof window !== "undefined" && window.argos ? window.argos : null;
}

/** Köprü oturum boyunca ya vardır ya yoktur; her çağrıda sorgulamaya gerek yok. */
export const KOPRU_VAR = kopru() !== null;

const KOPRU_YOK = "Uygulama köprüsü yüklenmedi — veri okunamıyor.";

export interface DosyaDurumu<T> {
  veri: T | null;
  yukleniyor: boolean;
  hata: string | null;
  /** Dışarıdan değişiklik geldi ve tazelendi — arayüz kısa bir not gösterebilir. */
  disaridanDegisti: boolean;
  yaz: (yeni: T) => Promise<boolean>;
  tazele: () => Promise<void>;
}

export function useDosya<T>(yol: string): DosyaDurumu<T> {
  const [veri, setVeri] = useState<T | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [disaridanDegisti, setDisaridan] = useState(false);
  const mtime = useRef<number | null>(null);
  // Kendi yazmamız izleyiciyi tetikliyor; onu "dışarıdan" saymayalım.
  const bizYazdik = useRef(false);

  const uygula = useCallback((o: Okuma<T>) => {
    mtime.current = o.mtime;
    setVeri(o.veri);
  }, []);

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setHata(KOPRU_YOK);
      setYukleniyor(false);
      return;
    }
    try {
      uygula(await k.veri.oku<T>(yol));
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }, [yol, uygula]);

  useEffect(() => {
    setYukleniyor(true);
    void tazele();
  }, [tazele]);

  useEffect(() => {
    const k = kopru();
    if (!k) return;
    return k.degisimDinle((olay) => {
      if (olay.yol !== yol) return;
      if (bizYazdik.current) {
        bizYazdik.current = false;
        return;
      }
      setDisaridan(true);
      void tazele();
      window.setTimeout(() => setDisaridan(false), 4000);
    });
  }, [yol, tazele]);

  const yaz = useCallback(
    async (yeni: T): Promise<boolean> => {
      const k = kopru();
      if (!k) {
        setHata(KOPRU_YOK);
        return false;
      }

      // İyimser güncelleme: ekran beklemez, hata dönerse geri alınır.
      const oncekiVeri = veri;
      setVeri(yeni);
      bizYazdik.current = true;

      const sonuc = await k.veri.yaz(yol, yeni, mtime.current);
      if (sonuc.ok) {
        mtime.current = sonuc.mtime;
        setHata(null);
        return true;
      }

      bizYazdik.current = false;
      if (sonuc.sebep === "cakisma") {
        uygula(sonuc.guncel as Okuma<T>);
        setHata("Dosya dışarıdan değişti — güncel hâli yüklendi, değişikliğin yazılmadı.");
      } else {
        setVeri(oncekiVeri);
        setHata(sonuc.mesaj);
      }
      return false;
    },
    [yol, veri, uygula],
  );

  return { veri, yukleniyor, hata, disaridanDegisti, yaz, tazele };
}

/**
 * Veri klasörünün durumu.
 *
 * Klasör bulunamadıysa bir süre yeniden sorulur. Kurulumdan hemen sonraki
 * ilk açılışta ayar dosyası bir an okunamıyor (tarama, eşitleme); kilit
 * kalkınca ana süreç yeniden çözüyor ve uyarı kendiliğinden kalkıyor.
 * Bulunduysa soru bitiyor — klasör uygulama boyunca değişmiyor.
 */
const YENIDEN_SORMA_ADEDI = 5;
const YENIDEN_SORMA_MS = 2000;

export function useOrtam(): Ortam | null {
  const [o, setO] = useState<Ortam | null>(null);
  useEffect(() => {
    const k = kopru();
    if (!k) return;
    let birakildi = false;
    let kalan = YENIDEN_SORMA_ADEDI;
    let zamanlayici: number | undefined;

    const sor = () => {
      void k.ortam().then((x) => {
        if (birakildi) return;
        setO(x);
        if (x.dataDirVar || kalan <= 0) return;
        kalan -= 1;
        zamanlayici = window.setTimeout(sor, YENIDEN_SORMA_MS);
      });
    };
    sor();

    return () => {
      birakildi = true;
      window.clearTimeout(zamanlayici);
    };
  }, []);
  return o;
}
