import { useEffect, useState } from "react";
import { aciliyet, kalanGun, kalanMetni, tarihEtiketi } from "@ortak/geri-sayim";
import { taskKey } from "@ortak/task";
import type { TodoistGorev } from "@ortak/tipler";
import { Kart } from "@/ui/bilesenler";
import { TaskModal } from "@/ui/gorev/TaskModal";
import { useBugun } from "@/veri/kanca";
import { useTaskBoard } from "@/veri/task-board";
import { useOnemliler } from "./kanca";
import s from "./yapilacak.module.css";

/**
 * Bugün ekranının en üstündeki geri sayım: sınav, başvuru gibi `@önemli`
 * etiketli görevler. Her an göz önünde olsun diye ızgaranın dışında durur.
 *
 * One row per date, stacked: the countdown sits in a fixed column on the
 * left so it lines up and stays next to the name, the date goes to the
 * right. The countdown is the only coloured text: green, yellow within a
 * week, red within three days and once passed.
 *
 * Every important task is in the card (issue #85): the rows scroll instead
 * of hiding behind a "show more" button, so none of them is a click away.
 * A row opens the task's details (issue #86), the same large view the task
 * screen opens.
 */

/** The key the row's task has on the task board, so its details can be found. */
const gorevAnahtari = (g: TodoistGorev) => taskKey(g.source ?? "todoist", g.id);

function Doseme({ gorev, bugun, onAc }: { gorev: TodoistGorev; bugun: string; onAc: () => void }) {
  const gun = gorev.tarih ? kalanGun(gorev.tarih, bugun) : null;
  return (
    <button type="button" className={s.doseme} title={gorev.icerik} onClick={onAc}>
      {gun === null ? (
        <span className={`${s.kalan} ${s.kalanYok}`}>—</span>
      ) : (
        <span className={`${s.kalan} ${s[`kalan_${aciliyet(gun)}`]}`}>{kalanMetni(gun)}</span>
      )}
      <span className={s.dosemeAd}>{gorev.icerik}</span>
      <span className={s.dosemeTarih}>{gorev.tarih ? tarihEtiketi(gorev.tarih, bugun) : "tarih yok"}</span>
    </button>
  );
}

/**
 * The task board is mounted only once a row is clicked: the card itself
 * reads the lighter important-dates hook, and the Bugün screen should not
 * pay for a second full read before anyone asks for the details.
 */
function GorevDetayi({ anahtar, onKapat }: { anahtar: string; onKapat: () => void }) {
  const board = useTaskBoard();
  const task = board.tasks.find((t) => t.key === anahtar);

  // Completed, deleted elsewhere or never on the board: nothing is left hanging.
  useEffect(() => {
    if (!board.loading && !task) onKapat();
  }, [board.loading, task, onKapat]);

  if (!task) return null;
  return <TaskModal task={task} board={board} onClose={onKapat} />;
}

export function OnemliTarihler() {
  const bugun = useBugun();
  const gorevler = useOnemliler(bugun);
  const [acik, setAcik] = useState<string | null>(null);

  if (!gorevler || gorevler.length === 0) return null;

  return (
    <>
      <Kart
        className={s.onemliKart}
        dolgulu={false}
        baslik="Önemli tarihler"
        not={gorevler.length > 1 ? `${gorevler.length} görev` : undefined}
        git={{ yol: "/yapilacak/", metin: "Yapılacaklar" }}
      >
        <div className={s.dosemeler}>
          {gorevler.map((g) => (
            <Doseme key={g.id} gorev={g} bugun={bugun} onAc={() => setAcik(gorevAnahtari(g))} />
          ))}
        </div>
      </Kart>
      {acik && <GorevDetayi key={acik} anahtar={acik} onKapat={() => setAcik(null)} />}
    </>
  );
}
