import {
  ArrowRight,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  CircleArrowRight,
  CircleSlash,
  Ellipsis,
  Flag,
  Repeat,
  Sofa,
  Star,
  StarOff,
  Sun,
  Sunrise,
  Trash2,
} from "lucide-react";
import { useState, type MouseEvent } from "react";
import { gunEkle, haftaninGunu } from "@ortak/gun";
import type { Priority } from "@ortak/local-tasks";
import type { Task, TaskList } from "@ortak/task";
import { dueLabel } from "@ortak/task-dates";
import { ONEMLI_ETIKETI } from "@ortak/tipler";
import { MenuIconButton, MenuIconRow, MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import type { TaskBoard } from "./useTaskBoard";
import s from "./board.module.css";

const PRIORITY_COLOR: Record<Priority, string | undefined> = {
  1: "var(--hata)",
  2: "var(--uyari)",
  3: "var(--vurgu)",
  4: undefined,
};

const TONE_CLASS = { overdue: s.toneOverdue, today: s.toneToday, tomorrow: s.toneTomorrow, later: "" };

export function TaskRow({ task, board }: { task: Task; board: TaskBoard }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const due = task.due ? dueLabel(task.due, board.today) : null;
  const labels = task.labels.filter((l) => l.toLocaleLowerCase("tr") !== ONEMLI_ETIKETI);
  const color = PRIORITY_COLOR[task.priority];

  const openAt = (e: MouseEvent, anchor?: HTMLElement) => {
    e.preventDefault();
    e.stopPropagation();
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      setMenu({ x: r.right - 250, y: r.bottom + 4 });
    } else setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={menu ? `${s.row} ${s.rowMenuOpen}` : s.row}
      onContextMenu={(e) => openAt(e)}
      data-task={task.key}
    >
      <button
        type="button"
        className={s.check}
        style={color ? { borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` } : undefined}
        onClick={() => void board.complete(task)}
        aria-label={`"${task.title}" görevini tamamla`}
        title="Tamamla"
      >
        <Check size={11} strokeWidth={3} />
      </button>

      <div className={s.body}>
        <span className={s.title}>{task.title}</span>
        {(due || task.description || labels.length > 0 || task.reminders.length > 0) && (
          <span className={s.meta}>
            {due && (
              <span className={TONE_CLASS[due.tone]}>
                {task.recurring ? <Repeat size={12} /> : <Calendar size={12} />}
                {task.recurring && task.recurrenceText ? `${task.recurrenceText} · ${due.label}` : due.label}
              </span>
            )}
            {task.reminders.length > 0 && (
              <span title="Hatırlatıcı">
                <Bell size={12} />
                {task.reminders.length}
              </span>
            )}
            {labels.map((l) => (
              <span key={l}>@{l}</span>
            ))}
            {task.description && <span className={s.description}>{task.description}</span>}
          </span>
        )}
      </div>

      {task.important && (
        <button
          type="button"
          className={s.star}
          onClick={() => void board.toggleImportant(task)}
          title="Önemli — Bugün ekranında geri sayımla görünür. Kaldırmak için tıkla."
          aria-label="Önemli işaretini kaldır"
        >
          <Star size={15} fill="currentColor" />
        </button>
      )}

      <div className={s.actions}>
        <button type="button" onClick={(e) => openAt(e, e.currentTarget)} title="Tarih" aria-label="Tarih">
          <Calendar size={15} />
        </button>
        {!task.important && (
          <button
            type="button"
            onClick={() => void board.toggleImportant(task)}
            title="Önemli yap — Bugün ekranında geri sayımla görünür"
            aria-label="Önemli yap"
          >
            <Star size={15} />
          </button>
        )}
        <button type="button" onClick={(e) => openAt(e, e.currentTarget)} title="Diğer" aria-label="Diğer">
          <Ellipsis size={15} />
        </button>
      </div>

      {menu && <TaskMenu task={task} board={board} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}

/**
 * Right-click / "⋯" menu, modelled on Todoist's: quick dates, priority,
 * important, move, delete.
 */
function TaskMenu({
  task,
  board,
  x,
  y,
  onClose,
}: {
  task: Task;
  board: TaskBoard;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const today = board.today;
  const weekday = haftaninGunu(today);
  const run = (f: () => unknown) => () => {
    void f();
    onClose();
  };

  // Rescheduling a recurring Todoist task through due_string would erase its
  // rule; the date picker (next stage) handles those.
  const dateLocked = task.source === "todoist" && task.recurring;
  const dateTitle = (label: string) => (dateLocked ? `${label} — tekrarlı Todoist görevinde tarih seçiciden değişir` : label);

  if (moving) {
    const targets: TaskList[] = board.lists.filter((l) => l.source === task.source && l.id !== task.listId);
    return (
      <Popover x={x} y={y} onClose={onClose} label="Listeye taşı" className={s.moveMenu}>
        <MenuItem icon={<ChevronLeft size={15} />} onSelect={() => setMoving(false)}>
          Geri
        </MenuItem>
        <MenuSeparator />
        {targets.length === 0 && <MenuLabel>Taşınacak başka liste yok</MenuLabel>}
        {targets.map((l) => (
          <MenuItem
            key={l.key}
            icon={<span className={s.dot} style={{ background: l.color }} />}
            onSelect={run(() => board.move(task, l))}
          >
            {l.name}
          </MenuItem>
        ))}
        <MenuLabel>
          {task.source === "local" ? "Argos görevi yalnız Argos listelerine taşınır" : "Todoist görevi yalnız Todoist projelerine taşınır"}
        </MenuLabel>
      </Popover>
    );
  }

  return (
    <Popover x={x} y={y} onClose={onClose} label={task.title}>
      <MenuLabel>Tarih</MenuLabel>
      <MenuIconRow>
        <MenuIconButton title={dateTitle("Bugün")} color="var(--iyi)" disabled={dateLocked} onSelect={run(() => board.setDate(task, today))}>
          <Sun size={16} />
        </MenuIconButton>
        <MenuIconButton title={dateTitle("Yarın")} color="var(--uyari)" disabled={dateLocked} onSelect={run(() => board.setDate(task, gunEkle(today, 1)))}>
          <Sunrise size={16} />
        </MenuIconButton>
        <MenuIconButton
          title={dateTitle("Hafta sonu")}
          color="var(--vurgu)"
          disabled={dateLocked}
          onSelect={run(() => board.setDate(task, gunEkle(today, (5 - weekday + 7) % 7)))}
        >
          <Sofa size={16} />
        </MenuIconButton>
        <MenuIconButton
          title={dateTitle("Gelecek hafta")}
          disabled={dateLocked}
          onSelect={run(() => board.setDate(task, gunEkle(today, 7 - weekday)))}
        >
          <CircleArrowRight size={16} />
        </MenuIconButton>
        <MenuIconButton title={dateTitle("Tarih yok")} disabled={dateLocked || !task.due} onSelect={run(() => board.setDate(task, null))}>
          <CircleSlash size={16} />
        </MenuIconButton>
      </MenuIconRow>

      <MenuLabel>Öncelik</MenuLabel>
      <MenuIconRow>
        {([1, 2, 3, 4] as Priority[]).map((p) => (
          <MenuIconButton
            key={p}
            title={p === 4 ? "Öncelik yok" : `Öncelik ${p}`}
            color={PRIORITY_COLOR[p]}
            active={task.priority === p}
            onSelect={run(() => board.setPriority(task, p))}
          >
            <Flag size={16} fill={p === 4 ? "none" : "currentColor"} />
          </MenuIconButton>
        ))}
      </MenuIconRow>

      <MenuSeparator />
      <MenuItem
        icon={task.important ? <StarOff size={15} /> : <Star size={15} />}
        onSelect={run(() => board.toggleImportant(task))}
      >
        {task.important ? "Önemli işaretini kaldır" : "Önemli yap"}
      </MenuItem>
      <MenuItem icon={<ArrowRight size={15} />} hint="›" onSelect={() => setMoving(true)}>
        Listeye taşı
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger icon={<Trash2 size={15} />} onSelect={run(() => board.remove(task))}>
        Sil
      </MenuItem>
    </Popover>
  );
}
