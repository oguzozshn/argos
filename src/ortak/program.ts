// Explicit .ts extension: this file also runs under plain Node (araclar/program-test.mts).
import { gunEkle, gunFarki, haftaninGunu } from "./gun.ts";

/**
 * Programs: a plan written once that Argos lays on the days — a training
 * plan ("A/B, Mon/Wed/Fri, 8 weeks"), later guitar practice and the like.
 *
 * The user writes the plan; Argos never changes it or suggests changes. It
 * only answers "what is on today?", keeps the log and counts progress.
 *
 * Rules of the calendar (all in `schedule`):
 * - Sessions come in the program's order (A, B, A, B…), one per workout
 *   logged. A missed day does not skip a session: the order slides.
 * - At least `minGapDays` between two workouts (2: one rest day between).
 * - Each planned weekday owes one session. At most one is owed at a time:
 *   missing a whole week does not pile up a backlog, it only slides.
 * - While a session is owed, any day the gap allows takes it (catch-up);
 *   otherwise only the planned weekdays do.
 *
 * A log copies the session's and exercises' names and bands of that day, so
 * editing the program later changes only what is ahead, never the past.
 *
 * Everything here is pure: one state of the file to the next.
 */

export const PROGRAMS_PATH = "programs.json";

export interface Exercise {
  id: string;
  name: string;
  /** Band, weight… free text ("orta", "orta + yumuşak"). */
  load?: string;
  /** Where the door anchor goes, the setup… free text. */
  setup?: string;
  sets?: number;
  /** Free text: "12–15", "10 her taraf". */
  reps?: string;
  target?: string;
  note?: string;
}

export interface SessionTemplate {
  /** Short and shown: "A", "B". */
  id: string;
  name: string;
  minutes?: number;
  exercises: Exercise[];
}

/** Weeks `fromWeek`…`toWeek` (1-based); sets/reps given here win over the exercise's own. */
export interface Phase {
  id: string;
  fromWeek: number;
  toWeek: number;
  name: string;
  sets?: number;
  reps?: string;
  note?: string;
}

export interface Program {
  id: string;
  name: string;
  /** Goal in `hedefler.json` it counts towards. */
  goalId?: string;
  /** "YYYY-MM-DD", the first day of week 1. */
  start: string;
  weeks: number;
  /** Planned weekdays: 0 Monday … 6 Sunday. */
  days: number[];
  /** Session ids in turn: ["A", "B"]. */
  order: string[];
  sessions: SessionTemplate[];
  phases: Phase[];
  warmup: string[];
  cooldown: string[];
  /** Something optional for the days in between ("Yürüyüş"). */
  restDay?: { name: string; minutes?: number };
  minGapDays: number;
  archived?: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  name: string;
  load?: string;
  /** Reps of each set done. */
  reps: number[];
}

/**
 * One day of a program. "done" and "skipped" are workouts and take the next
 * session in turn (skipping is saying "not this one"); only "done" counts
 * as progress and starts the gap. "rest" is the optional rest-day thing.
 */
export interface WorkoutLog {
  id: string;
  programId: string;
  date: string;
  status: "done" | "skipped" | "rest";
  sessionId?: string;
  sessionName?: string;
  exercises: ExerciseLog[];
  note?: string;
}

export interface ProgramsFile {
  version: 1;
  programs: Program[];
  logs: WorkoutLog[];
}

export const EMPTY_PROGRAMS: ProgramsFile = { version: 1, programs: [], logs: [] };

export const newProgramId = (d = new Date()): string => `pr-${d.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const newItemId = (d = new Date()): string => `x-${d.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const newLogId = (d = new Date()): string => `l-${d.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* --- reading the file ----------------------------------------------------------------- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (x: unknown): x is string => typeof x === "string" && ISO.test(x);
const isText = (x: unknown): x is string => typeof x === "string";
const posInt = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
/** Optional text field: kept only when it says something. */
const opt = <K extends string>(k: K, x: unknown): Partial<Record<K, string>> =>
  isText(x) && x.trim() ? ({ [k]: x.trim() } as Record<K, string>) : {};
const optNum = <K extends string>(k: K, x: unknown): Partial<Record<K, number>> =>
  posInt(x) ? ({ [k]: posInt(x) } as Record<K, number>) : {};
const texts = (x: unknown): string[] => arr(x).filter(isText).map((s) => s.trim()).filter(Boolean);

function readExercise(x: unknown): Exercise | null {
  const e = obj(x);
  if (!isText(e.id) || !isText(e.name)) return null;
  return {
    id: e.id,
    name: e.name,
    ...opt("load", e.load),
    ...opt("setup", e.setup),
    ...optNum("sets", e.sets),
    ...opt("reps", e.reps),
    ...opt("target", e.target),
    ...opt("note", e.note),
  };
}

function readProgram(x: unknown): Program | null {
  const p = obj(x);
  if (!isText(p.id) || !isText(p.name) || !isDate(p.start)) return null;
  const sessions = arr(p.sessions)
    .map((s): SessionTemplate | null => {
      const o = obj(s);
      if (!isText(o.id) || !o.id || !isText(o.name)) return null;
      return {
        id: o.id,
        name: o.name,
        ...optNum("minutes", o.minutes),
        exercises: arr(o.exercises).map(readExercise).filter((e): e is Exercise => e !== null),
      };
    })
    .filter((s): s is SessionTemplate => s !== null)
    .filter((s, i, all) => all.findIndex((t) => t.id === s.id) === i);
  const ids = new Set(sessions.map((s) => s.id));
  const order = texts(p.order).filter((id) => ids.has(id));
  const phases = arr(p.phases)
    .map((f): Phase | null => {
      const o = obj(f);
      const from = posInt(o.fromWeek);
      const to = posInt(o.toWeek);
      if (!isText(o.id) || !isText(o.name) || !from || to < from) return null;
      return { id: o.id, fromWeek: from, toWeek: to, name: o.name, ...optNum("sets", o.sets), ...opt("reps", o.reps), ...opt("note", o.note) };
    })
    .filter((f): f is Phase => f !== null)
    .sort((a, b) => a.fromWeek - b.fromWeek);
  const rest = obj(p.restDay);
  return {
    id: p.id,
    name: p.name,
    ...opt("goalId", p.goalId),
    start: p.start,
    weeks: posInt(p.weeks) || 1,
    days: [...new Set(arr(p.days).filter((g): g is number => Number.isInteger(g) && (g as number) >= 0 && (g as number) <= 6))].sort(),
    order: order.length ? order : sessions.map((s) => s.id),
    sessions,
    phases,
    warmup: texts(p.warmup),
    cooldown: texts(p.cooldown),
    ...(isText(rest.name) && rest.name.trim() ? { restDay: { name: rest.name.trim(), ...optNum("minutes", rest.minutes) } } : {}),
    minGapDays: typeof p.minGapDays === "number" && Number.isInteger(p.minGapDays) && p.minGapDays >= 1 ? p.minGapDays : 2,
    ...(p.archived ? { archived: true } : {}),
  };
}

function readLog(x: unknown, programIds: Set<string>): WorkoutLog | null {
  const l = obj(x);
  if (!isText(l.id) || !isText(l.programId) || !programIds.has(l.programId) || !isDate(l.date)) return null;
  if (l.status !== "done" && l.status !== "skipped" && l.status !== "rest") return null;
  return {
    id: l.id,
    programId: l.programId,
    date: l.date,
    status: l.status,
    ...opt("sessionId", l.sessionId),
    ...opt("sessionName", l.sessionName),
    exercises: arr(l.exercises)
      .map((e): ExerciseLog | null => {
        const o = obj(e);
        if (!isText(o.exerciseId) || !isText(o.name)) return null;
        return {
          exerciseId: o.exerciseId,
          name: o.name,
          ...opt("load", o.load),
          reps: arr(o.reps).filter((r): r is number => typeof r === "number" && Number.isInteger(r) && r >= 0),
        };
      })
      .filter((e): e is ExerciseLog => e !== null),
    ...opt("note", l.note),
  };
}

export function normalizePrograms(raw: unknown): ProgramsFile {
  const d = obj(raw);
  const programs = arr(d.programs)
    .map(readProgram)
    .filter((p): p is Program => p !== null)
    .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);
  const ids = new Set(programs.map((p) => p.id));
  const logs = arr(d.logs)
    .map((l) => readLog(l, ids))
    .filter((l): l is WorkoutLog => l !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { version: 1, programs, logs };
}

/* --- reading a program ---------------------------------------------------------------- */

export const findProgram = (f: ProgramsFile, id: string): Program | null => f.programs.find((p) => p.id === id) ?? null;

export const findSession = (p: Program, id: string | undefined): SessionTemplate | null => p.sessions.find((s) => s.id === id) ?? null;

/** Last day of the program. */
export const endDate = (p: Program): string => gunEkle(p.start, p.weeks * 7 - 1);

/** Week number of a date (1-based); 0 before the start, past `weeks` after the end. */
export const weekOf = (p: Program, date: string): number => {
  const diff = gunFarki(date, p.start);
  return diff < 0 ? 0 : Math.floor(diff / 7) + 1;
};

export const phaseOf = (p: Program, date: string): Phase | null => {
  const w = weekOf(p, date);
  return p.phases.find((f) => w >= f.fromWeek && w <= f.toWeek) ?? null;
};

/** An exercise as it is to be done on a date: the phase's sets/reps win. */
export function effectiveExercise(p: Program, e: Exercise, date: string): Exercise {
  const f = phaseOf(p, date);
  return {
    ...e,
    ...(f?.sets ? { sets: f.sets } : {}),
    ...(f?.reps ? { reps: f.reps } : {}),
  };
}

const logsOf = (f: ProgramsFile, programId: string): WorkoutLog[] => f.logs.filter((l) => l.programId === programId);

/** Planned weekdays between start and end: what "9/24" counts against. */
export function plannedCount(p: Program): number {
  let n = 0;
  for (let d = p.start, end = endDate(p); d <= end; d = gunEkle(d, 1)) if (p.days.includes(haftaninGunu(d))) n++;
  return n;
}

/* --- the calendar ------------------------------------------------------------------- */

export interface ScheduleEntry {
  date: string;
  /** done/skipped/rest: logged. missed: a planned day gone by. planned: ahead (today included). */
  status: "done" | "skipped" | "rest" | "missed" | "planned";
  sessionId?: string;
  log?: WorkoutLog;
}

/**
 * The program's days from its start up to `until` (its end at most): what
 * was logged, what was missed, and what is ahead from `today` on.
 */
export function schedule(p: Program, logs: WorkoutLog[], today: string, until = endDate(p)): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  const last = until < endDate(p) ? until : endDate(p);
  const mine = logs.filter((l) => l.programId === p.id);
  const byDate = new Map<string, WorkoutLog[]>();
  for (const l of mine) (byDate.get(l.date) ?? byDate.set(l.date, []).get(l.date)!).push(l);
  // Workouts logged before the start still take their turn.
  let index = mine.filter((l) => l.date < p.start && l.status !== "rest").length;
  let owed = 0;
  let lastDone: string | null = [...mine].reverse().find((l) => l.date < p.start && l.status === "done")?.date ?? null;
  const gapOk = (d: string) => lastDone === null || gunFarki(d, lastDone) >= p.minGapDays;
  const next = () => (p.order.length ? p.order[index % p.order.length] : undefined);

  for (let d = p.start; d <= last; d = gunEkle(d, 1)) {
    const planned = p.days.includes(haftaninGunu(d));
    if (planned) owed = 1;
    const dayLogs = byDate.get(d) ?? [];
    const workout = dayLogs.find((l) => l.status !== "rest");
    const rest = dayLogs.find((l) => l.status === "rest");
    if (workout) {
      out.push({ date: d, status: workout.status, ...(workout.sessionId ? { sessionId: workout.sessionId } : {}), log: workout });
      index++;
      owed = 0;
      if (workout.status === "done") lastDone = d;
      continue;
    }
    if (rest) out.push({ date: d, status: "rest", log: rest });
    if (owed === 0 || !gapOk(d)) continue;
    if (d < today) {
      if (planned) out.push({ date: d, status: "missed", ...(next() ? { sessionId: next()! } : {}) });
      continue;
    }
    out.push({ date: d, status: "planned", ...(next() ? { sessionId: next()! } : {}) });
    index++;
    owed = 0;
    lastDone = d;
  }
  return out;
}

/** What a day holds for a program, for the Bugün card and the calendar. */
export type DayView =
  | { kind: "notStarted"; start: string }
  | { kind: "ended" }
  | { kind: "workout"; session: SessionTemplate; phase: Phase | null; week: number; exercises: Exercise[] }
  | { kind: "logged"; log: WorkoutLog }
  | { kind: "rest"; restDay?: { name: string; minutes?: number }; restLog?: WorkoutLog; nextDate?: string };

export function dayView(f: ProgramsFile, p: Program, date: string, today = date): DayView {
  if (date < p.start) return { kind: "notStarted", start: p.start };
  if (date > endDate(p)) return { kind: "ended" };
  const plan = schedule(p, logsOf(f, p.id), today);
  const here = plan.filter((e) => e.date === date);
  const workout = here.find((e) => e.status === "done" || e.status === "skipped");
  if (workout?.log) return { kind: "logged", log: workout.log };
  const due = here.find((e) => e.status === "planned");
  const session = due && findSession(p, due.sessionId);
  if (session) {
    return {
      kind: "workout",
      session,
      phase: phaseOf(p, date),
      week: weekOf(p, date),
      exercises: session.exercises.map((e) => effectiveExercise(p, e, date)),
    };
  }
  const restLog = here.find((e) => e.status === "rest")?.log;
  const nextDate = plan.find((e) => e.status === "planned" && e.date > date)?.date;
  return { kind: "rest", ...(p.restDay ? { restDay: p.restDay } : {}), ...(restLog ? { restLog } : {}), ...(nextDate ? { nextDate } : {}) };
}

export interface Progress {
  week: number;
  weeks: number;
  phase: Phase | null;
  done: number;
  total: number;
  missed: number;
  ended: boolean;
}

export function progress(f: ProgramsFile, p: Program, today: string): Progress {
  const plan = schedule(p, logsOf(f, p.id), today);
  return {
    week: Math.min(weekOf(p, today), p.weeks),
    weeks: p.weeks,
    phase: phaseOf(p, today),
    done: plan.filter((e) => e.status === "done").length,
    total: plannedCount(p),
    missed: plan.filter((e) => e.status === "missed").length,
    ended: today > endDate(p),
  };
}

/** The last time an exercise was done, in any program (a copied program keeps its exercise ids). */
export function lastExerciseLog(f: ProgramsFile, exerciseId: string, before?: string): (ExerciseLog & { date: string }) | null {
  for (let i = f.logs.length - 1; i >= 0; i--) {
    const l = f.logs[i]!;
    if (l.status !== "done" || (before && l.date >= before)) continue;
    const e = l.exercises.find((x) => x.exerciseId === exerciseId);
    if (e) return { ...e, date: l.date };
  }
  return null;
}

/**
 * What the log form starts with. The load is the plan's (the user changes
 * the plan to change it), last time's when the plan names none. Reps are
 * last time's, the lower end of the plan's "12–15" when there is no last
 * time; as many as the sets of the day, the last one repeated if the phase
 * added a set.
 */
export function prefill(f: ProgramsFile, e: Exercise, before?: string): ExerciseLog {
  const last = lastExerciseLog(f, e.id, before);
  const load = e.load ?? last?.load;
  const planned = Number((e.reps ?? "").match(/\d+/)?.[0] ?? 0);
  const base = last?.reps.length ? last.reps : [planned];
  const sets = e.sets ?? base.length;
  const reps = Array.from({ length: sets }, (_, i) => base[Math.min(i, base.length - 1)]!);
  return { exerciseId: e.id, name: e.name, ...(load ? { load } : {}), reps };
}

/* --- changes -------------------------------------------------------------------------- */

export function saveProgram(f: ProgramsFile, p: Program): ProgramsFile {
  const clean = readProgram(p);
  if (!clean) throw new Error("geçersiz program");
  const i = f.programs.findIndex((q) => q.id === clean.id);
  return { ...f, programs: i < 0 ? [...f.programs, clean] : f.programs.map((q, j) => (j === i ? clean : q)) };
}

/** Removes a program and its logs. */
export const deleteProgram = (f: ProgramsFile, id: string): ProgramsFile => ({
  ...f,
  programs: f.programs.filter((p) => p.id !== id),
  logs: f.logs.filter((l) => l.programId !== id),
});

/** A copy starting on another day, for the next cycle. Exercise ids stay, so last time's values carry over. */
export function copyProgram(f: ProgramsFile, id: string, start: string, newId = newProgramId()): ProgramsFile {
  const p = findProgram(f, id);
  if (!p || !isDate(start)) return f;
  const { archived: _archived, ...rest } = structuredClone(p);
  return saveProgram(f, { ...rest, id: newId, start });
}

/** Writes a day's log; one workout and one rest log per program and day, the newer replaces the older. */
export function saveLog(f: ProgramsFile, log: WorkoutLog): ProgramsFile {
  if (!findProgram(f, log.programId)) return f;
  const clean = readLog(log, new Set([log.programId]));
  if (!clean) throw new Error("geçersiz kayıt");
  const workout = (l: WorkoutLog) => l.status !== "rest";
  const logs = f.logs.filter(
    (l) => !(l.programId === clean.programId && l.date === clean.date && workout(l) === workout(clean)) && l.id !== clean.id,
  );
  logs.push(clean);
  logs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { ...f, logs };
}

export const deleteLog = (f: ProgramsFile, id: string): ProgramsFile => ({ ...f, logs: f.logs.filter((l) => l.id !== id) });

/**
 * A log for the session due on a date, its names and loads copied from the
 * program as it is now. `exercises` are what was done (from `prefill`, edited).
 */
export function workoutLog(p: Program, session: SessionTemplate, date: string, exercises: ExerciseLog[], note?: string, id = newLogId()): WorkoutLog {
  return {
    id,
    programId: p.id,
    date,
    status: "done",
    sessionId: session.id,
    sessionName: session.name,
    exercises,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
}
