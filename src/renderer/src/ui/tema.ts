import { useCallback, useEffect, useState } from "react";
import { kopru } from "@/veri/kanca";

/**
 * Tema tercihi üç durumludur: sistem · açık · koyu. Varsayılan "sistem",
 * yani Windows gece moduna geçince uygulama da geçer.
 *
 * Tercih `localStorage`'ta durur, `data/` klasöründe değil: bu bir makine
 * tercihi, veri değil. Veri klasörü iki uygulamanın ortak alanı — arayüz
 * ayarıyla kirletilmez.
 */

export type TemaTercihi = "sistem" | "acik" | "koyu";
export type CozulmusTema = "acik" | "koyu";

const ANAHTAR = "argos.tema";

function tercihOku(): TemaTercihi {
  try {
    const x = localStorage.getItem(ANAHTAR);
    if (x === "acik" || x === "koyu" || x === "sistem") return x;
  } catch {
    // Depolama kapalıysa varsayılana düşer; hata değil.
  }
  return "sistem";
}

const sistemKoyu = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

const coz = (t: TemaTercihi): CozulmusTema =>
  t === "sistem" ? (sistemKoyu() ? "koyu" : "acik") : t;

export function useTema() {
  const [tercih, setTercihDurumu] = useState<TemaTercihi>(tercihOku);
  const [cozulen, setCozulen] = useState<CozulmusTema>(() => coz(tercihOku()));

  // Çözülmüş tema köke yazılır; token.css oradan okur. Pencere düğmelerinin
  // zemini yerel kaplama olduğu için ana sürece de bildirilir.
  useEffect(() => {
    document.documentElement.dataset.tema = cozulen;
    void kopru()?.temaUygula(cozulen);
  }, [cozulen]);

  // "sistem" seçiliyken Windows teması değişirse anında takip edilir.
  useEffect(() => {
    if (tercih !== "sistem" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const dinle = () => setCozulen(sistemKoyu() ? "koyu" : "acik");
    mq.addEventListener("change", dinle);
    return () => mq.removeEventListener("change", dinle);
  }, [tercih]);

  const setTercih = useCallback((t: TemaTercihi) => {
    setTercihDurumu(t);
    setCozulen(coz(t));
    try {
      localStorage.setItem(ANAHTAR, t);
    } catch {
      // Yazılamazsa oturum boyunca geçerli kalır.
    }
  }, []);

  /** Sırayla döner: sistem → açık → koyu → sistem. */
  const sonraki = useCallback(() => {
    setTercih(tercih === "sistem" ? "acik" : tercih === "acik" ? "koyu" : "sistem");
  }, [tercih, setTercih]);

  return { tercih, cozulen, setTercih, sonraki };
}
