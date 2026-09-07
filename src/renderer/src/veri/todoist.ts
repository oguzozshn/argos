import { useCallback, useEffect, useMemo, useState } from "react";
import type { TodoistGorev } from "@ortak/tipler";
import { kopru } from "./kanca";

/**
 * Takvimin görev kaynağı. Yapılacaklar modülünün kendi kancaları var; bu
 * dosya paylaşılan katmanda duruyor çünkü Takvim ayrı bir modül ve modüller
 * birbirini import etmiyor.
 */

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
}

export function useTodoistAralik(basIso: string, sonIso: string): AralikDurumu {
  const [gorevler, setGorevler] = useState<TodoistGorev[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [anahtarYok, setAnahtarYok] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

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
      setHata(e instanceof Error ? e.message : String(e));
      setGorevler([]);
    } finally {
      setYukleniyor(false);
    }
  }, [basIso, sonIso]);

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

  const kapat = useCallback(async (g: TodoistGorev) => {
    const k = kopru();
    if (!k) return;
    setGorevler((x) => x.filter((y) => y.id !== g.id));
    try {
      await k.todoist.kapat(g.id);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
      setGorevler((x) => [g, ...x]);
    }
  }, []);

  return { gorevler, gunlere, yukleniyor, anahtarYok, hata, tazele, kapat };
}

/** Saatli görevin saati; saatsizse null (gün boyu). */
export const gorevSaati = (g: TodoistGorev): string | null =>
  g.tarih && g.tarih.length > 10 ? g.tarih.slice(11, 16) : null;
