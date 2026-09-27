import { AlertTriangle, Calendar, Flag, KeyRound, Monitor, Plus, RefreshCw, Repeat, Star } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { parseDateText } from "@ortak/date-parse";
import { splitQuickAdd } from "@ortak/quick-add";
import { describeRule } from "@ortak/recurrence";
import type { TaskList } from "@ortak/task";
import { dueLabel, groupByDate } from "@ortak/task-dates";
import { Kisayollar } from "@/ui/Kisayollar";
import { BosDurum, Dugme, EkranBasi, Kart, Yuklenirken } from "@/ui/bilesenler";
import { kopru } from "@/veri/kanca";
import { ListSidebar } from "./ListSidebar";
import { TaskRow } from "./TaskRow";
import { useTaskBoard, type TaskBoard } from "./useTaskBoard";
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

  const select = (key: string) => {
    setActiveKey(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // A remembered list is a convenience; without storage the Inbox opens.
    }
  };

  const active =
    board.lists.find((l) => l.key === activeKey) ?? board.lists.find((l) => l.inbox) ?? board.lists[0] ?? null;

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
        <div className={s.board}>
          <ListSidebar board={board} activeKey={active?.key ?? null} onSelect={select} />
          {active ? (
            <TaskListCard key={active.key} list={active} board={board} />
          ) : (
            <Kart>
              <BosDurum
                baslik="Henüz liste yok"
                metin="Soldaki Projelerim başlığının yanındaki + ile bir Argos listesi aç."
              />
            </Kart>
          )}
        </div>
      )}
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

function TaskListCard({ list, board }: { list: TaskList; board: TaskBoard }) {
  const tasks = useMemo(
    () => board.tasks.filter((t) => t.source === list.source && t.listId === list.id),
    [board.tasks, list],
  );
  const groups = useMemo(() => groupByDate(tasks, board.today), [tasks, board.today]);

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
      <AddRow list={list} board={board} />
      {tasks.length === 0 ? (
        <p className={s.empty}>Bu listede açık görev yok.</p>
      ) : (
        groups.map(({ group, tasks: items }) => (
          <section key={group}>
            <h3 className={group === "Gecikmiş" ? `${s.groupHead} ${s.groupOverdue}` : s.groupHead}>
              {group} <span>{items.length}</span>
            </h3>
            {items.map((t) => (
              <TaskRow key={t.key} task={t} board={board} />
            ))}
          </section>
        ))
      )}
    </Kart>
  );
}

/**
 * One-line entry: "fatura öde yarın 18:00 p1 @önemli". What the line will
 * become shows as chips while typing; the full composer comes next stage.
 */
function AddRow({ list, board }: { list: TaskList; board: TaskBoard }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    const q = splitQuickAdd(text, board.today);
    const date = q.dateText ? parseDateText(q.dateText, board.today) : null;
    return { ...q, date };
  }, [text, board.today]);

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    const ok = await board.add(list, text);
    setBusy(false);
    if (ok) setText("");
    input.current?.focus();
  };

  const shortcut = (
    <Kisayollar
      grup="Yapılacaklar"
      liste={[{ tus: "n", aciklama: "Yeni görev yaz", eylem: () => (setOpen(true), input.current?.focus()) }]}
    />
  );

  if (!open) {
    return (
      <>
        {shortcut}
        <button type="button" className={s.addRow} onClick={() => setOpen(true)}>
          <span className={s.addPlus}>
            <Plus size={14} />
          </span>
          Görev ekle
        </button>
      </>
    );
  }

  const dateText = parsed.date
    ? parsed.date.rule
      ? `${describeRule(parsed.date.rule)} · ${dueLabel(parsed.date.date + (parsed.date.time ? `T${parsed.date.time}` : ""), board.today).label}`
      : dueLabel(parsed.date.date + (parsed.date.time ? `T${parsed.date.time}` : ""), board.today).label
    : parsed.dateText;

  return (
    <div className={s.composer}>
      {shortcut}
      <input
        ref={input}
        autoFocus
        className={s.composerInput}
        value={text}
        placeholder="Görev adı — örn. fatura öde yarın 18:00 p1 @önemli"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") {
            setText("");
            setOpen(false);
          }
        }}
      />
      <div className={s.composerFoot}>
        <span className={s.chips}>
          {dateText && (
            <span className={s.chip}>
              {parsed.date?.rule ? <Repeat size={12} /> : <Calendar size={12} />}
              {dateText}
            </span>
          )}
          {parsed.priority && parsed.priority < 4 && (
            <span className={`${s.chip} ${parsed.priority === 1 ? s.chipDanger : ""}`}>
              <Flag size={12} />P{parsed.priority}
            </span>
          )}
          {parsed.important && (
            <span className={`${s.chip} ${s.chipImportant}`}>
              <Star size={12} fill="currentColor" />
              Önemli
            </span>
          )}
          {!dateText && !parsed.priority && !parsed.important && (
            <span className={s.hint}>Tarih, p1–p4 ve @önemli satıra yazılabilir · Enter ekler · Esc kapatır</span>
          )}
        </span>
        <Dugme
          tur="sade"
          onClick={() => {
            setText("");
            setOpen(false);
          }}
        >
          İptal
        </Dugme>
        <Dugme tur="dolu" onClick={() => void submit()} disabled={!parsed.title || busy}>
          Ekle
        </Dugme>
      </div>
    </div>
  );
}
