import { useEffect, useState } from "react";
import { tariheGoreSirala } from "@ortak/geri-sayim";
import type { TodoistGorev } from "@ortak/tipler";
import { kopru } from "@/veri/kanca";

/** Data hook of the important-dates card. The task screen's data lives in useTaskBoard.ts. */

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
