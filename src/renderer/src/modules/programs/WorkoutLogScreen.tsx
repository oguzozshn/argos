import { ArrowLeft, Check, ChevronLeft, ChevronRight, Minus, Plus, SkipForward, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { gunEkle, haftaninGunu } from "@ortak/gun";
import { bugunIso } from "@ortak/plan";
import {
  dayView,
  deleteLog,
  effectiveExercise,
  findSession,
  newLogId,
  phaseOf,
  prefill,
  saveLog,
  schedule,
  weekOf,
  workoutLog,
  type Exercise,
  type ExerciseLog,
  type Program,
  type ProgramsFile,
  type SessionTemplate,
  type WorkoutLog,
} from "@ortak/program";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Yuklenirken } from "@/ui/bilesenler";
import { bildir, silVeBildir } from "@/ui/toast";
import { usePrograms } from "./hooks";
import { dayLine, dayText, setsText } from "./text";
import s from "./programs.module.css";

type Change = (f: (d: ProgramsFile) => ProgramsFile) => Promise<boolean>;

/**
 * A day's log: `?p=<program>&d=<date>`, today and the program due today
 * when left out. The form starts with the plan's load and last time's reps;
 * the user only fixes what was different.
 */
export function WorkoutLogScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, loading, change } = usePrograms();
  const today = bugunIso();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("d") ?? "") ? params.get("d")! : today;

  const active = data.programs.filter((p) => !p.archived);
  const program = useMemo(() => {
    const asked = active.find((p) => p.id === params.get("p"));
    if (asked) return asked;
    const busy = (p: Program) => ["workout", "logged"].includes(dayView(data, p, date, today).kind);
    return active.find(busy) ?? active[0] ?? null;
  }, [active, data, date, today, params]);

  const go = (next: { p?: string; d?: string }) => {
    const q: Record<string, string> = {};
    const pid = next.p ?? program?.id;
    const d = next.d ?? date;
    if (pid) q.p = pid;
    if (d !== today) q.d = d;
    setParams(q);
  };

  if (loading) {
    return (
      <>
        <EkranBasi baslik="Kayıt" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }
  if (!program) {
    return (
      <>
        <EkranBasi baslik="Kayıt" />
        <Kart>
          <BosDurum
            baslik="Program yok"
            metin="Önce Programlar ekranında bir program yaz."
            eylem={<Dugme onClick={() => navigate("/programs/")}>Programlar</Dugme>}
          />
        </Kart>
      </>
    );
  }

  const view = dayView(data, program, date, today);
  const plan = schedule(program, data.logs, today);
  // A day with nothing due can still be logged: a missed day after the fact, or a workout ahead of time.
  // A missed day is offered only while nothing was logged after it: a later workout already took its turn.
  const missed = plan.find((e) => e.date === date && e.status === "missed");
  const laterWorkout = data.logs.some((l) => l.programId === program.id && l.date > date && l.status !== "rest");
  const offSession = missed
    ? laterWorkout
      ? null
      : findSession(program, missed.sessionId)
    : findSession(program, plan.find((e) => e.date >= date && e.status === "planned")?.sessionId);
  const phase = phaseOf(program, date);
  // Due on a day that is not a planned weekday: it makes up a missed one.
  const catchUp = view.kind === "workout" && !program.days.includes(haftaninGunu(date));
  const title = missed && view.kind === "rest" ? `${findSession(program, missed.sessionId)?.name ?? "Antrenman"} kaçtı` : dayLine(view);

  return (
    <>
      <div className={s.back}>
        <Dugme tur="sade" ikon={<ArrowLeft size={15} />} onClick={() => navigate(`/programs/?p=${encodeURIComponent(program.id)}`)}>
          {program.name}
        </Dugme>
      </div>
      <EkranBasi
        ustyazi={`${weekOf(program, date) > 0 ? `${Math.min(weekOf(program, date), program.weeks)}. hafta` : "başlamadı"}${phase ? ` · ${phase.name}` : ""}${phase?.note ? ` · ${phase.note}` : ""}${catchUp ? " · kaçanın telafisi" : ""}`}
        baslik={title}
        sag={
          <div className={s.actions}>
            <Dugme tur="sade" ikon={<ChevronLeft size={15} />} onClick={() => go({ d: gunEkle(date, -1) })} aria-label="Önceki gün" />
            <span className={s.dateLabel}>{date === today ? "Bugün" : dayText(date)}</span>
            <Dugme
              tur="sade"
              ikon={<ChevronRight size={15} />}
              onClick={() => go({ d: gunEkle(date, 1) })}
              aria-label="Sonraki gün"
              disabled={date >= today}
            />
          </div>
        }
      />
      <div className={s.stack}>
        {active.length > 1 && (
          <div className={s.chips}>
            {active.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === program.id ? `${s.chip} ${s.chipOn}` : s.chip}
                onClick={() => go({ p: p.id })}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {view.kind === "workout" && (
          <WorkoutForm
            key={`${program.id}|${date}|due`}
            file={data}
            change={change}
            program={program}
            session={view.session}
            exercises={view.exercises}
            date={date}
          />
        )}
        {view.kind === "logged" && (
          <WorkoutForm
            key={`${program.id}|${date}|${view.log.id}`}
            file={data}
            change={change}
            program={program}
            session={
              findSession(program, view.log.sessionId) ?? {
                id: view.log.sessionId ?? "?",
                name: view.log.sessionName ?? "Antrenman",
                exercises: [],
              }
            }
            exercises={(findSession(program, view.log.sessionId)?.exercises ?? []).map((e) => effectiveExercise(program, e, date))}
            date={date}
            existing={view.log}
          />
        )}
        {view.kind === "rest" && (
          <RestDay
            key={`${program.id}|${date}|rest`}
            file={data}
            change={change}
            program={program}
            date={date}
            restLog={view.restLog}
            nextDate={view.nextDate}
            offSession={date <= today ? offSession : null}
          />
        )}
        {(view.kind === "notStarted" || view.kind === "ended") && (
          <Kart>
            <BosDurum
              baslik={dayLine(view)}
              metin={view.kind === "ended" ? "Programı kopyalayıp yeni bir tarihte başlatabilirsin." : undefined}
            />
          </Kart>
        )}
      </div>
    </>
  );
}

function RestDay({
  file,
  change,
  program,
  date,
  restLog,
  nextDate,
  offSession,
}: {
  file: ProgramsFile;
  change: Change;
  program: Program;
  date: string;
  restLog?: WorkoutLog;
  nextDate?: string;
  offSession: SessionTemplate | null;
}) {
  const [forced, setForced] = useState(false);
  if (forced && offSession) {
    return (
      <WorkoutForm
        file={file}
        change={change}
        program={program}
        session={offSession}
        exercises={offSession.exercises.map((e) => effectiveExercise(program, e, date))}
        date={date}
      />
    );
  }
  const rd = program.restDay;
  return (
    <Kart>
      <div className={s.rest}>
        <p className={s.restText}>{nextDate ? `Sıradaki antrenman: ${dayText(nextDate)}.` : "Bugün antrenman yok."}</p>
        <div className={s.actions}>
          {rd &&
            (restLog ? (
              <Dugme tur="sade" ikon={<Check size={15} />} onClick={() => void change((d) => deleteLog(d, restLog.id))}>
                {rd.name} yapıldı · geri al
              </Dugme>
            ) : (
              <Dugme
                ikon={<Check size={15} />}
                onClick={() =>
                  void change((d) => saveLog(d, { id: newLogId(), programId: program.id, date, status: "rest", exercises: [] }))
                }
              >
                {rd.name}
                {rd.minutes ? ` ${rd.minutes} dk` : ""} yaptım
              </Dugme>
            ))}
          {offSession && (
            <Dugme tur="sade" onClick={() => setForced(true)}>
              Yine de antrenman kaydet: {offSession.name}
            </Dugme>
          )}
        </div>
      </div>
    </Kart>
  );
}

function WorkoutForm({
  file,
  change,
  program,
  session,
  exercises,
  date,
  existing,
}: {
  file: ProgramsFile;
  change: Change;
  program: Program;
  session: SessionTemplate;
  /** The session's exercises as planned for the date. */
  exercises: Exercise[];
  date: string;
  existing?: WorkoutLog;
}) {
  const plannedById = new Map(exercises.map((e) => [e.id, e]));
  const [rows, setRows] = useState<ExerciseLog[]>(() =>
    existing && existing.status === "done" ? existing.exercises : exercises.map((e) => prefill(file, e, date)),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const tick = (k: string) =>
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const setRow = (i: number, f: (r: ExerciseLog) => ExerciseLog) => setRows((rs) => rs.map((r, j) => (j === i ? f(r) : r)));

  const save = async () => {
    const log = workoutLog(program, session, date, rows, note, existing?.id ?? newLogId());
    if (await change((d) => saveLog(d, log))) bildir({ metin: `${session.name} kaydedildi.` });
  };
  const skip = async () => {
    const log: WorkoutLog = {
      id: existing?.id ?? newLogId(),
      programId: program.id,
      date,
      status: "skipped",
      sessionId: session.id,
      sessionName: session.name,
      exercises: [],
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    if (await change((d) => saveLog(d, log))) bildir({ metin: `${session.name} atlandı; sıradaki oturuma geçildi.` });
  };
  const remove = () => {
    if (!existing) return;
    silVeBildir({
      metin: "Kayıt silindi.",
      sil: () => change((d) => deleteLog(d, existing.id)),
      geriKoy: () => change((d) => saveLog(d, existing)),
    });
  };

  const checklist = (title: string, items: string[], prefix: string) =>
    items.length > 0 && (
      <Kart baslik={title} dolgulu={false}>
        {items.map((it, i) => (
          <label key={i} className={s.check}>
            <input type="checkbox" checked={ticked.has(prefix + i)} onChange={() => tick(prefix + i)} />
            <span className={ticked.has(prefix + i) ? s.checkDone : undefined}>{it}</span>
          </label>
        ))}
      </Kart>
    );

  return (
    <>
      {existing && (
        <div className={s.banner}>
          <Etiket tur={existing.status === "done" ? "iyi" : "sade"}>{existing.status === "done" ? "kaydedildi" : "atlandı"}</Etiket>
          <span className={s.muted}>Değiştirip yeniden kaydedebilirsin.</span>
        </div>
      )}
      {checklist("Isınma", program.warmup, "w")}
      <Kart baslik={session.name} not={session.minutes ? `~${session.minutes} dk` : undefined} dolgulu={false}>
        {rows.map((r, i) => {
          const pl = plannedById.get(r.exerciseId);
          const hint = [pl && setsText(pl.sets, pl.reps), pl?.setup, pl?.target].filter(Boolean).join(" · ");
          return (
            <div key={r.exerciseId} className={s.logRow}>
              <div className={s.logName}>
                <span className={s.logTitle}>{r.name}</span>
                {hint && <span className={s.muted}>{hint}</span>}
                {pl?.note && <span className={s.muted}>{pl.note}</span>}
              </div>
              <input
                className={`${s.field} ${s.loadInput}`}
                value={r.load ?? ""}
                placeholder="bant"
                aria-label={`${r.name} yük`}
                onChange={(e) => setRow(i, (x) => ({ ...x, load: e.target.value || undefined }))}
              />
              <div className={s.sets}>
                {r.reps.map((n, k) => (
                  <input
                    key={k}
                    className={`${s.field} ${s.repInput}`}
                    type="number"
                    min={0}
                    value={n}
                    aria-label={`${r.name} ${k + 1}. set`}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setRow(i, (x) => ({
                        ...x,
                        reps: x.reps.map((v, j) => (j === k ? Math.max(0, Math.round(Number(e.target.value) || 0)) : v)),
                      }))
                    }
                  />
                ))}
                <button
                  type="button"
                  className={s.tool}
                  disabled={r.reps.length <= 1}
                  onClick={() => setRow(i, (x) => ({ ...x, reps: x.reps.slice(0, -1) }))}
                  aria-label="Set çıkar"
                >
                  <Minus size={13} />
                </button>
                <button
                  type="button"
                  className={s.tool}
                  onClick={() => setRow(i, (x) => ({ ...x, reps: [...x.reps, x.reps.at(-1) ?? 0] }))}
                  aria-label="Set ekle"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className={`${s.muted} ${s.pad}`}>Bu oturumda hareket yok; programdan ekleyebilirsin.</p>}
        <div className={s.pad}>
          <textarea
            className={s.fieldArea}
            rows={2}
            value={note}
            placeholder="Not: nasıl geçti…"
            aria-label="Not"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Kart>
      {checklist("Soğuma", program.cooldown, "c")}
      <div className={s.saveBar}>
        <Dugme tur="dolu" ikon={<Check size={15} />} onClick={() => void save()}>
          {existing?.status === "done" ? "Güncelle" : "Kaydet"}
        </Dugme>
        {existing?.status !== "skipped" && (
          <Dugme tur="sade" ikon={<SkipForward size={15} />} onClick={() => void skip()}>
            Atla
          </Dugme>
        )}
        {existing && (
          <Dugme tur="sade" ikon={<Trash2 size={15} />} onClick={remove}>
            Kaydı sil
          </Dugme>
        )}
      </div>
    </>
  );
}
