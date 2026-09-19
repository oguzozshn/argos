import { useCallback, useEffect, useState } from "react";
import type { HaftaKayit, Kurallar, Roadmap } from "@ortak/ozet";
import { kopru, useBugun } from "@/veri/kanca";

/**
 * Plan verisinin ham hâli: hafta dosyaları, kurallar, yol haritaları,
 * hedefler. Birden fazla modül (Asistan, Takvim) okuduğu için `veri/` altında
 * durur — modüller birbirini import etmez.
 *
 * Özetler bundan TÜRETİLİR (`@ortak/ozet`), burada hesap yapılmaz — o
 * fonksiyonlar saf ve `app.py` ile parite testinden geçiyor.
 */
export interface PlanVerisi {
  haftalar: HaftaKayit[];
  kurallar: Kurallar;
  roadmapler: Roadmap[];
  hedefler: { hedefler?: { id: string }[] };
  bugun: string;
  yukleniyor: boolean;
  hata: string | null;
  /** Yazdıktan hemen sonra, izleyicinin haberini beklemeden yeniden oku. */
  tazele: () => Promise<void>;
}

const BOS: Omit<PlanVerisi, "yukleniyor" | "hata" | "bugun" | "tazele"> = {
  haftalar: [],
  kurallar: {},
  roadmapler: [],
  hedefler: { hedefler: [] },
};

export function usePlanVerisi(): PlanVerisi {
  const [veri, setVeri] = useState(BOS);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  // Okumaya bağlı değil: gece yarısı dosya değişmese de gün değişir.
  const bugun = useBugun();

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setYukleniyor(false);
      return;
    }
    try {
      const kokDosyalar = await k.veri.listele(".");
      const haftaDosyalari = kokDosyalar
        .filter((d) => /^W\d{1,2}\.json$/.test(d))
        .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));

      const haftalar = (
        await Promise.all(
          haftaDosyalari.map(async (d) => ({
            kod: d.slice(0, -5),
            veri: (await k.veri.oku(d)).veri,
          })),
        )
      ).filter((x) => x.veri) as HaftaKayit[];

      const rmDosyalari = await k.veri.listele("roadmap");
      const roadmapler = (
        await Promise.all(
          // app.py dosya adına göre sıralıyor; parite için aynı sıra.
          [...rmDosyalari]
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
            .map(async (d) => (await k.veri.oku<Roadmap>(`roadmap/${d}`)).veri),
        )
      ).filter(Boolean) as Roadmap[];

      const [kurallar, hedefler] = await Promise.all([
        k.veri.oku<Kurallar>("kurallar.json"),
        k.veri.oku<{ hedefler?: { id: string }[] }>("hedefler.json"),
      ]);

      setVeri({
        haftalar,
        kurallar: kurallar.veri ?? {},
        roadmapler,
        hedefler: hedefler.veri ?? { hedefler: [] },
      });
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
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
      if (
        /^W\d{1,2}\.json$/.test(olay.yol) ||
        olay.yol === "kurallar.json" ||
        olay.yol === "hedefler.json" ||
        olay.yol.startsWith("roadmap/")
      ) {
        void tazele();
      }
    });
  }, [tazele]);

  return { ...veri, bugun, yukleniyor, hata, tazele };
}

/** 165 → "2 sa 45 dk". app.py'deki `saat` yardımcısının karşılığı. */
export function saatMetni(dk: number): string {
  if (!dk) return "0 dk";
  const s = Math.floor(dk / 60);
  const k = dk % 60;
  if (!s) return `${k} dk`;
  return k ? `${s} sa ${k} dk` : `${s} sa`;
}
