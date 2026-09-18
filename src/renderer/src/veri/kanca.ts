import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bugunIso } from "@ortak/plan";
import { disDegisimBekcisi, sirali } from "@ortak/sirali";
import type { ArgosApi, Okuma, Ortam, Yazma } from "@ortak/tipler";

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
  // Diskte olduğu bilinen son hâl. Yazma hata verirse ekran buna döner —
  // iyimser güncellemeler üst üste bindiği için "bir önceki" değer yetmez.
  const diskteki = useRef<T | null>(null);

  const uygula = useCallback((o: Okuma<T>) => {
    mtime.current = o.mtime;
    diskteki.current = o.veri;
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

  // Tuş başına yazma: bir seferde tek yazma uçuşta, arada gelenler birikir.
  // Yoksa ikinci yazma eski mtime'la gidip kendi yazmamıza çarpıyordu.
  // Bekçi izleyici olaylarını ayıklıyor; kuyruk boşalınca kaçan olaya bakıyor.
  const { kuyruk, bekci } = useMemo(() => {
    const kuyruk = sirali(
      async (yeni: T): Promise<Yazma> => {
        const k = kopru();
        if (!k) return { ok: false, sebep: "hata", mesaj: KOPRU_YOK };
        const sonuc = await k.veri.yaz(yol, yeni, mtime.current);
        if (sonuc.ok) {
          mtime.current = sonuc.mtime;
          diskteki.current = yeni;
        }
        return sonuc;
      },
      (r) => r.ok,
      () => void bekci.kuyrukBosaldi(),
    );
    const bekci = disDegisimBekcisi({
      kuyruk,
      oku: async () => {
        const k = kopru();
        if (!k) throw new Error(KOPRU_YOK);
        return k.veri.oku<T>(yol);
      },
      bilinen: () => mtime.current,
      uygula: (o) => {
        uygula(o);
        setDisaridan(true);
        window.setTimeout(() => setDisaridan(false), 4000);
      },
    });
    return { kuyruk, bekci };
  }, [yol, uygula]);

  useEffect(() => {
    const k = kopru();
    if (!k) return;
    return k.degisimDinle((olay) => {
      if (olay.yol !== yol) return;
      bekci.olay().catch((e: unknown) => setHata(e instanceof Error ? e.message : String(e)));
    });
  }, [yol, bekci]);

  const yaz = useCallback(
    async (yeni: T): Promise<boolean> => {
      if (!kopru()) {
        setHata(KOPRU_YOK);
        return false;
      }

      // İyimser güncelleme: ekran beklemez, hata dönerse geri alınır.
      setVeri(yeni);

      const sonuc = await kuyruk(yeni);
      if (sonuc.ok) {
        setHata(null);
        return true;
      }

      if (sonuc.sebep === "cakisma") {
        uygula(sonuc.guncel as Okuma<T>);
        setHata("Dosya dışarıdan değişti — güncel hâli yüklendi, değişikliğin yazılmadı.");
      } else {
        setVeri(diskteki.current);
        setHata(sonuc.mesaj);
      }
      return false;
    },
    [kuyruk, uygula],
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

export function useOrtam(): [Ortam | null, (o: Ortam) => void] {
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
  return [o, setO];
}

/**
 * Bugünün tarihi (yerel, YYYY-AA-GG) — gece yarısı kendiliğinden değişir.
 *
 * Uygulama günlerce açık kalabiliyor. Açılışta bir kez hesaplanan "bugün",
 * gece yarısından sonra dünü gösteriyor, yeni işlemin varsayılan tarihini de
 * düne atıyordu. Uyku sonrası zamanlayıcı kaçabileceği için pencere öne
 * gelince de yeniden bakılır.
 */
export function useBugun(): string {
  const [bugun, setBugun] = useState(bugunIso);
  useEffect(() => {
    let zamanlayici: number | undefined;
    const bak = () => setBugun(bugunIso());
    const kur = () => {
      const s = new Date();
      const yarin = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
      // Bir saniye pay: tam sınırda tetiklenip hâlâ dünü okumasın.
      zamanlayici = window.setTimeout(
        () => {
          bak();
          kur();
        },
        yarin.getTime() - s.getTime() + 1000,
      );
    };
    kur();
    window.addEventListener("focus", bak);
    document.addEventListener("visibilitychange", bak);
    return () => {
      window.clearTimeout(zamanlayici);
      window.removeEventListener("focus", bak);
      document.removeEventListener("visibilitychange", bak);
    };
  }, []);
  return bugun;
}
