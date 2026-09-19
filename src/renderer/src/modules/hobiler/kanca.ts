import { useCallback, useEffect, useState } from "react";
import { kopru } from "@/veri/kanca";
import { dosyaYolu, normalize, type Alan } from "./tipler";

/**
 * `data/hobiler/` klasöründeki alanları listeler. Ayrı bir dizin dosyası
 * tutulmuyor — klasörün kendisi listedir, yani ikinci bir gerçek yok.
 */
export function useAlanlar() {
  const [alanlar, setAlanlar] = useState<
    { slug: string; ad: string; adet: number; veri: Alan | null }[]
  >([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setYukleniyor(false);
      return;
    }
    try {
      const dosyalar = await k.veri.listele("hobiler");
      const okunan = await Promise.all(
        dosyalar.map(async (d) => {
          const slug = d.replace(/\.json$/, "");
          // Tek bozuk dosya bütün listeyi götürmesin: o alan boş görünür,
          // diğerleri açılır.
          const veri = await k.veri
            .oku(`hobiler/${d}`)
            .then((o) => normalize(o.veri, slug))
            .catch(() => null);
          return { slug, ad: veri?.ad || slug, adet: veri?.maddeler.length ?? 0, veri };
        }),
      );
      setAlanlar(okunan);
    } catch (e) {
      console.error("[hobiler]", e);
    } finally {
      // Hata olsa da iskelet ekranda sonsuza dek kalmasın.
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    void tazele();
  }, [tazele]);

  // Alan eklenip silinmesi dosya sistemi olayıdır; izleyiciden gelir.
  useEffect(() => {
    const k = kopru();
    if (!k) return;
    return k.degisimDinle((olay) => {
      if (olay.yol.startsWith("hobiler/")) void tazele();
    });
  }, [tazele]);

  const alanEkle = useCallback(
    async (slug: string, alan: Alan): Promise<boolean> => {
      const k = kopru();
      if (!k) return false;
      const mevcut = await k.veri.oku(dosyaYolu(slug));
      if (mevcut.veri !== null) return false; // aynı adlı alan var
      const sonuc = await k.veri.yaz(dosyaYolu(slug), alan, null);
      await tazele();
      return sonuc.ok;
    },
    [tazele],
  );

  const alanSil = useCallback(
    async (slug: string): Promise<boolean> => {
      const k = kopru();
      if (!k) return false;
      const { ok } = await k.veri.sil(dosyaYolu(slug));
      await tazele();
      return ok;
    },
    [tazele],
  );

  return { alanlar, yukleniyor, alanEkle, alanSil, tazele };
}

/**
 * Görünüm biçimi alan başına hatırlanır: Oyunlar ızgara, Kitaplar satır
 * olabilir. Makine tercihi olduğu için `localStorage`'ta durur.
 */
export type Gorunum = "satir" | "izgara";

export function useGorunum(slug: string): [Gorunum, (g: Gorunum) => void] {
  const anahtar = `argos.gorunum.${slug}`;
  const [g, setG] = useState<Gorunum>("satir");

  useEffect(() => {
    try {
      setG(localStorage.getItem(anahtar) === "izgara" ? "izgara" : "satir");
    } catch {
      setG("satir");
    }
  }, [anahtar]);

  const degistir = useCallback(
    (yeni: Gorunum) => {
      setG(yeni);
      try {
        localStorage.setItem(anahtar, yeni);
      } catch {
        // Depolama kapalıysa oturum boyunca geçerli kalır.
      }
    },
    [anahtar],
  );

  return [g, degistir];
}

/**
 * Hangi durum gruplarının kapalı olduğu, alan başına. Hiç dokunulmadıysa
 * bitmiş ve bırakılmış olanlar kapalı başlar: liste şu an ilgilenilenleri
 * göstersin, arşivi değil. Görünüm gibi makine tercihi, `localStorage`'ta.
 */
const VARSAYILAN_KAPALI = new Set(["bitti", "bıraktım"]);

export function useKapaliGruplar(
  slug: string,
  durumAdlari: string[],
): [Set<string>, (durum: string) => void] {
  const anahtar = `argos.kapali.${slug}`;
  const [kayitli, setKayitli] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const ham = localStorage.getItem(anahtar);
      const dizi: unknown = ham ? JSON.parse(ham) : null;
      setKayitli(Array.isArray(dizi) ? dizi.filter((x) => typeof x === "string") : null);
    } catch {
      setKayitli(null);
    }
  }, [anahtar]);

  const kapali =
    kayitli !== null
      ? new Set(kayitli)
      : new Set(durumAdlari.filter((d) => VARSAYILAN_KAPALI.has(d.toLocaleLowerCase("tr"))));

  const cevir = (durum: string) => {
    const yeni = new Set(kapali);
    if (yeni.has(durum)) yeni.delete(durum);
    else yeni.add(durum);
    const dizi = [...yeni];
    setKayitli(dizi);
    try {
      localStorage.setItem(anahtar, JSON.stringify(dizi));
    } catch {
      // Depolama kapalıysa oturum boyunca geçerli kalır.
    }
  };

  return [kapali, cevir];
}
