import { useCallback, useEffect, useMemo, useState } from "react";
import { tariheGoreSirala } from "@ortak/geri-sayim";
import {
  ONEMLI_ETIKETI,
  PLAN_PROJESI,
  onemliMi,
  type TodoistGorev,
  type TodoistProje,
} from "@ortak/tipler";
import { silVeBildir } from "@/ui/toast";
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

  // Hızlı yakalama penceresinden görev eklendi: liste kendiliğinden tazelensin.
  useEffect(() => kopru()?.todoistDegisimDinle(() => void tazele()), [tazele]);

  /** Görevi tamamlar; alttaki bildirimden (ya da Ctrl+Z) geri alınabilir. */
  const kapat = useCallback((g: TodoistGorev) => {
    const k = kopru();
    if (!k) return;
    // İyimser: satır hemen listeden çıkar, hata dönerse geri gelir.
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
          setGorevler((x) => [g, ...x]);
          return false;
        }
      },
      geriKoy: async () => {
        try {
          await k.todoist.ac(g.id);
          setGorevler((x) => [g, ...x.filter((y) => y.id !== g.id)]);
          return true;
        } catch (e) {
          setHata(mesaj(e));
          return false;
        }
      },
    });
  }, []);

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

  /**
   * Önemli işaretini çevirir. İyimser: yıldız hemen değişir, Todoist hata
   * verirse eski hâline döner. Sunucunun döndürdüğü görev son sözü söyler.
   */
  const onemliDegistir = useCallback(async (g: TodoistGorev) => {
    const k = kopru();
    if (!k) return;
    const yeni = !onemliMi(g);
    const iyimser: TodoistGorev = {
      ...g,
      etiketler: yeni
        ? [...g.etiketler, ONEMLI_ETIKETI]
        : g.etiketler.filter((e) => e.toLocaleLowerCase("tr") !== ONEMLI_ETIKETI),
    };
    setGorevler((x) => x.map((y) => (y.id === g.id ? iyimser : y)));
    try {
      const guncel = await k.todoist.onemliYap(g.id, yeni);
      setGorevler((x) => x.map((y) => (y.id === g.id ? guncel : y)));
      setHata(null);
    } catch (e) {
      setGorevler((x) => x.map((y) => (y.id === g.id ? g : y)));
      setHata(mesaj(e));
    }
  }, []);

  return { gorevler, yukleniyor, hata, tazele, kapat, ekle, tarihVer, onemliDegistir };
}

/* --- önemli tarihler --------------------------------------------------- */

/**
 * Bugün ekranının geri sayım kartı: `@önemli` etiketli açık görevler, en
 * yakın tarih önce. null = henüz yüklenmedi; anahtar yoksa ya da hata varsa
 * boş liste — kart o zaman hiç görünmez, panoyu hata mesajıyla doldurmaz.
 */
export function useOnemliler(bugun: string): TodoistGorev[] | null {
  const [gorevler, setGorevler] = useState<TodoistGorev[] | null>(null);

  useEffect(() => {
    const k = kopru();
    if (!k) {
      setGorevler([]);
      return;
    }
    let birakildi = false;
    const yukle = () =>
      void k.todoist
        .durum()
        .then((d) => (d.anahtarVar ? k.todoist.onemliler() : []))
        .then((x) => !birakildi && setGorevler(tariheGoreSirala(x)))
        .catch(() => !birakildi && setGorevler((x) => x ?? []));
    yukle();
    // İşaret değişti, görev kapandı ya da hızlı yakalamadan `@önemli` geldi.
    const iptal = k.todoistDegisimDinle(yukle);
    return () => {
      birakildi = true;
      iptal();
    };
    // Gün değişince de yeniden çekilir: telefondan eklenenler gece gelsin.
  }, [bugun]);

  return gorevler;
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
