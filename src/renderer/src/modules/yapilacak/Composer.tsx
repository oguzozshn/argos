import { Calendar, ChevronDown, Flag, Monitor, Repeat, Star, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { dueValue, parseDateText } from "@ortak/date-parse";
import type { Priority } from "@ortak/local-tasks";
import { splitQuickAdd } from "@ortak/quick-add";
import { describeRule } from "@ortak/recurrence";
import type { TaskList } from "@ortak/task";
import { dueLabel } from "@ortak/task-dates";
import { Dugme } from "@/ui/bilesenler";
import { DatePicker, type Schedule } from "@/ui/DatePicker";
import { MenuIconButton, MenuIconRow, MenuItem, MenuLabel, Popover } from "@/ui/Popover";
import { PRIORITY_COLOR } from "./TaskRow";
import type { TaskBoard } from "./useTaskBoard";
import s from "./board.module.css";

/**
 * Todoist-style add box. The title line understands dates, p1–p4 and
 * @önemli as you type ("fatura öde yarın 18:00 p1"); the chips show what it
 * understood and can override it. It stays open after adding, for the next one.
 */
export function Composer({
  list,
  board,
  onClose,
}: {
  list: TaskList;
  board: TaskBoard;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  /** Set from the picker; null date means "no date" even if the text has one. */
  const [pickedSchedule, setPickedSchedule] = useState<Schedule | null>(null);
  const [pickedPriority, setPickedPriority] = useState<Priority | null>(null);
  const [importantOverride, setImportantOverride] = useState<boolean | null>(null);
  const [targetKey, setTargetKey] = useState(list.key);
  const [popup, setPopup] = useState<{ kind: "date" | "priority" | "list"; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const target = board.lists.find((l) => l.key === targetKey) ?? list;

  const parsed = useMemo(() => {
    const q = splitQuickAdd(text, board.today);
    const date = q.dateText ? parseDateText(q.dateText, board.today) : null;
    return { ...q, date };
  }, [text, board.today]);

  const schedule: Schedule | null = pickedSchedule
    ? pickedSchedule.date
      ? pickedSchedule
      : null
    : parsed.date
      ? { date: parsed.date.date, time: parsed.date.time, repeat: parsed.date.rule ? { kind: "rule", rule: parsed.date.rule } : { kind: "none" } }
      : null;
  const priority: Priority = pickedPriority ?? parsed.priority ?? 4;
  const important = importantOverride ?? parsed.important;
  const rule = schedule?.repeat.kind === "rule" ? schedule.repeat.rule : null;

  const dateText = schedule?.date
    ? `${rule ? `${describeRule(rule)} · ` : ""}${dueLabel(dueValue({ date: schedule.date, time: schedule.time }), board.today).label}`
    : null;

  const below = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  };

  const reset = () => {
    setText("");
    setDescription("");
    setPickedSchedule(null);
    setPickedPriority(null);
    setImportantOverride(null);
  };

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    const ok = await board.createTask(target, {
      title: parsed.title,
      description: description.trim() || undefined,
      schedule,
      priority,
      important,
    });
    setBusy(false);
    if (ok) reset();
    titleRef.current?.focus();
  };

  const keys = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className={s.composer}>
      <input
        ref={titleRef}
        autoFocus
        className={s.composerInput}
        value={text}
        placeholder="Görev adı — örn. fatura öde yarın 18:00 p1 @önemli"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={keys}
      />
      <textarea
        className={s.composerDescription}
        rows={1}
        value={description}
        placeholder="Açıklama"
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={keys}
      />

      <div className={s.composerChips}>
        <span className={dateText ? `${s.chipButton} ${s.chipOn}` : s.chipButton}>
          <button type="button" onClick={(e) => setPopup({ kind: "date", ...below(e) })}>
            {rule ? <Repeat size={13} /> : <Calendar size={13} />}
            {dateText ?? "Tarih"}
          </button>
          {dateText && (
            <button
              type="button"
              className={s.chipClear}
              aria-label="Tarihi kaldır"
              onClick={() => setPickedSchedule({ date: null, time: null, repeat: { kind: "none" } })}
            >
              <X size={12} />
            </button>
          )}
        </span>
        <span
          className={priority < 4 ? `${s.chipButton} ${priority === 1 ? s.chipDangerOn : s.chipOn}` : s.chipButton}
          style={priority > 1 && priority < 4 ? { color: PRIORITY_COLOR[priority] } : undefined}
        >
          <button type="button" onClick={(e) => setPopup({ kind: "priority", ...below(e) })}>
            <Flag size={13} fill={priority < 4 ? "currentColor" : "none"} />
            {priority < 4 ? `P${priority}` : "Öncelik"}
          </button>
        </span>
        <span className={important ? `${s.chipButton} ${s.chipImportantOn}` : s.chipButton}>
          <button type="button" onClick={() => setImportantOverride(!important)}>
            <Star size={13} fill={important ? "currentColor" : "none"} />
            Önemli
          </button>
        </span>
      </div>

      <div className={s.composerFoot}>
        <button type="button" className={s.listPick} onClick={(e) => setPopup({ kind: "list", ...below(e) })}>
          <span className={s.dot} style={{ background: target.color }} />
          {target.name}
          {target.source === "local" && <Monitor size={12} />}
          <ChevronDown size={14} />
        </button>
        <span className={s.hint}>Enter ekler · Esc kapatır</span>
        <span className={s.grow} />
        <Dugme tur="sade" onClick={onClose}>
          İptal
        </Dugme>
        <Dugme tur="dolu" onClick={() => void submit()} disabled={!parsed.title || busy}>
          Görev ekle
        </Dugme>
      </div>

      {popup?.kind === "date" && (
        <DatePicker
          x={popup.x}
          y={popup.y}
          today={board.today}
          value={{
            date: schedule?.date ?? null,
            time: schedule?.time ?? null,
            rule,
            recurrenceText: rule ? describeRule(rule) : null,
          }}
          onChange={(sched) =>
            setPickedSchedule({
              ...sched,
              // A new task has no rule to keep: "keep" means whatever is chosen now.
              repeat: sched.repeat.kind === "keep" ? (rule ? { kind: "rule", rule } : { kind: "none" }) : sched.repeat,
            })
          }
          onClose={() => {
            setPopup(null);
            titleRef.current?.focus();
          }}
        />
      )}

      {popup?.kind === "priority" && (
        <Popover x={popup.x} y={popup.y} onClose={() => setPopup(null)} label="Öncelik">
          <MenuIconRow>
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <MenuIconButton
                key={p}
                title={p === 4 ? "Öncelik yok" : `Öncelik ${p}`}
                color={PRIORITY_COLOR[p]}
                active={priority === p}
                onSelect={() => {
                  setPickedPriority(p);
                  setPopup(null);
                  titleRef.current?.focus();
                }}
              >
                <Flag size={16} fill={p === 4 ? "none" : "currentColor"} />
              </MenuIconButton>
            ))}
          </MenuIconRow>
        </Popover>
      )}

      {popup?.kind === "list" && (
        <Popover x={popup.x} y={popup.y} onClose={() => setPopup(null)} label="Liste" className={s.moveMenu}>
          {(["todoist", "local"] as const).map((source) => {
            const lists = board.lists.filter((l) => l.source === source);
            if (lists.length === 0) return null;
            return (
              <div key={source}>
                <MenuLabel>{source === "todoist" ? "Todoist" : "Argos listeleri"}</MenuLabel>
                {lists.map((l) => (
                  <MenuItem
                    key={l.key}
                    active={l.key === target.key}
                    icon={<span className={s.dot} style={{ background: l.color }} />}
                    onSelect={() => {
                      setTargetKey(l.key);
                      setPopup(null);
                      titleRef.current?.focus();
                    }}
                  >
                    {l.name}
                  </MenuItem>
                ))}
              </div>
            );
          })}
        </Popover>
      )}
    </div>
  );
}
