import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLAN_PROJESI, type TodoistGorev, type TodoistProje } from "@ortak/tipler";
import { kopru } from "@/veri/kanca";

/**
 * Todoist okuma/yazma kancaları. Anahtar ana süreçte kalır; burada yalnızca
 * sonuç var.
 *
 * `Gelişim Planı` projesi listeden çıkarılır: slotlar ve alışkanlıklar
 * Asistan modülünün işi, kişisel görevlerle karışmaz.
 */

const mesaj = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useProjeler() {
  const [projeler, setProjeler] = useState<TodoistProje[]>([]);
  const [anahtarVar, setAnahtarVar] = useState<boolean | null>(null);
  const [gizliYolu, setGizliYolu] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const yukle = useCallback(() => {
    const k = kopru();
    if (!k) {
      setAnahtarVar(false);
      setYukleniyor(false);
      return;
    }
    setYukleniyor(true);
    setHata(null);
    void (async () => {
      try {
        const d = await k.todoist.durum();
        setAnahtarVar(d.anahtarVar);
        setGizliYolu(d.gizliYolu);
        if (!d.anahtarVar) return;
        const p = await k.todoist.projeler();
        // Inbox başa, sonrası alfabetik. Plan projesi hiç görünmez.
        setProjeler(
          p
            .filter((x) => x.id !== PLAN_PROJESI)
            .sort((a, b) =>
              a.inbox !== b.inbox ? (a.inbox ? -1 : 1) : a.ad.localeCompare(b.ad, "tr"),
            ),
        );
      } catch (e) {
        setHata(mesaj(e));
      } finally {
        setYukleniyor(false);
      }
    })();
  }, []);

  useEffect(yukle, [yukle]);

  return { projeler, anahtarVar, gizliYolu, hata, yukleniyor, yenile: yukle };
}

export function useGorevler(projeId: string | null) {
  const [gorevler, setGorevler] = useState<TodoistGorev[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  /** Az önce kapatılan görev — geri alma şeridi için. */
  const [sonKapatilan, setSonKapatilan] = useState<TodoistGorev | null>(null);
  const zamanlayici = useRef<number | null>(null);

  const tazele = useCallback(async () => {
    const k = kopru();
    if (!k || !projeId) {
      setYukleniyor(false);
      return;
    }
    try {
      setGorevler(await k.todoist.gorevler(projeId));
      setHata(null);
    } catch (e) {
      setHata(mesaj(e));
    } finally {
      setYukleniyor(false);
    }
  }, [projeId]);

  useEffect(() => {
    setYukleniyor(true);
    void tazele();
  }, [tazele]);

  useEffect(() => () => window.clearTimeout(zamanlayici.current ?? undefined), []);

  const kapat = useCallback(async (g: TodoistGorev) => {
    const k = kopru();
    if (!k) return;
    // İyimser: satır hemen listeden çıkar, hata dönerse geri gelir.
    setGorevler((x) => x.filter((y) => y.id !== g.id));
    setSonKapatilan(g);
    window.clearTimeout(zamanlayici.current ?? undefined);
    zamanlayici.current = window.setTimeout(() => setSonKapatilan(null), 9000);
    try {
      await k.todoist.kapat(g.id);
    } catch (e) {
      setHata(mesaj(e));
      setGorevler((x) => [g, ...x]);
      setSonKapatilan(null);
    }
  }, []);

  const geriAl = useCallback(async () => {
    const k = kopru();
    if (!k || !sonKapatilan) return;
    const g = sonKapatilan;
    setSonKapatilan(null);
    try {
      await k.todoist.ac(g.id);
      setGorevler((x) => [g, ...x]);
    } catch (e) {
      setHata(mesaj(e));
    }
  }, [sonKapatilan]);

  const ekle = useCallback(
    async (icerik: string, tarihMetni?: string) => {
      const k = kopru();
      if (!k || !projeId) return;
      try {
        const yeni = await k.todoist.ekle({ icerik, projeId, tarihMetni });
        setGorevler((x) => [yeni, ...x]);
        setHata(null);
      } catch (e) {
        setHata(mesaj(e));
      }
    },
    [projeId],
  );

  const tarihVer = useCallback(async (id: string, tarihMetni: string | null) => {
    const k = kopru();
    if (!k) return;
    try {
      const guncel = await k.todoist.tarihVer(id, tarihMetni);
      setGorevler((x) => x.map((y) => (y.id === id ? guncel : y)));
      setHata(null);
    } catch (e) {
      setHata(mesaj(e));
    }
  }, []);

  return { gorevler, yukleniyor, hata, sonKapatilan, tazele, kapat, geriAl, ekle, tarihVer };
}

/* --- tarihe göre öbekleme ---------------------------------------------- */

export type ObekAdi = "gecikmiş" | "bugün" | "yarın" | "bu hafta" | "sonra" | "tarihsiz";

export const OBEK_SIRASI: ObekAdi[] = [
  "gecikmiş",
  "bugün",
  "yarın",
  "bu hafta",
  "sonra",
  "tarihsiz",
];

const gun = (d: Date) => d.toISOString().slice(0, 10);

function obek(tarih: string | null, bugun: string, yarin: string, haftaSonu: string): ObekAdi {
  if (!tarih) return "tarihsiz";
  const t = tarih.slice(0, 10);
  if (t < bugun) return "gecikmiş";
  if (t === bugun) return "bugün";
  if (t === yarin) return "yarın";
  return t <= haftaSonu ? "bu hafta" : "sonra";
}

export function useObekler(gorevler: TodoistGorev[]) {
  return useMemo(() => {
    const simdi = new Date();
    // Yerel güne göre: UTC kayması bir günü yanlış öbeğe atmasın.
    const yerel = new Date(simdi.getTime() - simdi.getTimezoneOffset() * 60000);
    const bugun = gun(yerel);
    const yarin = gun(new Date(yerel.getTime() + 86400000));
    const haftaSonu = gun(new Date(yerel.getTime() + 7 * 86400000));

    const m = new Map<ObekAdi, TodoistGorev[]>();
    for (const g of gorevler) {
      const o = obek(g.tarih, bugun, yarin, haftaSonu);
      (m.get(o) ?? m.set(o, []).get(o)!).push(g);
    }
    for (const liste of m.values()) {
      liste.sort((a, b) =>
        a.tarih && b.tarih
          ? a.tarih.localeCompare(b.tarih)
          : b.oncelik - a.oncelik || a.icerik.localeCompare(b.icerik, "tr"),
      );
    }
    return m;
  }, [gorevler]);
}
