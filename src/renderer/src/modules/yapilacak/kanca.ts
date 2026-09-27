import { useEffect, useMemo, useState } from "react";
import { tariheGoreSirala } from "@ortak/geri-sayim";
import { localAsTodoist } from "@ortak/task";
import type { TodoistGorev } from "@ortak/tipler";
import { kopru } from "@/veri/kanca";
import { useLocalTasks } from "@/veri/local-tasks";

/** Data hook of the important-dates card. The task screen's data lives in useTaskBoard.ts. */

/* --- önemli tarihler --------------------------------------------------- */

/**
 * Bugün ekranının geri sayım kartı: `@önemli` etiketli açık görevler, en
 * yakın tarih önce. null = henüz yüklenmedi; anahtar yoksa ya da hata varsa
 * boş liste — kart o zaman hiç görünmez, panoyu hata mesajıyla doldurmaz.
 */
export function useOnemliler(bugun: string): TodoistGorev[] | null {
  const [gorevler, setGorevler] = useState<TodoistGorev[] | null>(null);
  const local = useLocalTasks();

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

  // Important Argos tasks count down on the same card.
  return useMemo(
    () =>
      gorevler === null
        ? null
        : tariheGoreSirala([
            ...gorevler,
            ...local.tasks.filter((t) => !t.completedAt && t.important).map(localAsTodoist),
          ]),
    [gorevler, local.tasks],
  );
}
