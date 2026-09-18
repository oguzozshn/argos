import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TodoistGorev } from "@ortak/tipler";
import { kopru } from "./kanca";

/**
 * Takvimin görev kaynağı. Yapılacaklar modülünün kendi kancaları var; bu
 * dosya paylaşılan katmanda duruyor çünkü Takvim ayrı bir modül ve modüller
 * birbirini import etmiyor.
 */

const mesaj = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Saatli görevin saati; saatsizse null (gün boyu). */
export const gorevSaati = (g: TodoistGorev): string | null =>
  g.tarih && g.tarih.length > 10 ? g.tarih.slice(11, 16) : null;

/**
 * Todoist'e yazılacak tarih metni. Doğal dil değil, düz ISO: sürükleme
 * kullanıcının yazdığı bir şey değil, bizim ürettiğimiz kesin tarih.
 */
const tarihMetni = (iso: string, saat: string | null): string =>
  saat ? `${iso} ${saat}` : iso;

export interface AralikDurumu {
  gorevler: TodoistGorev[];
  /** Tarihe göre öbeklenmiş — takvim hücreleri bunu okuyor. */
  gunlere: Map<string, TodoistGorev[]>;
  /** Tarihi bugünden önce olan, hâlâ açık görevler. Aralıktan bağımsız gelir. */
  gecikmisler: TodoistGorev[];
  yukleniyor: boolean;
  /** Anahtar yoksa hata değil: takvim planı göstermeye devam eder. */
  anahtarYok: boolean;
  hata: string | null;
  tazele: () => Promise<void>;
  kapat: (g: TodoistGorev) => Promise<void>;
  /** Yeni görev — Inbox'a gider, tarihi verilen gün. */
  /** Eklendiyse true; hata `hata`da. Çağıran metni yalnızca başarıda temizlesin. */
  ekle: (iso: string, icerik: string, saat?: string | null) => Promise<boolean>;
  /** Görevi başka güne taşır; saati varsa saat korunur. */
  tarihiDegistir: (g: TodoistGorev, iso: string) => Promise<void>;
}

export function useTodoistAralik(basIso: string, sonIso: string, bugun: string): AralikDurumu {
  const [gorevler, setGorevler] = useState<TodoistGorev[]>([]);
  const [gecikmisler, setGecikmisler] = useState<TodoistGorev[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [anahtarYok, setAnahtarYok] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  /** Inbox proje id'si bir kez bulunur; her ekleme için proje listesi çekilmez. */
  const inbox = useRef<string | null>(null);

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k) {
      setYukleniyor(false);
      setAnahtarYok(true);
      return;
    }
    try {
      const d = await k.todoist.durum();
      setAnahtarYok(!d.anahtarVar);
      if (!d.anahtarVar) {
        setGorevler([]);
        setGecikmisler([]);
        return;
      }
      // İki sorgu: görünen aralık, bir de aralıktan bağımsız gecikmişler.
      const [aralik, bugunVe] = await Promise.all([
        k.todoist.tarihAraligi(basIso, sonIso),
        k.todoist.bugunVeGecikmis(),
      ]);
      setGorevler(aralik);
      setGecikmisler(bugunVe.filter((g) => (g.tarih ?? "").slice(0, 10) < bugun));
      setHata(null);
    } catch (e) {
      // Ağ hatası takvimi düşürmez; plan tarafı görünmeye devam eder.
      setHata(mesaj(e));
      setGorevler([]);
      setGecikmisler([]);
    } finally {
      setYukleniyor(false);
    }
  }, [basIso, sonIso, bugun]);

  useEffect(() => {
    setYukleniyor(true);
    void tazele();
  }, [tazele]);

  const gunlere = useMemo(() => {
    const m = new Map<string, TodoistGorev[]>();
    for (const g of gorevler) {
      if (!g.tarih) continue;
      const gun = g.tarih.slice(0, 10);
      const liste = m.get(gun);
      if (liste) liste.push(g);
      else m.set(gun, [g]);
    }
    // Saatli görevler önce, sonra saatsizler; ikisi de kendi içinde sıralı.
    for (const liste of m.values()) {
      liste.sort((a, b) => {
        const sa = a.tarih!.length > 10 ? a.tarih!.slice(11, 16) : "";
        const sb = b.tarih!.length > 10 ? b.tarih!.slice(11, 16) : "";
        if (sa && sb) return sa.localeCompare(sb);
        if (sa) return -1;
        if (sb) return 1;
        return b.oncelik - a.oncelik;
      });
    }
    return m;
  }, [gorevler]);

  /** Her iki listeden birden çıkarır/geri koyar — gecikmiş görev ikisinde de olabilir. */
  const cikar = useCallback((id: string) => {
    setGorevler((x) => x.filter((y) => y.id !== id));
    setGecikmisler((x) => x.filter((y) => y.id !== id));
  }, []);

  const kapat = useCallback(
    async (g: TodoistGorev) => {
      const k = kopru();
      if (!k) return;
      const gecikmisMiydi = (g.tarih ?? "").slice(0, 10) < bugun;
      cikar(g.id);
      try {
        await k.todoist.kapat(g.id);
      } catch (e) {
        setHata(mesaj(e));
        setGorevler((x) => [g, ...x]);
        if (gecikmisMiydi) setGecikmisler((x) => [g, ...x]);
      }
    },
    [bugun, cikar],
  );

  const ekle = useCallback(
    async (iso: string, icerik: string, saat?: string | null): Promise<boolean> => {
      const k = kopru();
      const metin = icerik.trim();
      if (!k || !metin) return false;
      try {
        if (!inbox.current) {
          const p = await k.todoist.projeler();
          const kutu = p.find((x) => x.inbox);
          if (!kutu) throw new Error("Inbox projesi bulunamadı");
          inbox.current = kutu.id;
        }
        const yeni = await k.todoist.ekle({
          icerik: metin,
          projeId: inbox.current,
          tarihMetni: tarihMetni(iso, saat ?? null),
        });
        setGorevler((x) => [...x, yeni]);
        setHata(null);
        return true;
      } catch (e) {
        setHata(mesaj(e));
        return false;
      }
    },
    [],
  );

  const tarihiDegistir = useCallback(
    async (g: TodoistGorev, iso: string) => {
      const k = kopru();
      if (!k) return;
      if (g.tarih?.slice(0, 10) === iso) return;
      const saat = gorevSaati(g);

      // Gecikmiş görev görünen aralığın dışından gelebilir; o zaman listede
      // yok, eklenmesi gerekir. Yerine koymak yetmiyor.
      const koy = (x: TodoistGorev) => (liste: TodoistGorev[]) =>
        liste.some((y) => y.id === x.id) ? liste.map((y) => (y.id === x.id ? x : y)) : [...liste, x];
      const at = (id: string) => (liste: TodoistGorev[]) => liste.filter((y) => y.id !== id);
      const listedeydi = gorevler.some((y) => y.id === g.id);

      // İyimser: görev hemen yeni güne geçer, istek düşerse eski hâli geri gelir.
      setGorevler(koy({ ...g, tarih: saat ? `${iso}T${saat}:00` : iso }));
      if (iso >= bugun) setGecikmisler(at(g.id));

      try {
        const guncel = await k.todoist.tarihVer(g.id, tarihMetni(iso, saat));
        setGorevler(koy(guncel));
        setHata(null);
      } catch (e) {
        setHata(mesaj(e));
        setGorevler(listedeydi ? koy(g) : at(g.id));
        if ((g.tarih ?? "").slice(0, 10) < bugun) setGecikmisler(koy(g));
      }
    },
    [bugun, gorevler],
  );

  return {
    gorevler,
    gunlere,
    gecikmisler,
    yukleniyor,
    anahtarYok,
    hata,
    tazele,
    kapat,
    ekle,
    tarihiDegistir,
  };
}
