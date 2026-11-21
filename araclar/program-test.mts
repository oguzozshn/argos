/**
 * Programs: the order of sessions, missed days, phases, logs.
 * `node araclar/program-test.mts`
 */

import {
  EMPTY_PROGRAMS,
  copyProgram,
  dayView,
  deleteProgram,
  endDate,
  normalizePrograms,
  plannedCount,
  prefill,
  progress,
  saveLog,
  saveProgram,
  schedule,
  workoutLog,
  type Program,
  type ProgramsFile,
  type WorkoutLog,
} from "../src/ortak/program.ts";

let passed = 0;
let failed = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
  }
}

// The band plan: Mon/Wed/Fri from Monday 23 Nov 2026, A/B, 8 weeks.
const band: Program = {
  id: "band",
  name: "Direnç bandı",
  goalId: "h-guc",
  start: "2026-11-23",
  weeks: 8,
  days: [0, 2, 4],
  order: ["A", "B"],
  sessions: [
    {
      id: "A",
      name: "A günü",
      minutes: 40,
      exercises: [
        { id: "squat", name: "Squat", load: "yumuşak", sets: 3, reps: "12–15", target: "Bacak, kalça" },
        { id: "row", name: "Row", load: "orta", setup: "Göğüs hizası", sets: 3, reps: "12" },
        { id: "pallof", name: "Pallof press", load: "orta", sets: 3, reps: "10 her taraf" },
      ],
    },
    { id: "B", name: "B günü", minutes: 40, exercises: [{ id: "rdl", name: "Romanian deadlift", load: "orta", sets: 3, reps: "12" }] },
  ],
  phases: [
    { id: "f1", fromWeek: 1, toWeek: 2, name: "Form öğrenme", sets: 2, reps: "12–15" },
    { id: "f2", fromWeek: 3, toWeek: 4, name: "Hacim", sets: 3 },
  ],
  warmup: ["Yerinde yürüyüş — 1 dk"],
  cooldown: ["Göğüs esnemesi"],
  restDay: { name: "Yürüyüş", minutes: 25 },
  minGapDays: 2,
};

const withProgram = (): ProgramsFile => saveProgram(EMPTY_PROGRAMS, band);
let n = 0;
const done = (date: string, sessionId: string, reps: Record<string, number[]> = {}): WorkoutLog => {
  const s = band.sessions.find((x) => x.id === sessionId)!;
  return workoutLog(
    band,
    s,
    date,
    s.exercises.map((e) => ({ exerciseId: e.id, name: e.name, load: e.load, reps: reps[e.id] ?? [12, 12] })),
    undefined,
    `l${n++}`,
  );
};
const brief = (f: ProgramsFile, today: string, until?: string) =>
  schedule(f.programs[0]!, f.logs, today, until).map((e) => `${e.date.slice(5)} ${e.status}${e.sessionId ? " " + e.sessionId : ""}`);

console.log("calendar");
{
  const f = withProgram();
  eq("8 weeks end on a Sunday", endDate(band), "2027-01-17");
  eq("24 planned days", plannedCount(band), 24);
  eq("first week ahead", brief(f, "2026-11-23", "2026-11-29"), ["11-23 planned A", "11-25 planned B", "11-27 planned A"]);

  const v = dayView(f, f.programs[0]!, "2026-11-23");
  eq("today: workout A", v.kind === "workout" ? [v.session.id, v.week, v.phase?.name] : v.kind, ["A", 1, "Form öğrenme"]);
  eq("phase 1 sets/reps win", v.kind === "workout" ? v.exercises.map((e) => `${e.sets}×${e.reps}`) : [], ["2×12–15", "2×12–15", "2×12–15"]);
  eq("before the start", dayView(f, band, "2026-11-21").kind, "notStarted");
  eq("after the end", dayView(f, band, "2027-01-18").kind, "ended");

  const tue = dayView(f, band, "2026-11-24", "2026-11-23");
  eq("seen on Monday, Tuesday is rest, next Wednesday", tue.kind === "rest" ? [tue.restDay?.name, tue.nextDate] : tue.kind, ["Yürüyüş", "2026-11-25"]);

  const caught = dayView(f, band, "2026-11-24");
  eq("on Tuesday itself, Monday missed: catch up A", caught.kind === "workout" ? caught.session.id : caught.kind, "A");

  const wk3 = dayView(f, band, "2026-12-07");
  eq("week 3: Hacim, 3 sets, the exercise's own reps", wk3.kind === "workout" ? [wk3.phase?.name, wk3.exercises.map((e) => `${e.sets}×${e.reps}`)] : wk3.kind, [
    "Hacim",
    ["3×12–15", "3×12", "3×10 her taraf"],
  ]);
  const wk5 = dayView(f, band, "2026-12-21");
  eq("week 5, no phase: the exercise's own", wk5.kind === "workout" ? [wk5.phase, wk5.exercises[0]!.sets] : wk5.kind, [null, 3]);
}

console.log("missed days slide the order");
{
  let f = withProgram();
  f = saveLog(f, done("2026-11-23", "A"));
  // Wednesday missed; today is Thursday.
  eq("Wed missed, Thu B, Fri too close, Sat A, Mon B", brief(f, "2026-11-26", "2026-11-30"), [
    "11-23 done A",
    "11-25 missed B",
    "11-26 planned B",
    "11-28 planned A",
    "11-30 planned B",
  ]);
  const thu = dayView(f, band, "2026-11-26");
  eq("Thursday card: B", thu.kind === "workout" ? thu.session.id : thu.kind, "B");
  eq("Friday: rest, next Saturday", (() => {
    const v = dayView(f, band, "2026-11-27", "2026-11-26");
    return v.kind === "rest" ? v.nextDate : v.kind;
  })(), "2026-11-28");

  f = saveLog(f, done("2026-11-26", "B"));
  eq("B done Thursday", brief(f, "2026-11-27", "2026-11-30"), ["11-23 done A", "11-25 missed B", "11-26 done B", "11-28 planned A", "11-30 planned B"]);
  const p = progress(f, band, "2026-11-27");
  eq("progress", [p.week, p.done, p.total, p.missed, p.phase?.name], [1, 2, 24, 1, "Form öğrenme"]);
}

console.log("a whole week missed does not pile up");
{
  const f = withProgram();
  const list = brief(f, "2026-12-07", "2026-12-09");
  eq("6 missed, then A on Monday, B on Wednesday", [list.filter((x) => x.includes("missed")).length, list.slice(-2)], [6, ["12-07 planned A", "12-09 planned B"]]);
}

console.log("skipping and catching up");
{
  let f = withProgram();
  f = saveLog(f, { ...done("2026-11-23", "A"), status: "skipped", exercises: [] });
  eq("skipped A: B on the next planned day", brief(f, "2026-11-24", "2026-11-27"), ["11-23 skipped A", "11-25 planned B", "11-27 planned A"]);
  eq("skip is not progress", progress(f, band, "2026-11-24").done, 0);

  let g = withProgram();
  g = saveLog(g, done("2026-11-24", "A")); // Tuesday instead of Monday
  eq("done a day late: Wed too close, Thu B", brief(g, "2026-11-25", "2026-11-29"), ["11-23 missed A", "11-24 done A", "11-26 planned B", "11-28 planned A"]);
}

console.log("logs");
{
  let f = withProgram();
  f = saveLog(f, done("2026-11-23", "A", { squat: [12, 13] }));
  f = saveLog(f, done("2026-11-23", "A", { squat: [14, 15] }));
  eq("same day replaces", f.logs.map((l) => l.exercises[0]!.reps), [[14, 15]]);
  f = saveLog(f, { id: "r1", programId: "band", date: "2026-11-24", status: "rest", exercises: [] });
  eq("rest log beside workouts", brief(f, "2026-11-25", "2026-11-25"), ["11-23 done A", "11-24 rest", "11-25 planned B"]);
  eq("logged day", dayView(f, band, "2026-11-23").kind, "logged");

  const squat = band.sessions[0]!.exercises[0]!;
  eq("prefill: plan's load, last reps, padded to 3 sets", prefill(f, { ...squat, sets: 3 }), { exerciseId: "squat", name: "Squat", load: "yumuşak", reps: [14, 15, 15] });
  eq("prefill: fewer sets cut", prefill(f, { ...squat, sets: 1 }).reps, [14]);
  eq("prefill without history: plan's lower end", prefill(f, band.sessions[1]!.exercises[0]!), { exerciseId: "rdl", name: "Romanian deadlift", load: "orta", reps: [12, 12, 12] });
  eq("prefill before a date skips later logs", prefill(f, squat, "2026-11-23").reps, [12, 12, 12]);

  // Editing the program changes what is ahead, not the past.
  const edited: Program = structuredClone(band);
  edited.sessions[0]!.exercises[0] = { ...squat, name: "Goblet squat", load: "orta" };
  f = saveProgram(f, edited);
  eq("past log keeps its names", [f.logs[0]!.exercises[0]!.name, f.logs[0]!.exercises[0]!.load, f.logs[0]!.sessionName], ["Squat", "yumuşak", "A günü"]);
  eq("prefill follows the new plan's load", prefill(f, f.programs[0]!.sessions[0]!.exercises[0]!).load, "orta");

  const c = copyProgram(f, "band", "2027-01-18", "band2");
  eq("copy: new start, same exercise ids", [c.programs[1]!.start, c.programs[1]!.sessions[0]!.exercises[0]!.id], ["2027-01-18", "squat"]);
  eq("copy carries last time over", prefill(c, c.programs[1]!.sessions[0]!.exercises[0]!).reps, [14, 15, 15]);
  eq("delete takes its logs", deleteProgram(c, "band").logs.length, 0);
}

console.log("reading the file");
{
  const f = normalizePrograms({
    programs: [
      band,
      { id: "bad" },
      { ...band, id: "p2", order: ["X", "B"], days: [9, 2, 2], minGapDays: 0, sessions: [...band.sessions, { id: "A", name: "dup", exercises: [] }] },
    ],
    logs: [
      { id: "a", programId: "band", date: "2026-11-25", status: "done", exercises: [{ exerciseId: "row", name: "Row", reps: [12, "x", -1, 10] }] },
      { id: "b", programId: "nope", date: "2026-11-23", status: "done", exercises: [] },
      { id: "c", programId: "band", date: "2026-11-23", status: "weird", exercises: [] },
      { id: "d", programId: "band", date: "2026-11-23", status: "done", exercises: [] },
    ],
  });
  eq("bad program dropped", f.programs.map((p) => p.id), ["band", "p2"]);
  const p2 = f.programs[1]!;
  eq("unknown order id dropped, days cleaned, gap defaults, duplicate session dropped", [p2.order, p2.days, p2.minGapDays, p2.sessions.length], [["B"], [2], 2, 2]);
  eq("logs: unknown program and status dropped, sorted, reps cleaned", f.logs.map((l) => [l.id, l.exercises[0]?.reps ?? null]), [["d", null], ["a", [12, 10]]]);
  eq("empty file", normalizePrograms(null), EMPTY_PROGRAMS);
  eq("round trip", normalizePrograms(JSON.parse(JSON.stringify(f))), f);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
