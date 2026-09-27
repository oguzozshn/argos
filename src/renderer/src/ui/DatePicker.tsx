import {
  ChevronLeft,
  ChevronRight,
  CircleArrowRight,
  CircleSlash,
  Clock,
  Repeat,
  Sofa,
  Sun,
  Sunrise,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { dueValue, parseDateText } from "@ortak/date-parse";
import { AY_ADLARI, AY_TAM, GUN_KISA, gunAl, gunEkle, haftaninGunu } from "@ortak/gun";
import { describeRule, firstOccurrence, presetRules, type RecurrenceRule } from "@ortak/recurrence";
import { dueLabel } from "@ortak/task-dates";
import { Popover } from "./Popover";
import s from "./datePicker.module.css";

/**
 * Todoist-style scheduler: type a date ("cuma 14:00", "her salı"), pick a
 * quick option or a day, set a time, choose a repeat. It reports a Schedule;
 * the caller decides how each source stores it.
 */

/** What happens to an existing repeat rule. */
export type RepeatChoice = { kind: "keep" } | { kind: "none" } | { kind: "rule"; rule: RecurrenceRule };

export interface Schedule {
  date: string | null;
  time: string | null;
  repeat: RepeatChoice;
}

export interface DatePickerValue {
  /** "YYYY-MM-DD" or null. */
  date: string | null;
  time: string | null;
  /** The structured rule when known (Argos tasks); Todoist tasks only have `recurrenceText`. */
  rule: RecurrenceRule | null;
  recurrenceText: string | null;
}

export const splitDue = (due: string | null): { date: string | null; time: string | null } => ({
  date: due ? due.slice(0, 10) : null,
  time: due && due.length > 10 ? due.slice(11, 16) : null,
});

const sameRule = (a: RecurrenceRule | null, b: RecurrenceRule): boolean => JSON.stringify(a) === JSON.stringify(b);

export function DatePicker({
  x,
  y,
  today,
  value,
  onChange,
  onClose,
  openRepeat = false,
  canClearTime = true,
}: {
  x: number;
  y: number;
  today: string;
  value: DatePickerValue;
  onChange: (s: Schedule) => void;
  onClose: () => void;
  openRepeat?: boolean;
  /**
   * False for recurring Todoist tasks: a due string without "at" keeps the
   * old time there (checked against Todoist), so the time cannot be removed.
   */
  canClearTime?: boolean;
}) {
  const [text, setText] = useState("");
  const [month, setMonth] = useState(() => (value.date ?? today).slice(0, 7) + "-01");
  const [showTime, setShowTime] = useState(false);
  const [showRepeat, setShowRepeat] = useState(openRepeat);
  const [timeDraft, setTimeDraft] = useState(value.time ?? "09:00");
  const recurring = value.rule !== null || value.recurrenceText !== null;

  const parsed = useMemo(() => (text.trim() ? parseDateText(text, today) : null), [text, today]);

  const pick = (sched: Schedule) => {
    onChange(sched);
    onClose();
  };
  const pickDay = (date: string | null) =>
    pick(date ? { date, time: value.time, repeat: { kind: "keep" } } : { date: null, time: null, repeat: { kind: "none" } });

  const weekday = haftaninGunu(today);
  const quick: { icon: ReactNode; label: string; hint: string; date: string | null; color?: string }[] = [
    { icon: <Sun size={15} />, label: "Bugün", hint: GUN_KISA[weekday]!, date: today, color: "var(--iyi)" },
    { icon: <Sunrise size={15} />, label: "Yarın", hint: GUN_KISA[(weekday + 1) % 7]!, date: gunEkle(today, 1), color: "var(--uyari)" },
    ...(() => {
      const sat = gunEkle(today, (5 - weekday + 7) % 7);
      const mon = gunEkle(today, 7 - weekday);
      const short = (iso: string) => `${GUN_KISA[haftaninGunu(iso)]} ${gunAl(iso)} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`;
      return [
        { icon: <Sofa size={15} />, label: "Bu hafta sonu", hint: short(sat), date: sat, color: "var(--vurgu)" },
        { icon: <CircleArrowRight size={15} />, label: "Gelecek hafta", hint: short(mon), date: mon },
      ];
    })(),
    { icon: <CircleSlash size={15} />, label: "Tarih yok", hint: "", date: null },
  ];

  const first = (haftaninGunu(month) + 7) % 7;
  const days = Array.from({ length: 42 }, (_, i) => gunEkle(month, i - first));
  const shiftMonth = (n: number) => {
    const y0 = Number(month.slice(0, 4));
    const m0 = Number(month.slice(5, 7)) - 1 + n;
    const yy = y0 + Math.floor(m0 / 12);
    const mm = ((m0 % 12) + 12) % 12;
    setMonth(`${yy}-${String(mm + 1).padStart(2, "0")}-01`);
  };

  const base = value.date ?? today;
  const presets = presetRules(base);

  const parsedLabel = parsed
    ? (parsed.rule ? `${describeRule(parsed.rule)} · ilk: ` : "") + dueLabel(dueValue(parsed), today).label
    : text.trim()
      ? "Anlaşılamadı — örn. cuma 14:00, haftaya salı, her ayın 15'i"
      : "";

  return (
    <Popover x={x} y={y} onClose={onClose} className={s.picker} label="Tarih seç">
      <div className={s.inputWrap}>
        <input
          autoFocus
          className={s.input}
          value={text}
          placeholder="Tarih yaz — cuma 14:00, haftaya salı, her pazartesi"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed) {
              pick({
                date: parsed.date,
                time: parsed.time,
                repeat: parsed.rule ? { kind: "rule", rule: parsed.rule } : { kind: "none" },
              });
            }
          }}
        />
        {parsedLabel && <div className={parsed ? s.preview : `${s.preview} ${s.previewBad}`}>{parsedLabel}</div>}
        {recurring && value.recurrenceText && !text && (
          <div className={s.current}>
            <Repeat size={12} /> Şu an: {value.recurrenceText}
          </div>
        )}
      </div>

      <div className={s.quick}>
        {quick.map((q) => (
          <button key={q.label} type="button" className={s.quickItem} onClick={() => pickDay(q.date)}>
            <span className={s.quickIcon} style={{ color: q.color ?? "var(--metin-soluk)" }}>
              {q.icon}
            </span>
            {q.label}
            <span className={s.quickHint}>{q.hint}</span>
          </button>
        ))}
      </div>

      <div className={s.month}>
        <div className={s.monthHead}>
          <span>
            {AY_TAM[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
          </span>
          <span className={s.monthNav}>
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Önceki ay">
              <ChevronLeft size={15} />
            </button>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Sonraki ay">
              <ChevronRight size={15} />
            </button>
          </span>
        </div>
        <div className={s.grid}>
          {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map((d) => (
            <span key={d} className={s.weekday}>
              {d}
            </span>
          ))}
          {days.map((d) => {
            const cls = [
              s.day,
              d.slice(0, 7) !== month.slice(0, 7) && s.otherMonth,
              d === today && s.today,
              d === value.date && s.selected,
              d < today && s.past,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button key={d} type="button" className={cls} onClick={() => pickDay(d)} aria-label={d}>
                {gunAl(d)}
              </button>
            );
          })}
        </div>
      </div>

      <div className={s.foot}>
        <button
          type="button"
          className={value.time ? `${s.footButton} ${s.footActive}` : s.footButton}
          onClick={() => {
            setShowTime((v) => !v);
            setShowRepeat(false);
          }}
        >
          <Clock size={14} />
          {value.time ?? "Saat"}
        </button>
        <button
          type="button"
          className={recurring ? `${s.footButton} ${s.footActive}` : s.footButton}
          onClick={() => {
            setShowRepeat((v) => !v);
            setShowTime(false);
          }}
        >
          <Repeat size={14} />
          {value.rule ? describeRule(value.rule) : (value.recurrenceText ?? "Tekrarla")}
        </button>
      </div>

      {showTime && (
        <div className={s.timeRow}>
          <input
            type="time"
            className={s.timeInput}
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && timeDraft) pick({ date: base, time: timeDraft, repeat: { kind: "keep" } });
            }}
          />
          <button type="button" className={s.apply} onClick={() => timeDraft && pick({ date: base, time: timeDraft, repeat: { kind: "keep" } })}>
            Uygula
          </button>
          {value.time && canClearTime && (
            <button type="button" className={s.clear} onClick={() => pick({ date: base, time: null, repeat: { kind: "keep" } })}>
              Saati kaldır
            </button>
          )}
        </div>
      )}

      {showRepeat && (
        <div className={s.repeat}>
          <button
            type="button"
            className={!recurring ? `${s.repeatItem} ${s.repeatActive}` : s.repeatItem}
            onClick={() => pick({ date: value.date, time: value.time, repeat: { kind: "none" } })}
          >
            <Repeat size={14} />
            Tekrarlanmıyor
          </button>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={sameRule(value.rule, p.rule) ? `${s.repeatItem} ${s.repeatActive}` : s.repeatItem}
              onClick={() =>
                pick({
                  date: firstOccurrence(p.rule, base) ?? base,
                  time: value.time,
                  repeat: { kind: "rule", rule: p.rule },
                })
              }
            >
              <Repeat size={14} />
              {p.label}
            </button>
          ))}
          <div className={s.repeatHint}>Başkası için yukarıya yaz: “3 günde bir”, “her pazartesi ve perşembe”, “her ayın son günü”.</div>
        </div>
      )}
    </Popover>
  );
}
