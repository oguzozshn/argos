import { BugununCalismasi } from "@/ui/CalismaOturumlari";
import { AlertTriangle, KeyRound, Monitor, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { TaskList } from "@ortak/task";
import { groupByDate } from "@ortak/task-dates";
import { Kisayollar } from "@/ui/Kisayollar";
import { BosDurum, Dugme, EkranBasi, Kart, Yuklenirken } from "@/ui/bilesenler";
import { kopru } from "@/veri/kanca";
import { Composer } from "@/ui/gorev/Composer";
import { ListSidebar } from "./ListSidebar";
import { TaskModal } from "@/ui/gorev/TaskModal";
import { TaskPanel } from "@/ui/gorev/TaskPanel";
import { TaskRow } from "./TaskRow";
import { useTaskBoard, type TaskBoard } from "@/veri/task-board";
import s from "./board.module.css";

/**
 * Yapılacaklar: Todoist projects and Argos-local lists side by side. The
 * sidebar picks a list; the card shows its open tasks grouped by date.
 */

const STORAGE_KEY = "argos.yapilacak.liste";

function readStoredList(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function Yapilacak() {
  const board = useTaskBoard();
  const [activeKey, setActiveKey] = useState<string | null>(readStoredList);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The task open in the large view (issue #55).
  const [largeKey, setLargeKey] = useState<string | null>(null);

  const select = (key: string) => {
    setActiveKey(key);
    setSelectedKey(null);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // A remembered list is a convenience; without storage the Inbox opens.
    }
  };

  const active =
    board.lists.find((l) => l.key === activeKey) ?? board.lists.find((l) => l.inbox) ?? board.lists[0] ?? null;
  // A completed, deleted or moved-away task closes the panel on its own.
  const selected = board.tasks.find((t) => t.key === selectedKey) ?? null;
  // Completed or deleted from the large view: it closes by itself.
  const largeTask = board.tasks.find((t) => t.key === largeKey) ?? null;

  return (
    <>
      <EkranBasi baslik="Yapılacaklar" />
      <TodoistNotice board={board} />
      {board.localError && <div className={s.notice}>Argos listeleri okunamadı: {board.localError}</div>}

      {board.loading && board.lists.length === 0 ? (
        <Kart>
          <Yuklenirken />
        </Kart>
      ) : (
        <div className={selected ? `${s.board} ${s.boardWithPanel}` : s.board}>
          <ListSidebar board={board} activeKey={active?.key ?? null} onSelect={select} />
          {active ? (
            <TaskListCard
              key={active.key}
              list={active}
              board={board}
              selectedKey={selected?.key ?? null}
              onSelect={(key) => setSelectedKey((k) => (k === key ? null : key))}
              onOpen={(key) => {
                setSelectedKey(key);
                setLargeKey(key);
              }}
            />
          ) : (
            <Kart>
              <BosDurum
                baslik="Henüz liste yok"
                metin="Soldaki Projelerim başlığının yanındaki + ile bir Argos listesi aç."
              />
            </Kart>
          )}
          {selected && (
            <TaskPanel
              key={selected.key}
              task={selected}
              board={board}
              onClose={() => setSelectedKey(null)}
              onExpand={() => setLargeKey(selected.key)}
            />
          )}
        </div>
      )}
      {largeTask && <TaskModal key={largeTask.key} task={largeTask} board={board} onClose={() => setLargeKey(null)} />}
    </>
  );
}

/** Missing key or an unreachable Todoist: said once, above the board; Argos lists keep working. */
function TodoistNotice({ board }: { board: TaskBoard }) {
  const chooseKey = async () => {
    const k = kopru();
    if (k && (await k.gizliSec())) void board.reload();
  };
  if (board.status === "noKey") {
    return (
      <div className={s.notice}>
        <KeyRound size={15} />
        <span>
          Todoist anahtarı bulunamadı — Todoist projeleri gösterilmiyor. Aranan yer: {board.keyPath || "gizli.json"}
        </span>
        <Dugme onClick={() => void chooseKey()}>Dosya seç</Dugme>
      </div>
    );
  }
  if (board.status === "error") {
    return (
      <div className={s.notice}>
        <AlertTriangle size={15} />
        <span>Todoist'e ulaşılamadı: {board.error}</span>
        <Dugme onClick={() => void board.reload()}>Yeniden dene</Dugme>
        <Dugme tur="sade" onClick={() => void chooseKey()}>
          Anahtar dosyasını değiştir
        </Dugme>
      </div>
    );
  }
  return null;
}

function TaskListCard({
  list,
  board,
  selectedKey,
  onSelect,
  onOpen,
}: {
  list: TaskList;
  board: TaskBoard;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onOpen: (key: string) => void;
}) {
  const [composing, setComposing] = useState(false);
  const tasks = useMemo(
    () => board.tasks.filter((t) => t.listSource === list.source && t.listId === list.id),
    [board.tasks, list],
  );
  const groups = useMemo(() => groupByDate(tasks, board.today), [tasks, board.today]);
  // Screen order, for ↑/↓ between tasks while the panel is open.
  const order = useMemo(() => groups.flatMap((g) => g.tasks.map((t) => t.key)), [groups]);
  const step = (n: number) => () => {
    if (order.length === 0) return;
    const i = selectedKey ? order.indexOf(selectedKey) : -1;
    onSelect(order[Math.max(0, Math.min(order.length - 1, i + n))]!);
  };

  return (
    <Kart
      dolgulu={false}
      className={s.card}
      baslik={list.name}
      not={`${tasks.length} açık görev`}
      bas={
        list.source === "local" ? (
          <span className={s.localChip}>
            <Monitor size={12} />
            Argos listesi · telefonda görünmez
          </span>
        ) : (
          <Dugme
            tur="sade"
            ikon={<RefreshCw size={15} />}
            onClick={() => void board.reload()}
            title="Todoist'ten yenile"
            aria-label="Yenile"
          />
        )
      }
    >
      <Kisayollar
        grup="Yapılacaklar"
        liste={[
          { tus: "n", aciklama: "Yeni görev", eylem: () => setComposing(true) },
          { tus: "ArrowDown", aciklama: "Sonraki görev", eylem: step(1) },
          { tus: "ArrowUp", aciklama: "Önceki görev", eylem: step(-1) },
          { tus: "Escape", aciklama: "Görev panelini kapat", eylem: selectedKey ? () => onSelect(null) : null },
        ]}
      />
      {composing ? (
        <Composer list={list} host={board} onClose={() => setComposing(false)} />
      ) : (
        <button type="button" className={s.addRow} onClick={() => setComposing(true)}>
          <span className={s.addPlus}>
            <Plus size={14} />
          </span>
          Görev ekle
        </button>
      )}
      {list.inbox && <BugununCalismasi bugun={board.today} />}
      {tasks.length === 0 ? (
        <p className={s.empty}>Bu listede açık görev yok.</p>
      ) : (
        groups.map(({ group, tasks: items }) => (
          <section key={group}>
            <h3 className={group === "Gecikmiş" ? `${s.groupHead} ${s.groupOverdue}` : s.groupHead}>
              {group} <span>{items.length}</span>
            </h3>
            {items.map((t) => (
              <TaskRow key={t.key} task={t} board={board} selected={t.key === selectedKey} onSelect={onSelect} onOpen={onOpen} />
            ))}
          </section>
        ))
      )}
    </Kart>
  );
}
