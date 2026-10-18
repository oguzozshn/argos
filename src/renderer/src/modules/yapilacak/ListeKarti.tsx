import { Check } from "lucide-react";
import type { KartAyari } from "@ortak/bugun-duzen";
import { compareTasks, dueLabel } from "@ortak/task-dates";
import type { KartSecenegi, KartTuru } from "@/modules";
import { Etiket, Kart, Satir } from "@/ui/bilesenler";
import { useTaskBoard } from "./useTaskBoard";
import s from "./yapilacak.module.css";

/**
 * Bugün card for one task list (a Todoist project or an Argos list): its
 * open tasks, earliest date first, each completed from the card with the
 * usual undo toast. The list is a card setting; a card whose list was
 * deleted falls back to the Inbox.
 */

/** Tasks shown before "N görev daha". */
const EN_COK = 12;

function useListeSecenekleri(): KartSecenegi[] {
  const board = useTaskBoard();
  return board.lists.map((l) => ({ deger: l.key, ad: l.name }));
}

function GorevListesiKarti({ ayar }: { ayar: KartAyari }) {
  const board = useTaskBoard();
  const list =
    board.lists.find((l) => l.key === ayar.liste) ?? board.lists.find((l) => l.inbox) ?? board.lists[0];
  if (board.loading || !list) return null;

  const tasks = board.tasks
    .filter((t) => `${t.listSource}:${t.listId}` === list.key && !t.isSubtask)
    .sort(compareTasks);
  const shown = tasks.slice(0, EN_COK);

  return (
    <Kart
      dolgulu={false}
      baslik={list.name}
      not={tasks.length ? `${tasks.length} görev` : undefined}
      git={{ yol: "/yapilacak/", metin: "Yapılacaklar" }}
    >
      {shown.length === 0 ? (
        <p className={s.projeNot} style={{ borderTop: "none", marginTop: 0 }}>
          Bu listede açık görev yok.
        </p>
      ) : (
        shown.map((t) => {
          const due = t.due ? dueLabel(t.due, board.today) : null;
          return (
            <Satir
              key={t.key}
              baslik={t.title}
              alt={due ? (t.recurring && t.recurrenceText ? `${t.recurrenceText} · ${due.label}` : due.label) : undefined}
              sol={
                <button
                  type="button"
                  className={s.kutucuk}
                  onClick={() => void board.complete(t)}
                  aria-label={`"${t.title}" görevini tamamla`}
                >
                  <Check size={12} strokeWidth={3} />
                </button>
              }
              sag={due?.tone === "overdue" ? <Etiket tur="hata">gecikmiş</Etiket> : null}
            />
          );
        })
      )}
      {tasks.length > shown.length && <p className={s.projeNot}>{tasks.length - shown.length} görev daha</p>}
    </Kart>
  );
}

export const gorevListesiKarti: KartTuru = {
  id: "liste",
  ad: "Görev listesi",
  Bilesen: GorevListesiKarti,
  ayarlar: [{ anahtar: "liste", ad: "Liste", useSecenekler: useListeSecenekleri }],
  w: 4,
  h: 10,
};
