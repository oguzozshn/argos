import { Bell, Plus, X } from "lucide-react";
import { useState } from "react";
import type { NewReminder, Reminder } from "@ortak/local-tasks";
import { REMINDER_PRESETS, describeReminder, reminderMoment } from "@ortak/reminders";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import s from "./board.module.css";

/**
 * Reminders of one task: the current ones with a remove button, quick
 * "before the due time" choices, and a fixed date and time. Relative
 * choices need a date; on an all-day task they count from 09:00.
 */
export function ReminderMenu({
  x,
  y,
  today,
  due,
  reminders,
  onAdd,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  today: string;
  due: string | null;
  reminders: Reminder[];
  onAdd: (r: NewReminder) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(due?.slice(0, 10) ?? today);
  const [time, setTime] = useState("09:00");
  const taken = new Set(reminders.flatMap((r) => (r.kind === "relative" ? [r.minutesBefore] : [])));
  const moment = (r: Reminder) => {
    const at = reminderMoment(due, r);
    return at ? describeReminder({ id: "", kind: "absolute", at }, today) : null;
  };

  return (
    <Popover x={x} y={y} onClose={onClose} label="Hatırlatıcılar" className={s.reminderMenu}>
      {reminders.length > 0 && (
        <>
          <MenuLabel>Kurulu</MenuLabel>
          {reminders.map((r) => (
            <div key={r.id} className={s.reminderRow}>
              <Bell size={14} />
              <span className={s.reminderText}>{describeReminder(r, today)}</span>
              {r.kind === "relative" && <span className={s.reminderWhen}>{moment(r) ?? "tarih yok"}</span>}
              <button type="button" onClick={() => onRemove(r.id)} aria-label="Hatırlatıcıyı kaldır" title="Kaldır">
                <X size={13} />
              </button>
            </div>
          ))}
          <MenuSeparator />
        </>
      )}

      <MenuLabel>{due ? (due.length > 10 ? "Görev saatine göre" : "Görev gününe göre (09:00 esas)") : "Önce görevin tarihini ver"}</MenuLabel>
      {REMINDER_PRESETS.filter((m) => !taken.has(m)).map((m) => (
        <MenuItem
          key={m}
          icon={<Bell size={15} />}
          disabled={!due}
          hint={due ? moment({ id: "", kind: "relative", minutesBefore: m }) : undefined}
          onSelect={() => onAdd({ kind: "relative", minutesBefore: m })}
        >
          {describeReminder({ id: "", kind: "relative", minutesBefore: m })}
        </MenuItem>
      ))}

      <MenuSeparator />
      <MenuLabel>Belirli zaman</MenuLabel>
      <div className={s.reminderFixed}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Gün" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Saat" />
        <button
          type="button"
          onClick={() => date && time && onAdd({ kind: "absolute", at: `${date}T${time}` })}
          disabled={!date || !time}
        >
          <Plus size={14} /> Ekle
        </button>
      </div>
      <MenuLabel>Telefona Telegram'dan, bilgisayar açıksa bildirim olarak gelir.</MenuLabel>
    </Popover>
  );
}
