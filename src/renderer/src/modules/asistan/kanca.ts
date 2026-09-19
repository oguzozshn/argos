import { useCallback, useEffect, useState } from "react";
import { kopru } from "@/veri/kanca";
import { bugunIso, type Hafta, type HatirlaMaddesi } from "@ortak/plan";

/**
 * Güncel hafta dosyasını bulur ve okur.
 *
 * "En büyük numaralı dosya" yetmiyor: gelecek hafta önceden kurulabiliyor.
 * app.py'deki `en_guncel_hafta` ile aynı kural — bugünü İÇEREN hafta, yoksa
 * en son hafta.
 */
export function useGuncelHafta() {
  const [hafta, setHafta] = useState<Hafta | null>(null);
  /** Seçilen dosyanın kodu (W38); yazmak isteyen `useDosya` ile açar. */
  const [kod, setKod] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setYukleniyor(false);
      return;
    }
    try {
      const dosyalar = (await k.veri.listele("."))
        .filter((d) => /^W\d{1,2}\.json$/.test(d))
        .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));

      const bugun = bugunIso();
      let sonuncu: { v: Hafta; kod: string } | null = null;
      let iceren: { v: Hafta; kod: string } | null = null;

      for (const d of dosyalar) {
        const v = (await k.veri.oku<Hafta>(d)).veri;
        if (!v?.gunler?.length) continue;
        sonuncu = { v, kod: d.slice(0, -5) };
        const tarihler = v.gunler.map((g) => g.isoTarih).filter(Boolean);
        if (tarihler.length === 0) continue;
        const enKucuk = tarihler.reduce((a, b) => (a < b ? a : b));
        const enBuyuk = tarihler.reduce((a, b) => (a > b ? a : b));
        if (enKucuk <= bugun && bugun <= enBuyuk) {
          iceren = { v, kod: d.slice(0, -5) };
          break;
        }
      }
      const secilen = iceren ?? sonuncu;
      setHafta(secilen?.v ?? null);
      setKod(secilen?.kod ?? null);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    void tazele();
  }, [tazele]);

  // Asistan ya da eski uygulama hafta dosyasını değiştirirse ekran tazelensin.
  useEffect(() => {
    const k = kopru();
    if (!k) return;
    return k.degisimDinle((olay) => {
      if (/^W\d{1,2}\.json$/.test(olay.yol)) void tazele();
    });
  }, [tazele]);

  return { hafta, kod, yukleniyor };
}

interface HatirlaDosyasi {
  maddeler?: HatirlaMaddesi[];
}
interface KurallarParcasi {
  hatirla?: { gunlukAdet?: number };
}

export function useHatirla() {
  const [maddeler, setMaddeler] = useState<HatirlaMaddesi[]>([]);
  const [gunlukAdet, setGunlukAdet] = useState(3);
  const [yukleniyor, setYukleniyor] = useState(true);

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setYukleniyor(false);
      return;
    }
    try {
      const [h, kural] = await Promise.all([
        k.veri.oku<HatirlaDosyasi>("hatirla.json"),
        k.veri.oku<KurallarParcasi>("kurallar.json"),
      ]);
      setMaddeler(h.veri?.maddeler ?? []);
      setGunlukAdet(kural.veri?.hatirla?.gunlukAdet ?? 3);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    void tazele();
  }, [tazele]);

  useEffect(() => {
    const k = kopru();
    if (!k) return;
    return k.degisimDinle((olay) => {
      if (olay.yol === "hatirla.json" || olay.yol === "kurallar.json") void tazele();
    });
  }, [tazele]);

  return { maddeler, gunlukAdet, yukleniyor };
}
