import { useCallback, useEffect, useRef, useState } from "react";
import { tekrarAtla, vadesiGelenler } from "@ortak/duzenli";
import type { Islem, Tanimlar } from "@ortak/harcama";
import { kopru, useBugun } from "@/veri/kanca";
import {
  AY_DESENI,
  TANIM_YOLU,
  VARSAYILAN_TANIMLAR,
  ayinAdi,
  dosyaYolu,
  normalizeAy,
  normalizeTanimlar,
  yeniId,
} from "./tipler";

/**
 * Defterin tamamını okur ve yazar.
 *
 * Bütün ay dosyaları birden okunuyor: bakiye, kart tahmini ve son altı dönem
 * karşılaştırması zaten defterin tamamına bakıyor, dönem dönem okumak aynı
 * dosyaları birkaç kez açmak olurdu. `veri/plan.ts` hafta dosyalarını aynı
 * şekilde topluyor.
 *
 * Yazma her seferinde diskten okunup diske dönüyor (oku → değiştir → yaz).
 * Elde tutulan bayat bir `mtime` ile yazmaktansa taze olanla yazmak, aynı
 * klasöre başkası da yazarken kaybedilen değişikliği en aza indiriyor.
 */

export interface HarcamaVerisi {
  tanimlar: Tanimlar;
  islemler: Islem[];
  bugun: string;
  yukleniyor: boolean;
  hata: string | null;
  disaridanDegisti: boolean;
  /** Tanımlar dosyası hiç yoksa modül henüz kurulmamıştır. */
  kurulu: boolean;
  tazele: () => Promise<void>;
  tanimlariYaz: (t: Tanimlar) => Promise<boolean>;
  islemKaydet: (islem: Islem) => Promise<boolean>;
  islemlerEkle: (yeniler: Omit<Islem, "id">[]) => Promise<boolean>;
  islemSil: (id: string) => Promise<boolean>;
  /** Kural silinince üretilmiş işlemlerin kuralla bağını koparır. */
  duzenliBaginiKaldir: (duzenliId: string) => Promise<void>;
  /** Bir içe aktarmanın yazdığı her şeyi siler; kaç kayıt gittiğini döner. */
  partiGeriAl: (partiId: string) => Promise<number>;
}

const KOPRU_YOK = "Uygulama köprüsü yüklenmedi — veri okunamıyor.";

/**
 * Tohumlama ve düzenli işlem üretimi oturumda bir kez çalışır. Modül düzeyinde
 * duruyor çünkü aynı anda birden fazla ekran (ve Bugün kartı) aynı kancayı
 * kullanabilir; her biri ayrı ayrı üretmeye kalksa aynı kaydı iki kez yazardı.
 */
let kurulumYapildi = false;

export function useHarcama(kurulum = false): HarcamaVerisi {
  const [tanimlar, setTanimlar] = useState<Tanimlar>(VARSAYILAN_TANIMLAR);
  const [islemler, setIslemler] = useState<Islem[]>([]);
  const [kurulu, setKurulu] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [disaridanDegisti, setDisaridan] = useState(false);
  /**
   * Kendi yazmamız izleyiciyi tetikliyor; onu "dışarıdan" saymayalım. Tek bir
   * bayrak yetmiyor: bir işlem iki ay dosyasına birden dokunabiliyor, o zaman
   * ikinci olay dışarıdan sanılırdı. Yol yazılıyor, olay gelince siliniyor.
   */
  const kendiYazmalarimiz = useRef(new Set<string>());

  /** İzleyici hiç ateşlemezse iz takılı kalmasın; gerçek bir dış değişiklik yutulur. */
  const kendiYazdik = useCallback((yol: string) => {
    kendiYazmalarimiz.current.add(yol);
    window.setTimeout(() => kendiYazmalarimiz.current.delete(yol), 5000);
  }, []);

  const bugun = useBugun();

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setHata(KOPRU_YOK);
      setYukleniyor(false);
      return;
    }
    try {
      const tanimOkuma = await k.veri.oku(TANIM_YOLU);
      setKurulu(tanimOkuma.veri !== null);
      setTanimlar(tanimOkuma.veri === null ? VARSAYILAN_TANIMLAR : normalizeTanimlar(tanimOkuma.veri));

      const dosyalar = (await k.veri.listele("harcama")).filter((d) => AY_DESENI.test(d));
      const okunan = await Promise.all(
        dosyalar.map(async (d) => {
          const ay = d.slice(0, 7);
          return normalizeAy((await k.veri.oku(dosyaYolu(ay))).veri, ay);
        }),
      );
      setIslemler(okunan.flat());
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
      if (!olay.yol.startsWith("harcama/")) return;
      if (kendiYazmalarimiz.current.delete(olay.yol)) return;
      setDisaridan(true);
      void tazele();
      window.setTimeout(() => setDisaridan(false), 4000);
    });
  }, [tazele]);

  const tanimlariYaz = useCallback(
    async (yeni: Tanimlar): Promise<boolean> => {
      const k = kopru();
      if (!k) {
        setHata(KOPRU_YOK);
        return false;
      }
      setTanimlar(yeni);
      kendiYazdik(TANIM_YOLU);
      const mevcut = await k.veri.oku(TANIM_YOLU);
      const sonuc = await k.veri.yaz(TANIM_YOLU, yeni, mevcut.mtime);
      if (!sonuc.ok) {
        kendiYazmalarimiz.current.delete(TANIM_YOLU);
        setHata(cakismaMetni(sonuc.sebep));
        await tazele();
        return false;
      }
      setKurulu(true);
      setHata(null);
      return true;
    },
    [tazele, kendiYazdik],
  );

  /** Bir ay dosyasını oku → değiştir → yaz. Dosya yoksa `mtime` null olur, yenisi açılır. */
  const ayiDegistir = useCallback(
    async (ay: string, degistir: (mevcut: Islem[]) => Islem[]): Promise<boolean> => {
      const k = kopru();
      if (!k) {
        setHata(KOPRU_YOK);
        return false;
      }
      const okuma = await k.veri.oku(dosyaYolu(ay));
      const kalanlar = degistir(normalizeAy(okuma.veri, ay));
      kalanlar.sort((a, b) => (a.tarih === b.tarih ? (a.id < b.id ? -1 : 1) : a.tarih < b.tarih ? -1 : 1));
      kendiYazdik(dosyaYolu(ay));
      const sonuc = await k.veri.yaz(dosyaYolu(ay), { ay, islemler: kalanlar }, okuma.mtime);
      if (!sonuc.ok) {
        kendiYazmalarimiz.current.delete(dosyaYolu(ay));
        setHata(cakismaMetni(sonuc.sebep));
        return false;
      }
      setHata(null);
      return true;
    },
    [kendiYazdik],
  );

  /**
   * Düzenli kuraldan üretilmiş bir kayıt silindi ya da tarihi kaydı: kural o
   * tekrarı yapılmış saymalı, yoksa bir sonraki açılışta aynı kayıt geri gelir.
   */
  const tekrariAtla = useCallback(
    async (islem: Islem): Promise<void> => {
      const kural = tanimlar.duzenliler.find((d) => d.id === islem.duzenliId);
      if (!kural) return;
      const yeni = tekrarAtla(kural, islem.tarih);
      if (yeni === kural) return;
      await tanimlariYaz({
        ...tanimlar,
        duzenliler: tanimlar.duzenliler.map((d) => (d.id === kural.id ? yeni : d)),
      });
    },
    [tanimlar, tanimlariYaz],
  );

  const islemKaydet = useCallback(
    async (islem: Islem): Promise<boolean> => {
      const onceki = islemler.find((i) => i.id === islem.id);
      const yeniAy = ayinAdi(islem.tarih);

      // Tarih başka aya taşındıysa kayıt eski dosyadan çıkar: aynı işlem iki
      // dosyada birden durursa her rapor onu iki kez sayar.
      if (onceki && ayinAdi(onceki.tarih) !== yeniAy) {
        const temiz = await ayiDegistir(ayinAdi(onceki.tarih), (m) => m.filter((i) => i.id !== islem.id));
        if (!temiz) return false;
      }

      const ok = await ayiDegistir(yeniAy, (m) => [...m.filter((i) => i.id !== islem.id), islem]);
      if (ok && onceki && onceki.tarih !== islem.tarih) await tekrariAtla(onceki);
      await tazele();
      return ok;
    },
    [islemler, ayiDegistir, tekrariAtla, tazele],
  );

  const islemlerEkle = useCallback(
    async (yeniler: Omit<Islem, "id">[]): Promise<boolean> => {
      if (yeniler.length === 0) return true;
      const aylara: Map<string, Islem[]> = new Map();
      for (const y of yeniler) {
        const ay = ayinAdi(y.tarih);
        const liste = aylara.get(ay) ?? [];
        liste.push({ ...y, id: yeniId() });
        aylara.set(ay, liste);
      }
      let tumu = true;
      for (const [ay, liste] of aylara) {
        // Ay başına tek yazma: yirmi kayıt yirmi kez dosya açmasın.
        if (!(await ayiDegistir(ay, (m) => [...m, ...liste]))) tumu = false;
      }
      await tazele();
      return tumu;
    },
    [ayiDegistir, tazele],
  );

  const islemSil = useCallback(
    async (id: string): Promise<boolean> => {
      const islem = islemler.find((i) => i.id === id);
      if (!islem) return false;
      const ok = await ayiDegistir(ayinAdi(islem.tarih), (m) => m.filter((i) => i.id !== id));
      if (ok) await tekrariAtla(islem);
      await tazele();
      return ok;
    },
    [islemler, ayiDegistir, tekrariAtla, tazele],
  );

  /**
   * Kural silinince üretilmiş işlemler kalır — gerçekten harcanmış paradır,
   * silmek geçmişi yeniden yazmak olurdu. Ama kural işareti kalkmalı: kart
   * tahmini düzenli satırları geçmiş ortalamadan çıkarıp kurallardan geri
   * ekliyor, kuralı olmayan bir işaret o tutarı ikisinden de düşürürdü.
   */
  const duzenliBaginiKaldir = useCallback(
    async (duzenliId: string) => {
      const aylar = new Set(islemler.filter((i) => i.duzenliId === duzenliId).map((i) => ayinAdi(i.tarih)));
      for (const ay of aylar) {
        await ayiDegistir(ay, (m) =>
          m.map((i) => (i.duzenliId === duzenliId ? { ...i, duzenliId: undefined } : i)),
        );
      }
      await tazele();
    },
    [islemler, ayiDegistir, tazele],
  );

  /**
   * İçe aktarmayı geri alma: gerçek bir defterde ekstre denemesini geri
   * dönülebilir bir karar yapan emniyet ağı.
   */
  const partiGeriAl = useCallback(
    async (partiId: string): Promise<number> => {
      const silinecek = islemler.filter((i) => i.partiId === partiId);
      const aylar = new Set(silinecek.map((i) => ayinAdi(i.tarih)));
      for (const ay of aylar) {
        await ayiDegistir(ay, (m) => m.filter((i) => i.partiId !== partiId));
      }
      await tazele();
      return silinecek.length;
    },
    [islemler, ayiDegistir, tazele],
  );

  /**
   * Kurulum: tanımlar dosyası yoksa varsayılanlarla açılır, sonra vadesi gelmiş
   * düzenli işlemler yazılır. Uygulama bir hafta kapalı kaldıysa aradaki aylar
   * burada tamamlanıyor — kaydın kimliği `(kural, tarih)` çiftiyle korunduğu
   * için ikinci geçiş mükerrer üretmez.
   *
   * Yalnızca modülün kendi ekranlarından tetikleniyor: Bugün kartı, kullanıcı
   * modüle hiç girmemişken dosya açmasın.
   */
  useEffect(() => {
    if (!kurulum || yukleniyor || kurulumYapildi || !kopru()) return;
    kurulumYapildi = true;
    void (async () => {
      if (!kurulu) await tanimlariYaz(VARSAYILAN_TANIMLAR);
      const bekleyen = vadesiGelenler(tanimlar.duzenliler, islemler, bugun);
      if (bekleyen.length > 0) await islemlerEkle(bekleyen);
    })();
  }, [kurulum, yukleniyor, kurulu, tanimlar.duzenliler, islemler, bugun, tanimlariYaz, islemlerEkle]);

  return {
    tanimlar,
    islemler,
    bugun,
    yukleniyor,
    hata,
    disaridanDegisti,
    kurulu,
    tazele,
    tanimlariYaz,
    islemKaydet,
    islemlerEkle,
    islemSil,
    duzenliBaginiKaldir,
    partiGeriAl,
  };
}

const cakismaMetni = (sebep: "cakisma" | "hata"): string =>
  sebep === "cakisma"
    ? "Dosya dışarıdan değişti — güncel hâli yüklendi, değişikliğin yazılmadı."
    : "Yazma başarısız oldu.";

/**
 * Dönem tercihi ekran değiştirince kaybolmasın diye burada; makine tercihi
 * olduğu için `localStorage`'ta durur, veri klasörüne yazılmaz.
 */
export function useDonemKaydirmasi(): [number, (n: number) => void] {
  const anahtar = "argos.harcama.donem";
  const [kaydirma, setKaydirma] = useState(0);

  useEffect(() => {
    try {
      const ham = Number(localStorage.getItem(anahtar));
      setKaydirma(Number.isFinite(ham) ? ham : 0);
    } catch {
      setKaydirma(0);
    }
  }, []);

  const degistir = useCallback((n: number) => {
    setKaydirma(n);
    try {
      localStorage.setItem("argos.harcama.donem", String(n));
    } catch {
      // Depolama kapalıysa oturum boyunca geçerli kalır.
    }
  }, []);

  return [kaydirma, degistir];
}
