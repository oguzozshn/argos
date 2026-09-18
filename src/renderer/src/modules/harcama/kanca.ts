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
  /** Son okuma eksiksiz geldi mi — varsayılan tanımlar değil, gerçekleri ekranda. */
  yuklendi: boolean;
  tazele: () => Promise<void>;
  tanimlariYaz: (t: Tanimlar) => Promise<boolean>;
  /**
   * Diskteki güncel tanımlar üzerinden değişiklik. Geri alma gibi saniyeler
   * sonra (belki başka ekrandan) çalışan işler için: aradaki düzenlemeleri ezmez.
   */
  tanimlariDegistir: (f: (mevcut: Tanimlar) => Tanimlar) => Promise<boolean>;
  islemKaydet: (islem: Islem) => Promise<boolean>;
  islemlerEkle: (yeniler: Omit<Islem, "id">[]) => Promise<boolean>;
  islemSil: (id: string) => Promise<boolean>;
  /** Silinmiş işlemi aynı kimlikle geri koyar; düzenli kuraldaki atlama işaretini kaldırır. */
  islemGeriYukle: (islem: Islem) => Promise<boolean>;
  /**
   * Kural silinince üretilmiş işlemlerin kuralla bağını koparır. Bağı
   * koparılan işlemlerin kimliklerini döner (geri alma için); yazılamadıysa null.
   */
  duzenliBaginiKaldir: (duzenliId: string) => Promise<string[] | null>;
  /** `duzenliBaginiKaldir`ın tersi: verilen işlemleri kurala yeniden bağlar. */
  duzenliBaginiGeriKoy: (duzenliId: string, islemIdleri: string[]) => Promise<boolean>;
  /** Bir içe aktarmanın yazdığı her şeyi siler. Silinen işlem sayısı; bir ay yazılamadıysa null. */
  partiGeriAl: (partiId: string) => Promise<number | null>;
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
  // Okuma ve yazma hataları ayrı: her yazmanın ardından `tazele` çalışıyor ve
  // başarılı okuma, az önce düşen yazmanın hatasını silmemeli.
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [yazmaHatasi, setYazmaHatasi] = useState<string | null>(null);
  const hata = yazmaHatasi ?? okumaHatasi;
  /** Son okuma eksiksiz geldi mi. Kurulum yalnızca buna güvenir. */
  const [yuklendi, setYuklendi] = useState(false);
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
      setOkumaHatasi(KOPRU_YOK);
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
      setOkumaHatasi(null);
      setYuklendi(true);
    } catch (e) {
      setYuklendi(false);
      setOkumaHatasi(e instanceof Error ? e.message : String(e));
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
        setYazmaHatasi(KOPRU_YOK);
        return false;
      }
      setTanimlar(yeni);
      kendiYazdik(TANIM_YOLU);
      const mevcut = await k.veri.oku(TANIM_YOLU);
      const sonuc = await k.veri.yaz(TANIM_YOLU, yeni, mevcut.mtime);
      if (!sonuc.ok) {
        kendiYazmalarimiz.current.delete(TANIM_YOLU);
        setYazmaHatasi(cakismaMetni(sonuc.sebep));
        await tazele();
        return false;
      }
      setKurulu(true);
      setYazmaHatasi(null);
      return true;
    },
    [tazele, kendiYazdik],
  );

  const tanimlariDegistir = useCallback(
    async (f: (mevcut: Tanimlar) => Tanimlar): Promise<boolean> => {
      const k = kopru();
      if (!k) {
        setYazmaHatasi(KOPRU_YOK);
        return false;
      }
      const okuma = await k.veri.oku(TANIM_YOLU);
      const mevcut = okuma.veri === null ? VARSAYILAN_TANIMLAR : normalizeTanimlar(okuma.veri);
      const yeni = f(mevcut);
      if (yeni === mevcut) return true;
      setTanimlar(yeni);
      kendiYazdik(TANIM_YOLU);
      const sonuc = await k.veri.yaz(TANIM_YOLU, yeni, okuma.mtime);
      if (!sonuc.ok) {
        kendiYazmalarimiz.current.delete(TANIM_YOLU);
        setYazmaHatasi(cakismaMetni(sonuc.sebep));
        await tazele();
        return false;
      }
      setKurulu(true);
      setYazmaHatasi(null);
      return true;
    },
    [tazele, kendiYazdik],
  );

  /** Bir ay dosyasını oku → değiştir → yaz. Dosya yoksa `mtime` null olur, yenisi açılır. */
  const ayiDegistir = useCallback(
    async (ay: string, degistir: (mevcut: Islem[]) => Islem[]): Promise<boolean> => {
      const k = kopru();
      if (!k) {
        setYazmaHatasi(KOPRU_YOK);
        return false;
      }
      const okuma = await k.veri.oku(dosyaYolu(ay));
      const kalanlar = degistir(normalizeAy(okuma.veri, ay));
      kalanlar.sort((a, b) => (a.tarih === b.tarih ? (a.id < b.id ? -1 : 1) : a.tarih < b.tarih ? -1 : 1));
      kendiYazdik(dosyaYolu(ay));
      const sonuc = await k.veri.yaz(dosyaYolu(ay), { ay, islemler: kalanlar }, okuma.mtime);
      if (!sonuc.ok) {
        kendiYazmalarimiz.current.delete(dosyaYolu(ay));
        setYazmaHatasi(cakismaMetni(sonuc.sebep));
        return false;
      }
      setYazmaHatasi(null);
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
      if (!islem.duzenliId) return;
      await tanimlariDegistir((t) => {
        const kural = t.duzenliler.find((d) => d.id === islem.duzenliId);
        const yeni = kural && tekrarAtla(kural, islem.tarih);
        if (!kural || yeni === kural) return t;
        return { ...t, duzenliler: t.duzenliler.map((d) => (d.id === kural.id ? yeni! : d)) };
      });
    },
    [tanimlariDegistir],
  );

  const islemGeriYukle = useCallback(
    async (islem: Islem): Promise<boolean> => {
      const ok = await ayiDegistir(ayinAdi(islem.tarih), (m) => [...m.filter((i) => i.id !== islem.id), islem]);
      // Silerken kural bu tekrarı "yapıldı" saymıştı; geri gelince işaret kalkmalı.
      if (ok && islem.duzenliId) {
        await tanimlariDegistir((t) => {
          const kural = t.duzenliler.find((d) => d.id === islem.duzenliId);
          if (!kural?.atlananlar?.includes(islem.tarih)) return t;
          const atlananlar = kural.atlananlar.filter((x) => x !== islem.tarih);
          return {
            ...t,
            duzenliler: t.duzenliler.map((d) => (d.id === kural.id ? { ...d, atlananlar } : d)),
          };
        });
      }
      await tazele();
      return ok;
    },
    [ayiDegistir, tanimlariDegistir, tazele],
  );

  const islemKaydet = useCallback(
    async (islem: Islem): Promise<boolean> => {
      const onceki = islemler.find((i) => i.id === islem.id);
      const yeniAy = ayinAdi(islem.tarih);

      // Önce yeni aya yazılır, sonra eskisinden çıkarılır. Tersi sırada ikinci
      // yazma düşerse kayıt iki dosyadan da kaybolurdu; bu sırada en kötü
      // ihtimal geçici bir kopya, o da hata olarak görünür.
      let ok = await ayiDegistir(yeniAy, (m) => [...m.filter((i) => i.id !== islem.id), islem]);
      if (ok && onceki && ayinAdi(onceki.tarih) !== yeniAy) {
        ok = await ayiDegistir(ayinAdi(onceki.tarih), (m) => m.filter((i) => i.id !== islem.id));
        if (!ok) {
          setYazmaHatasi(
            `İşlem ${yeniAy} ayına yazıldı ama ${ayinAdi(onceki.tarih)} dosyasından silinemedi — iki ayda birden görünebilir.`,
          );
        }
      }
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
    async (duzenliId: string): Promise<string[] | null> => {
      const bagli = islemler.filter((i) => i.duzenliId === duzenliId);
      const aylar = new Set(bagli.map((i) => ayinAdi(i.tarih)));
      let tumu = true;
      for (const ay of aylar) {
        const ok = await ayiDegistir(ay, (m) =>
          m.map((i) => (i.duzenliId === duzenliId ? { ...i, duzenliId: undefined } : i)),
        );
        if (!ok) tumu = false;
      }
      await tazele();
      return tumu ? bagli.map((i) => i.id) : null;
    },
    [islemler, ayiDegistir, tazele],
  );

  const duzenliBaginiGeriKoy = useCallback(
    async (duzenliId: string, islemIdleri: string[]): Promise<boolean> => {
      const k = kopru();
      if (!k) return false;
      const idler = new Set(islemIdleri);
      // Ay, silme anındaki kayıttan değil diskten bulunur: işlem arada başka
      // aya taşınmış olabilir. Bağlanamayan tek kayıt bile varsa başarı sayılmaz.
      const dosyalar = (await k.veri.listele("harcama")).filter((d) => AY_DESENI.test(d));
      let baglanan = 0;
      let tumu = true;
      for (const d of dosyalar) {
        const ay = d.slice(0, 7);
        const icinde = normalizeAy((await k.veri.oku(dosyaYolu(ay))).veri, ay).filter((i) => idler.has(i.id)).length;
        if (icinde === 0) continue;
        if (await ayiDegistir(ay, (m) => m.map((i) => (idler.has(i.id) ? { ...i, duzenliId } : i)))) baglanan += icinde;
        else tumu = false;
      }
      await tazele();
      return tumu && baglanan === idler.size;
    },
    [ayiDegistir, tazele],
  );

  /**
   * İçe aktarmayı geri alma: gerçek bir defterde ekstre denemesini geri
   * dönülebilir bir karar yapan emniyet ağı.
   */
  const partiGeriAl = useCallback(
    async (partiId: string): Promise<number | null> => {
      const silinecek = islemler.filter((i) => i.partiId === partiId);
      const aylar = new Set(silinecek.map((i) => ayinAdi(i.tarih)));
      let tumu = true;
      for (const ay of aylar) {
        if (!(await ayiDegistir(ay, (m) => m.filter((i) => i.partiId !== partiId)))) tumu = false;
      }
      await tazele();
      // Null: bir ay yazılamadı. Parti kaydı silinirse kalan işlemler bir daha
      // geri alınamaz; çağıran onu tutmalı.
      return tumu ? silinecek.length : null;
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
    // Yalnızca eksiksiz bir okumadan sonra: tanım dosyası geçici olarak
    // okunamadıysa varsayılanlar gerçek tanımların üstüne yazılır, bir ay
    // dosyası okunamadıysa o ayın düzenli kayıtları yeniden üretilirdi.
    if (!kurulum || yukleniyor || !yuklendi || kurulumYapildi || !kopru()) return;
    kurulumYapildi = true;
    void (async () => {
      if (!kurulu) await tanimlariYaz(VARSAYILAN_TANIMLAR);
      const bekleyen = vadesiGelenler(tanimlar.duzenliler, islemler, bugun);
      if (bekleyen.length > 0) await islemlerEkle(bekleyen);
    })();
  }, [kurulum, yukleniyor, yuklendi, kurulu, tanimlar.duzenliler, islemler, bugun, tanimlariYaz, islemlerEkle]);

  return {
    tanimlar,
    islemler,
    bugun,
    yukleniyor,
    hata,
    disaridanDegisti,
    kurulu,
    yuklendi,
    tazele,
    tanimlariYaz,
    tanimlariDegistir,
    islemKaydet,
    islemlerEkle,
    islemSil,
    islemGeriYukle,
    duzenliBaginiKaldir,
    duzenliBaginiGeriKoy,
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
