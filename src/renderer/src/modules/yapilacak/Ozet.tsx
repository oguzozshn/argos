import { Check, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { localAsTodoist, type TaskList } from "@ortak/task";
import type { TodoistGorev } from "@ortak/tipler";
import { Etiket, Kart, Satir } from "@/ui/bilesenler";
import { Composer } from "@/ui/gorev/Composer";
import { silVeBildir } from "@/ui/toast";
import { kopru, useBugun } from "@/veri/kanca";
import { completeLocalWithUndo, useLocalTasks } from "@/veri/local-tasks";
import { useTaskComposerTarget, type NewTaskInput } from "@/veri/task-create";
import s from "./yapilacak.module.css";

/**
 * Bugün ekranındaki kart: bugün ve gecikmiş görevler, tüm projelerden.
 * Tek istek — Todoist'in kendi süzgeci kullanılıyor.
 */
export function YapilacakOzet() {
  const [todoistGorevleri, setGorevler] = useState<TodoistGorev[] | null>(null);
  const local = useLocalTasks();
  const today = useBugun();
  // Argos tasks due today or earlier sit next to the Todoist ones.
  const gorevler = useMemo(() => {
    if (!todoistGorevleri) return null;
    const localDue = local.tasks
      .filter((t) => !t.completedAt && t.due && t.due.slice(0, 10) <= today)
      .map(localAsTodoist);
    return [...todoistGorevleri, ...localDue];
  }, [todoistGorevleri, local.tasks, today]);
  const [gecikmisAcik, setGecikmisAcik] = useState(false);
  const [ekliyor, setEkliyor] = useState(false);

  const yukle = useCallback(() => {
    const k = kopru();
    if (!k) return;
    void k.todoist
      .durum()
      .then((d) => (d.anahtarVar ? k.todoist.bugunVeGecikmis() : []))
      .then(setGorevler)
      .catch(() => setGorevler([]));
  }, []);

  useEffect(() => {
    yukle();
    // Hızlı yakalamadan eklenen bugünkü görev kartta da görünsün.
    return kopru()?.todoistDegisimDinle(yukle);
  }, [yukle]);

  // Karttan görev ekleme (issue #45'teki kutunun aynısı), gün bugüne kurulu.
  const hedef = useTaskComposerTarget();
  // Todoist'e ekleme kendi başına haber vermiyor: eklenen görev görünsün diye
  // kart yeniden okunuyor.
  const ekleHost = useMemo(
    () => ({
      ...hedef,
      createTask: async (list: TaskList, input: NewTaskInput) => {
        const ok = await hedef.createTask(list, input);
        if (ok) yukle();
        return ok;
      },
    }),
    [hedef, yukle],
  );
  const ekleListesi = hedef.inbox ?? hedef.lists[0] ?? null;

  const kapat = (g: TodoistGorev) => {
    if (g.source === "local") {
      void completeLocalWithUndo(local, g.id, today);
      return;
    }
    const k = kopru();
    if (!k) return;
    const geriEkle = () => setGorevler((x) => [g, ...(x ?? []).filter((y) => y.id !== g.id)]);
    setGorevler((x) => (x ?? []).filter((y) => y.id !== g.id));
    silVeBildir({
      metin: `"${g.icerik}" tamamlandı.`,
      hataMetni: "Görev tamamlanamadı.",
      sil: () =>
        k.todoist.kapat(g.id).then(
          () => true,
          () => {
            geriEkle();
            return false;
          },
        ),
      geriKoy: () =>
        k.todoist.ac(g.id).then(
          () => {
            geriEkle();
            return true;
          },
          () => false,
        ),
    });
  };

  // Yüklenirken kart boş görünmesin; görev yoksa bile kart durur, çünkü
  // görev eklemek için kullanılıyor.
  if (!gorevler) return null;

  const bugun = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const gecikmisMi = (g: TodoistGorev) => Boolean(g.tarih && g.tarih.slice(0, 10) < bugun);
  const gecikmisler = gorevler.filter(gecikmisMi);
  const bugunkuler = gorevler.filter((g) => !gecikmisMi(g));
  // Gecikmişler bugünkülerin arasına karışınca liste taşıyordu: sayı olarak
  // durur, tıklanınca açılır.
  const liste = gecikmisAcik ? [...gecikmisler, ...bugunkuler] : bugunkuler;
  const gorunen = liste.slice(0, gecikmisAcik ? 15 : 7);

  const satir = (g: TodoistGorev) => (
    <Satir
      key={g.id}
      baslik={g.icerik}
      alt={g.tarihMetni ?? undefined}
      sol={
        <button
          type="button"
          className={s.kutucuk}
          onClick={() => void kapat(g)}
          aria-label={`"${g.icerik}" görevini tamamla`}
        >
          <Check size={12} strokeWidth={3} />
        </button>
      }
      sag={gecikmisMi(g) ? <Etiket tur="hata">gecikmiş</Etiket> : null}
    />
  );

  return (
    <Kart
      dolgulu={false}
      baslik="Bugün yapılacaklar"
      git={{ yol: "/yapilacak/", metin: "Yapılacaklar" }}
      bas={
        gecikmisler.length > 0 && (
          <button
            type="button"
            className={gecikmisAcik ? `${s.gecikmisCip} ${s.gecikmisAcik}` : s.gecikmisCip}
            onClick={() => setGecikmisAcik((x) => !x)}
            aria-expanded={gecikmisAcik}
          >
            {gecikmisler.length} gecikmiş {gecikmisAcik ? "▴" : "▾"}
          </button>
        )
      }
    >
      {ekliyor && ekleListesi ? (
        <Composer list={ekleListesi} host={ekleHost} defaultDate={today} onClose={() => setEkliyor(false)} />
      ) : (
        ekleListesi && (
          <button type="button" className={s.ekleSatir} onClick={() => setEkliyor(true)}>
            <span className={s.eklePlus}>
              <Plus size={14} />
            </span>
            Görev ekle
          </button>
        )
      )}
      {gorunen.length === 0 ? (
        <p className={s.projeNot} style={{ borderTop: "none", marginTop: 0 }}>
          Bugüne görev yok.
        </p>
      ) : (
        gorunen.map(satir)
      )}
      {liste.length > gorunen.length && <p className={s.projeNot}>{liste.length - gorunen.length} görev daha</p>}
    </Kart>
  );
}
