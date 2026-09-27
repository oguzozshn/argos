import { Bell, Calendar, Check, Flag, Monitor, Plus, Repeat, Star, Trash2, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Priority } from "@ortak/local-tasks";
import type { Task, TaskList } from "@ortak/task";
import { describeReminder } from "@ortak/reminders";
import { dueLabel } from "@ortak/task-dates";
import { DatePicker, splitDue } from "@/ui/DatePicker";
import { MenuIconButton, MenuIconRow, MenuItem, MenuLabel, Popover } from "@/ui/Popover";
import { ReminderMenu } from "./ReminderMenu";
import { PRIORITY_COLOR } from "./TaskRow";
import type { TaskBoard } from "./useTaskBoard";
import s from "./board.module.css";

/**
 * The right-hand task panel, like Todoist's task view: title and description
 * edited in place, then list, date, repeat, priority and important.
 * Text is saved when the field loses focus (Enter in the title, too).
 */
export function TaskPanel({ task, board, onClose }: { task: Task; board: TaskBoard; onClose: () => void }) {
  const list = board.lists.find((l) => l.source === task.source && l.id === task.listId);
  const [picker, setPicker] = useState<{ x: number; y: number; repeat: boolean } | null>(null);
  const [menu, setMenu] = useState<{ kind: "list" | "priority" | "reminder"; x: number; y: number } | null>(null);

  const below = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  };
  const due = task.due ? dueLabel(task.due, board.today) : null;
  const targets = board.lists.filter((l) => l.source === task.source && l.id !== task.listId);

  return (
    <aside className={s.panel} aria-label="Görev ayrıntısı">
      <div className={s.panelTop}>
        <span className={s.panelPath}>
          {list && <span className={s.dot} style={{ background: list.color }} />}
          {list?.name}
        </span>
        <button type="button" onClick={onClose} title="Kapat (Esc)" aria-label="Kapat">
          <X size={16} />
        </button>
      </div>

      <div className={s.panelHead}>
        <button
          type="button"
          className={s.check}
          style={
            PRIORITY_COLOR[task.priority]
              ? {
                  borderColor: PRIORITY_COLOR[task.priority],
                  background: `color-mix(in srgb, ${PRIORITY_COLOR[task.priority]} 12%, transparent)`,
                }
              : undefined
          }
          onClick={() => void board.complete(task)}
          aria-label="Tamamla"
          title="Tamamla"
        >
          <Check size={11} strokeWidth={3} />
        </button>
        <EditableText
          key={`t-${task.key}-${task.title}`}
          className={s.panelTitle}
          value={task.title}
          singleLine
          placeholder="Görev adı"
          onSave={(v) => void board.rename(task, v)}
        />
      </div>
      <EditableText
        key={`d-${task.key}-${task.description}`}
        className={s.panelDescription}
        value={task.description}
        placeholder="Açıklama ekle"
        onSave={(v) => void board.setDescription(task, v)}
      />

      <div className={s.props}>
        <Prop label="Liste">
          <button
            type="button"
            className={s.propValue}
            onClick={(e) => setMenu({ kind: "list", ...below(e) })}
            disabled={targets.length === 0}
          >
            {list && <span className={s.dot} style={{ background: list.color }} />}
            {list?.name ?? "—"}
          </button>
        </Prop>
        <Prop label="Tarih">
          <button
            type="button"
            className={[s.propValue, !due && s.propEmpty, due?.tone === "overdue" && s.toneOverdue].filter(Boolean).join(" ")}
            onClick={(e) => setPicker({ ...below(e), repeat: false })}
          >
            <Calendar size={14} />
            {due ? longDue(task.due!, board.today) : "Tarih ekle"}
          </button>
        </Prop>
        <Prop label="Tekrar">
          <button
            type="button"
            className={task.recurring ? s.propValue : `${s.propValue} ${s.propEmpty}`}
            onClick={(e) => setPicker({ ...below(e), repeat: true })}
          >
            <Repeat size={14} />
            {task.recurrenceText ?? "Tekrarlanmıyor"}
          </button>
        </Prop>
        <Prop label="Öncelik">
          <button
            type="button"
            className={task.priority === 4 ? `${s.propValue} ${s.propEmpty}` : s.propValue}
            style={{ color: PRIORITY_COLOR[task.priority] }}
            onClick={(e) => setMenu({ kind: "priority", ...below(e) })}
          >
            <Flag size={14} fill={task.priority < 4 ? "currentColor" : "none"} />
            {task.priority < 4 ? `P${task.priority}` : "Öncelik yok"}
          </button>
        </Prop>
        <Prop label="Hatırlatıcı">
          <div className={s.reminderChips}>
            {task.reminders.map((rem) => (
              <button
                key={rem.id}
                type="button"
                className={s.reminderChip}
                onClick={(e) => setMenu({ kind: "reminder", ...below(e) })}
              >
                <Bell size={12} />
                {describeReminder(rem, board.today)}
              </button>
            ))}
            <button
              type="button"
              className={task.reminders.length ? s.reminderAdd : `${s.propValue} ${s.propEmpty}`}
              onClick={(e) => setMenu({ kind: "reminder", ...below(e) })}
            >
              {task.reminders.length ? <Plus size={13} /> : <Bell size={14} />}
              {task.reminders.length ? "" : "Hatırlatıcı ekle"}
            </button>
          </div>
        </Prop>
        <Prop label="Önemli">
          <button
            type="button"
            className={task.important ? `${s.propValue} ${s.propImportant}` : `${s.propValue} ${s.propEmpty}`}
            onClick={() => void board.toggleImportant(task)}
          >
            <Star size={14} fill={task.important ? "currentColor" : "none"} />
            {task.important ? "Önemli · Bugün'de geri sayım" : "Önemli değil"}
          </button>
        </Prop>
      </div>

      <div className={s.panelFoot}>
        <span className={s.panelSource}>
          {task.source === "local" ? (
            <>
              <Monitor size={12} /> Argos görevi
            </>
          ) : (
            "Todoist görevi"
          )}
        </span>
        <button
          type="button"
          className={s.deleteButton}
          onClick={() => {
            board.remove(task);
            onClose();
          }}
        >
          <Trash2 size={14} />
          Sil
        </button>
      </div>

      {picker && (
        <DatePicker
          x={picker.x}
          y={picker.y}
          today={board.today}
          openRepeat={picker.repeat}
          value={{ ...splitDue(task.due), rule: task.rule, recurrenceText: task.recurrenceText }}
          canClearTime={!(task.source === "todoist" && task.recurring)}
          onChange={(sched) => void board.setSchedule(task, sched)}
          onClose={() => setPicker(null)}
        />
      )}

      {menu?.kind === "list" && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)} label="Listeye taşı" className={s.moveMenu}>
          {targets.map((l: TaskList) => (
            <MenuItem
              key={l.key}
              icon={<span className={s.dot} style={{ background: l.color }} />}
              onSelect={() => {
                void board.move(task, l);
                setMenu(null);
              }}
            >
              {l.name}
            </MenuItem>
          ))}
          <MenuLabel>
            {task.source === "local" ? "Argos görevi yalnız Argos listelerine taşınır" : "Todoist görevi yalnız Todoist projelerine taşınır"}
          </MenuLabel>
        </Popover>
      )}

      {menu?.kind === "reminder" && (
        <ReminderMenu
          x={menu.x}
          y={menu.y}
          today={board.today}
          due={task.due}
          reminders={task.reminders}
          onAdd={(rem) => void board.addReminder(task, rem)}
          onRemove={(id) => void board.removeReminder(task, id)}
          onClose={() => setMenu(null)}
        />
      )}

      {menu?.kind === "priority" && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)} label="Öncelik">
          <MenuIconRow>
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <MenuIconButton
                key={p}
                title={p === 4 ? "Öncelik yok" : `Öncelik ${p}`}
                color={PRIORITY_COLOR[p]}
                active={task.priority === p}
                onSelect={() => {
                  void board.setPriority(task, p);
                  setMenu(null);
                }}
              >
                <Flag size={16} fill={p === 4 ? "none" : "currentColor"} />
              </MenuIconButton>
            ))}
          </MenuIconRow>
        </Popover>
      )}
    </aside>
  );
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={s.prop}>
      <span className={s.propLabel}>{label}</span>
      {children}
    </div>
  );
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/** "17 Ekim Cumartesi · 14:00" (with "Bugün"/"Yarın" in front when close). */
function longDue(due: string, today: string): string {
  const iso = due.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
  const near = dueLabel(iso, today).label;
  const prefix = near === "Bugün" || near === "Yarın" || near === "Dün" ? `${near}, ` : "";
  const year = iso.slice(0, 4) !== today.slice(0, 4) ? ` ${y}` : "";
  const time = due.length > 10 ? ` · ${due.slice(11, 16)}` : "";
  return `${prefix}${d} ${MONTHS[m! - 1]}${year} ${DAYS[weekday]}${time}`;
}

/**
 * Text edited in place. Saves on blur; Enter saves in single-line mode,
 * Escape puts the old text back.
 */
function EditableText({
  value,
  onSave,
  placeholder,
  className,
  singleLine = false,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder: string;
  className: string;
  singleLine?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(singleLine ? e.target.value.replace(/\n/g, " ") : e.target.value)}
      onBlur={() => {
        const next = singleLine ? draft.trim() : draft;
        if (singleLine && !next) setDraft(value);
        else if (next !== value) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && singleLine) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(value);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
    />
  );
}

