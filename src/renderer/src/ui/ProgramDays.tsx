import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { bugunIso } from "@ortak/plan";
import {
  PROGRAMS_PATH,
  endDate,
  findSession,
  normalizePrograms,
  progress,
  schedule,
  toggleDone,
  weekCells,
  type Program,
  type WeekCell,
  type ProgramsFile,
  type ScheduleEntry,
} from "@ortak/program";
import { useDosya } from "@/veri/kanca";
import s from "./programDays.module.css";

/**
 * Programs' days where the day's other things are: the calendar's cells and
 * day panel. Read only; the log is written on the Programlar screens.
 */

export interface ProgramDay {
  date: string;
  program: Program;
  entry: ScheduleEntry;
  /** "A günü", or the rest-day thing's name. */
  name: string;
}

const STATUS: Record<ScheduleEntry["status"], string> = {
  planned: "",
  done: "yapıldı",
  skipped: "atlandı",
  missed: "kaçtı",
  rest: "yapıldı",
};

/** Program days by date, for the active programs. */
export function useProgramDays(): (iso: string) => ProgramDay[] {
  const file = useDosya<ProgramsFile>(PROGRAMS_PATH);
  const today = bugunIso();
  const byDate = useMemo(() => {
    const data = normalizePrograms(file.veri);
    const map = new Map<string, ProgramDay[]>();
    for (const p of data.programs) {
      if (p.archived) continue;
      for (const entry of schedule(p, data.logs, today)) {
        const name =
          entry.status === "rest"
            ? (p.restDay?.name ?? "Ara gün")
            : (entry.log?.sessionName ?? findSession(p, entry.sessionId)?.name ?? "Antrenman");
        (map.get(entry.date) ?? map.set(entry.date, []).get(entry.date)!).push({ date: entry.date, program: p, entry, name });
      }
    }
    return map;
  }, [file.veri, today]);
  return (iso) => byDate.get(iso) ?? [];
}

export interface ProgramWeekRow {
  program: Program;
  cells: WeekCell[];
}

/**
 * Programs as rows of a week's tick grid (Alışkanlıklar): the programs
 * running in that week, their cells, and a tick that logs or unlogs a day.
 */
export function useProgramWeek(dates: string[]) {
  const file = useDosya<ProgramsFile>(PROGRAMS_PATH);
  const today = bugunIso();
  const key = dates.join(",");
  const rows = useMemo((): ProgramWeekRow[] => {
    const data = normalizePrograms(file.veri);
    const list = key ? key.split(",") : [];
    if (list.length === 0) return [];
    return data.programs
      .filter((p) => !p.archived)
      .map((p) => ({ program: p, cells: weekCells(data, p, list, today) }))
      .filter((r) => list.some((d) => d >= r.program.start && d <= endDate(r.program)));
  }, [file.veri, key, today]);
  const toggle = (programId: string, date: string) =>
    void file.degistir((d) => toggleDone(normalizePrograms(d), programId, date, bugunIso()));
  return { rows, toggle, today };
}

export interface GoalProgram {
  id: string;
  name: string;
  done: number;
  total: number;
  week: number;
  weeks: number;
  ended: boolean;
}

/** Programs by the goal they are linked to, with their progress, for Hedefler. */
export function useGoalPrograms(): Map<string, GoalProgram[]> {
  const file = useDosya<ProgramsFile>(PROGRAMS_PATH);
  const today = bugunIso();
  return useMemo(() => {
    const data = normalizePrograms(file.veri);
    const map = new Map<string, GoalProgram[]>();
    for (const p of data.programs) {
      if (!p.goalId || p.archived) continue;
      const pr = progress(data, p, today);
      (map.get(p.goalId) ?? map.set(p.goalId, []).get(p.goalId)!).push({
        id: p.id,
        name: p.name,
        done: pr.done,
        total: pr.total,
        week: pr.week,
        weeks: pr.weeks,
        ended: pr.ended,
      });
    }
    return map;
  }, [file.veri, today]);
}

const classFor = (x: ProgramDay) =>
  [
    s.chip,
    (x.entry.status === "done" || x.entry.status === "rest") && s.done,
    x.entry.status === "skipped" && s.skipped,
    x.entry.status === "missed" && s.missed,
  ]
    .filter(Boolean)
    .join(" ");

/** A small chip for a calendar cell. Workouts only; rest-day logs stay in the day panel. */
export function ProgramChip({ x }: { x: ProgramDay }) {
  if (x.entry.status === "rest") return null;
  const st = STATUS[x.entry.status];
  return (
    <span className={classFor(x)} title={`${x.program.name} · ${x.name}${st ? ` · ${st}` : ""}`}>
      {x.name}
    </span>
  );
}

/** The day's program entries for the calendar's day panel; each opens that day's log. */
export function DayPrograms({ gun }: { gun: string }) {
  const days = useProgramDays()(gun);
  const navigate = useNavigate();
  if (days.length === 0) return null;
  return (
    <div className={s.list}>
      <p className={s.title}>Programlar</p>
      {days.map((x) => {
        const st = STATUS[x.entry.status];
        return (
          <button
            key={`${x.program.id}|${x.entry.status === "rest" ? "rest" : "w"}`}
            type="button"
            className={[s.row, x.entry.status === "missed" && s.rowMissed, st && x.entry.status !== "missed" && s.rowDone]
              .filter(Boolean)
              .join(" ")}
            onClick={() => navigate(`/programs/log?p=${encodeURIComponent(x.program.id)}&d=${gun}`)}
          >
            <span className={s.dot} />
            <span className={s.name}>
              {x.program.name}: {x.name}
            </span>
            {st && <span className={s.status}>{st}</span>}
          </button>
        );
      })}
    </div>
  );
}
