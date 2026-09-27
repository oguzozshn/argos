import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  gorevSaati as saatiCoz,
  hedefSaat,
  iyimserTarih,
  tasimaGereksiz,
  todoistTarihi,
  type BirakmaSaati,
} from "@ortak/gorev-zaman";
import { tasksInRange, updateTask } from "@ortak/local-tasks";
import { localAsTodoist } from "@ortak/task";
import type { TodoistGorev } from "@ortak/tipler";
import { tekrarMetni, type TekrarTuru } from "@ortak/todoist-tarih";
import { silVeBildir } from "@/ui/toast";
import { kopru, useBugun } from "./kanca";
import { completeLocalWithUndo, useLocalTasks } from "./local-tasks";

/**
 * Takvimin görev kaynağı. Yapılacaklar modülünün kendi kancaları var; bu
 * dosya paylaşılan katmanda duruyor çünkü Takvim ayrı bir modül ve modüller
 * birbirini import etmiyor.
 */

const mesaj = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Saatli görevin saati; saatsizse null (gün boyu). Mantık @ortak/gorev-zaman'da
 * (düz Node ile test edilebilmesi için); burada görev nesnesini alan sarmalı
 * duruyor, çağıranlar bunu kullanıyor.
 */
export const gorevSaati = (g: TodoistGorev): string | null => saatiCoz(g.tarih);

export interface AralikDurumu {
  gorevler: TodoistGorev[];
  /** Tarihe göre öbeklenmiş — takvim hücreleri bunu okuyor. */
  gunlere: Map<string, TodoistGorev[]>;
  yukleniyor: boolean;
  /** Anahtar yoksa hata değil: takvim planı göstermeye devam eder. */
  anahtarYok: boolean;
  hata: string | null;
  tazele: () => Promise<void>;
  kapat: (g: TodoistGorev) => Promise<void>;
  /** Yeni görev — Inbox'a gider, tarihi verilen gün. */
  /** Eklendiyse true; hata `hata`da. Çağıran metni yalnızca başarıda temizlesin. */
  ekle: (iso: string, icerik: string, saat?: string | null, tekrar?: TekrarTuru | null) => Promise<boolean>;
  /**
   * Görevi başka güne/saate taşır. `saat` verilmezse görevin kendi saati
   * korunur; `{ tur: "ver" }` saat yazar, `{ tur: "sil" }` görevi gün boyu
   * yapar.
   */
  tarihiDegistir: (g: TodoistGorev, iso: string, saat?: BirakmaSaati) => Promise<void>;
}

export function useTodoistAralik(basIso: string, sonIso: string): AralikDurumu {
  const [gorevler, setGorevler] = useState<TodoistGorev[]>([]);
  // Argos-local tasks join the calendar in the Todoist shape (source: "local").
  const local = useLocalTasks();
  const today = useBugun();
  const localInRange = useMemo(
    () => tasksInRange({ version: 1, tasks: local.tasks }, basIso, sonIso).map(localAsTodoist),
    [local.tasks, basIso, sonIso],
  );
  const all = useMemo(() => [...gorevler, ...localInRange], [gorevler, localInRange]);
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
        return;
      }
      setGorevler(await k.todoist.tarihAraligi(basIso, sonIso));
      setHata(null);
    } catch (e) {
      // Ağ hatası takvimi düşürmez; plan tarafı görünmeye devam eder.
      setHata(mesaj(e));
      setGorevler([]);
    } finally {
      setYukleniyor(false);
    }
  }, [basIso, sonIso]);

  useEffect(() => {
    setYukleniyor(true);
    void tazele();
  }, [tazele]);

  // Hızlı yakalama penceresinden görev eklendi: liste kendiliğinden tazelensin.
  useEffect(() => kopru()?.todoistDegisimDinle(() => void tazele()), [tazele]);

  const gunlere = useMemo(() => {
    const m = new Map<string, TodoistGorev[]>();
    for (const g of all) {
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
  }, [all]);

  const kapat = useCallback(
    async (g: TodoistGorev) => {
      if (g.source === "local") {
        await completeLocalWithUndo(local, g.id, today);
        return;
      }
      const k = kopru();
      if (!k) return;
      const geriEkle = () => setGorevler((x) => [g, ...x.filter((y) => y.id !== g.id)]);
      setGorevler((x) => x.filter((y) => y.id !== g.id));
      silVeBildir({
        metin: `"${g.icerik}" tamamlandı.`,
        hataMetni: "Görev tamamlanamadı.",
        sil: async () => {
          try {
            await k.todoist.kapat(g.id);
            return true;
          } catch (e) {
            setHata(mesaj(e));
            geriEkle();
            return false;
          }
        },
        geriKoy: async () => {
          try {
            await k.todoist.ac(g.id);
            geriEkle();
            return true;
          } catch (e) {
            setHata(mesaj(e));
            return false;
          }
        },
      });
    },
    [local, today],
  );

  const ekle = useCallback(
    async (iso: string, icerik: string, saat?: string | null, tekrar?: TekrarTuru | null): Promise<boolean> => {
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
          // Tekrarlı görev seçilen günden başlar; ilk tekrarı o gün görünür.
          tarihMetni: tekrar ? tekrarMetni(tekrar, iso, saat ?? null) : todoistTarihi(iso, saat ?? null),
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
    async (g: TodoistGorev, iso: string, istek: BirakmaSaati = { tur: "koru" }) => {
      // Gün de saat de aynıysa istek atmaya gerek yok. Eskiden yalnız gün
      // karşılaştırılıyordu, o yüzden aynı gün içinde saat değiştirilemiyordu.
      if (tasimaGereksiz(g.tarih, iso, istek)) return;
      const saat = hedefSaat(g.tarih, istek);
      // An Argos task keeps its repeat rule; only the date (and time) moves.
      if (g.source === "local") {
        const ok = await local.changeTasks((f) => updateTask(f, g.id, { due: saat ? `${iso}T${saat}` : iso }));
        if (!ok) setHata("Argos görevi taşınamadı.");
        return;
      }
      const k = kopru();
      if (!k) return;

      const koy = (x: TodoistGorev) => (liste: TodoistGorev[]) =>
        liste.some((y) => y.id === x.id) ? liste.map((y) => (y.id === x.id ? x : y)) : [...liste, x];
      const at = (id: string) => (liste: TodoistGorev[]) => liste.filter((y) => y.id !== id);
      const listedeydi = gorevler.some((y) => y.id === g.id);

      // İyimser: görev hemen yeni güne geçer, istek düşerse eski hâli geri gelir.
      setGorevler(koy({ ...g, tarih: iyimserTarih(iso, saat) }));

      try {
        const guncel = await k.todoist.tarihVer(g.id, todoistTarihi(iso, saat));
        setGorevler(koy(guncel));
        setHata(null);
      } catch (e) {
        setHata(mesaj(e));
        setGorevler(listedeydi ? koy(g) : at(g.id));
      }
    },
    [gorevler, local],
  );

  return {
    gorevler: all,
    gunlere,
    yukleniyor,
    anahtarYok,
    hata,
    tazele,
    kapat,
    ekle,
    tarihiDegistir,
  };
}
