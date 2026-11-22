import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowUp, ClipboardList, Copy, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GUN_KISA, gunEkle } from "@ortak/gun";
import { bugunIso } from "@ortak/plan";
import {
  copyProgram,
  deleteProgram,
  endDate,
  findProgram,
  newItemId,
  newProgramId,
  normalizePrograms,
  plannedCount,
  saveProgram,
  type Exercise,
  type Phase,
  type Program,
  type ProgramsFile,
  type SessionTemplate,
} from "@ortak/program";
import { Dugme, EkranBasi, Kart } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { Field } from "./Field";
import { useGoals } from "./hooks";
import { dayText, nextMonday } from "./text";
import s from "./programs.module.css";

/** A positive whole number from a field, or undefined when empty or not one. */
const num = (x: string): number | undefined => {
  const n = Number(x.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};
const lines = (x: string): string[] =>
  x
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** The next free session id: A, B, C… */
const nextSessionId = (p: Program): string => {
  for (let c = 65; c < 91; c++) if (!p.sessions.some((x) => x.id === String.fromCharCode(c))) return String.fromCharCode(c);
  return newItemId();
};

/**
 * One program on one page. Every field saves on its own when left, so the
 * plan is written the way it is read: top to bottom, nothing to submit.
 */
export function ProgramEditor({
  program: p,
  file,
  change,
  close,
}: {
  program: Program;
  file: ProgramsFile;
  change: (f: (d: ProgramsFile) => ProgramsFile) => Promise<boolean>;
  close: () => void;
}) {
  const goals = useGoals();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const today = bugunIso();

  /** A change on the program's latest state in the file. */
  const update = (f: (q: Program) => Program) =>
    void change((d) => {
      const q = findProgram(d, p.id);
      return q ? saveProgram(d, f(structuredClone(q))) : d;
    });
  const updateSession = (id: string, f: (x: SessionTemplate) => SessionTemplate) =>
    update((q) => ({ ...q, sessions: q.sessions.map((x) => (x.id === id ? f(x) : x)) }));
  const updateExercise = (sid: string, eid: string, patch: Partial<Exercise>) =>
    updateSession(sid, (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === eid ? { ...e, ...patch } : e)) }));
  const updatePhase = (fid: string, patch: Partial<Phase>) =>
    update((q) => ({ ...q, phases: q.phases.map((f) => (f.id === fid ? { ...f, ...patch } : f)) }));

  const renameSession = (old: string, next: string) => {
    const id = next.trim();
    if (!id || id === old || p.sessions.some((x) => x.id === id)) return;
    update((q) => ({
      ...q,
      sessions: q.sessions.map((x) => (x.id === old ? { ...x, id } : x)),
      order: q.order.map((o) => (o === old ? id : o)),
    }));
  };

  const remove = () => {
    const logs = file.logs.filter((l) => l.programId === p.id);
    silVeBildir({
      metin: `"${p.name}" silindi${logs.length ? `, ${logs.length} kaydıyla` : ""}.`,
      sil: async () => {
        close();
        return change((d) => deleteProgram(d, p.id));
      },
      geriKoy: () => change((d) => normalizePrograms({ ...d, programs: [...d.programs, p], logs: [...d.logs, ...logs] })),
    });
  };

  const copy = () => {
    const id = newProgramId();
    const after = gunEkle(endDate(p), 1);
    void change((d) => copyProgram(d, p.id, nextMonday(after > today ? after : today), id)).then((ok) => ok && setParams({ p: id }));
  };

  const end = endDate(p);
  const unknownOrder = p.sessions.length > 0 && p.order.length === 0;

  return (
    <>
      <div className={s.back}>
        <Dugme tur="sade" ikon={<ArrowLeft size={15} />} onClick={close}>
          Programlar
        </Dugme>
      </div>
      <EkranBasi
        baslik={p.name}
        altyazi={`${dayText(p.start)} → ${dayText(end)} · ${plannedCount(p)} gün planlı`}
        sag={
          <div className={s.actions}>
            <Dugme ikon={<ClipboardList size={15} />} onClick={() => navigate(`/programs/log?p=${encodeURIComponent(p.id)}`)}>
              Bugünün kaydı
            </Dugme>
            <Dugme tur="sade" ikon={<Copy size={15} />} onClick={copy} title="Aynı programı bitişinden sonraki Pazartesi yeniden başlat">
              Kopyala
            </Dugme>
            <Dugme
              tur="sade"
              ikon={p.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              onClick={() => update((q) => ({ ...q, archived: !q.archived }))}
            >
              {p.archived ? "Arşivden çıkar" : "Arşivle"}
            </Dugme>
            <Dugme tur="sade" ikon={<Trash2 size={15} />} onClick={remove} aria-label="Programı sil" />
          </div>
        }
      />

      <div className={s.stack}>
        <Kart baslik="Genel">
          <div className={s.form}>
            <label className={s.row}>
              <span className={s.label}>Ad</span>
              <Field value={p.name} label="Programın adı" onSave={(v) => v && update((q) => ({ ...q, name: v }))} />
            </label>
            <label className={s.row}>
              <span className={s.label}>Başlangıç</span>
              <Field
                type="date"
                className={s.date}
                value={p.start}
                label="Başlangıç tarihi"
                onSave={(v) => v && update((q) => ({ ...q, start: v }))}
              />
            </label>
            <label className={s.row}>
              <span className={s.label}>Süre</span>
              <Field
                type="number"
                className={s.narrow}
                value={String(p.weeks)}
                label="Kaç hafta"
                onSave={(v) => num(v) && update((q) => ({ ...q, weeks: num(v)! }))}
              />
              <span className={s.muted}>hafta</span>
            </label>
            <div className={s.row}>
              <span className={s.label}>Günler</span>
              <div className={s.days} role="group" aria-label="Antrenman günleri">
                {GUN_KISA.map((g, i) => (
                  <button
                    key={g}
                    type="button"
                    className={p.days.includes(i) ? `${s.day} ${s.dayOn}` : s.day}
                    aria-pressed={p.days.includes(i)}
                    onClick={() =>
                      update((q) => ({ ...q, days: q.days.includes(i) ? q.days.filter((d) => d !== i) : [...q.days, i].sort() }))
                    }
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <label className={s.row}>
              <span className={s.label}>Arada</span>
              <Field
                type="number"
                className={s.narrow}
                value={String(p.minGapDays - 1)}
                label="İki antrenman arasında en az kaç gün dinlenme"
                onSave={(v) => {
                  const n = Number(v);
                  if (Number.isInteger(n) && n >= 0) update((q) => ({ ...q, minGapDays: n + 1 }));
                }}
              />
              <span className={s.muted}>gün dinlenme en az · kaçan gün sırayı kaydırır</span>
            </label>
            <label className={s.row}>
              <span className={s.label}>Sıra</span>
              <Field
                className={s.medium}
                value={p.order.join(" ")}
                label="Oturumların sırası, boşlukla: A B"
                placeholder="A B"
                onSave={(v) => {
                  const ids = v.split(/[\s,]+/).filter((x) => p.sessions.some((y) => y.id === x));
                  if (ids.length) update((q) => ({ ...q, order: ids }));
                }}
              />
              <span className={s.muted}>{unknownOrder ? "oturum adlarını yaz" : "sırayla döner"}</span>
            </label>
            <label className={s.row}>
              <span className={s.label}>Hedef</span>
              <select
                className={s.select}
                value={p.goalId ?? ""}
                aria-label="Bağlı hedef"
                onChange={(e) => update((q) => ({ ...q, goalId: e.target.value || undefined }))}
              >
                <option value="">Bağlı değil</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.ad}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Kart>

        {p.sessions.map((x, si) => (
          <SessionCard
            key={x.id}
            session={x}
            first={si === 0}
            last={si === p.sessions.length - 1}
            onRename={(id) => renameSession(x.id, id)}
            onChange={(f) => updateSession(x.id, f)}
            onExercise={(eid, patch) => updateExercise(x.id, eid, patch)}
            onMove={(by) =>
              update((q) => ({
                ...q,
                sessions: move(
                  q.sessions,
                  q.sessions.findIndex((y) => y.id === x.id),
                  by,
                ),
              }))
            }
            onRemove={() =>
              silVeBildir({
                metin: `"${x.name}" oturumu silindi.`,
                sil: () =>
                  change((d) => {
                    const q = findProgram(d, p.id);
                    return q
                      ? saveProgram(d, {
                          ...q,
                          sessions: q.sessions.filter((y) => y.id !== x.id),
                          order: q.order.filter((o) => o !== x.id),
                        })
                      : d;
                  }),
                geriKoy: () =>
                  change((d) => {
                    const q = findProgram(d, p.id);
                    if (!q || q.sessions.some((y) => y.id === x.id)) return d;
                    const sessions = [...q.sessions];
                    sessions.splice(Math.min(si, sessions.length), 0, x);
                    return saveProgram(d, { ...q, sessions, order: p.order });
                  }),
              })
            }
          />
        ))}
        <div className={s.addRow}>
          <Dugme
            tur="sade"
            ikon={<Plus size={15} />}
            onClick={() =>
              update((q) => {
                const id = nextSessionId(q);
                return { ...q, sessions: [...q.sessions, { id, name: `${id} günü`, exercises: [] }], order: [...q.order, id] };
              })
            }
          >
            Oturum ekle
          </Dugme>
        </div>

        <Kart baslik="Evreler" not="Haftalara göre set ve tekrar; yazılan, hareketin kendi değerinin yerine geçer" dolgulu={false}>
          <div className={`${s.table} ${s.phaseTable}`}>
            <span className={s.th}>Haftalar</span>
            <span className={s.th}>Ad</span>
            <span className={s.th}>Set</span>
            <span className={s.th}>Tekrar</span>
            <span className={s.th}>Not</span>
            <span />
            {p.phases.map((f) => (
              <PhaseRow
                key={f.id}
                phase={f}
                onChange={(patch) => updatePhase(f.id, patch)}
                onRemove={() => update((q) => ({ ...q, phases: q.phases.filter((y) => y.id !== f.id) }))}
              />
            ))}
          </div>
          <div className={s.tableFoot}>
            <Dugme
              tur="sade"
              ikon={<Plus size={15} />}
              onClick={() =>
                update((q) => {
                  const from = Math.min(q.weeks, (q.phases.at(-1)?.toWeek ?? 0) + 1);
                  return {
                    ...q,
                    phases: [...q.phases, { id: newItemId(), fromWeek: from, toWeek: Math.min(q.weeks, from + 1), name: "Evre" }],
                  };
                })
              }
            >
              Evre ekle
            </Dugme>
          </div>
        </Kart>

        <div className={s.twoCols}>
          <Kart baslik="Isınma" not="her satır bir madde">
            <Field
              multiline
              value={p.warmup.join("\n")}
              label="Isınma maddeleri"
              placeholder="Yerinde yürüyüş — 1 dk"
              onSave={(v) => update((q) => ({ ...q, warmup: lines(v) }))}
            />
          </Kart>
          <Kart baslik="Soğuma" not="her satır bir madde">
            <Field
              multiline
              value={p.cooldown.join("\n")}
              label="Soğuma maddeleri"
              placeholder="Göğüs esnemesi — 30 sn"
              onSave={(v) => update((q) => ({ ...q, cooldown: lines(v) }))}
            />
          </Kart>
        </div>

        <Kart baslik="Ara günler" not="isteğe bağlı; ilerlemeye sayılmaz">
          <div className={s.row}>
            <Field
              className={s.medium}
              value={p.restDay?.name ?? ""}
              label="Ara günlerde yapılacak şey"
              placeholder="Yürüyüş"
              onSave={(v) =>
                update((q) => ({
                  ...q,
                  restDay: v ? { name: v, ...(q.restDay?.minutes ? { minutes: q.restDay.minutes } : {}) } : undefined,
                }))
              }
            />
            <Field
              type="number"
              className={s.narrow}
              value={p.restDay?.minutes ? String(p.restDay.minutes) : ""}
              label="Dakika"
              placeholder="dk"
              onSave={(v) =>
                p.restDay &&
                update((q) => ({ ...q, restDay: { name: q.restDay?.name ?? p.restDay!.name, ...(num(v) ? { minutes: num(v) } : {}) } }))
              }
            />
            <span className={s.muted}>dk</span>
          </div>
        </Kart>
      </div>
    </>
  );
}

function SessionCard({
  session: x,
  first,
  last,
  onRename,
  onChange,
  onExercise,
  onMove,
  onRemove,
}: {
  session: SessionTemplate;
  first: boolean;
  last: boolean;
  onRename: (id: string) => void;
  onChange: (f: (x: SessionTemplate) => SessionTemplate) => void;
  onExercise: (id: string, patch: Partial<Exercise>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    onChange((y) => ({ ...y, exercises: [...y.exercises, { id: newItemId(), name }] }));
    setDraft("");
  };
  const moveExercise = (i: number, by: number) => onChange((y) => ({ ...y, exercises: move(y.exercises, i, by) }));
  const removeExercise = (id: string) => onChange((y) => ({ ...y, exercises: y.exercises.filter((e) => e.id !== id) }));

  return (
    <Kart
      dolgulu={false}
      bas={
        <div className={s.sessionHead}>
          <Field className={s.sessionId} value={x.id} label="Oturumun kısa adı (A, B…)" onSave={onRename} />
          <Field className={s.sessionName} value={x.name} label="Oturumun adı" onSave={(v) => v && onChange((y) => ({ ...y, name: v }))} />
          <Field
            type="number"
            className={s.narrow}
            value={x.minutes ? String(x.minutes) : ""}
            placeholder="dk"
            label="Süre (dakika)"
            onSave={(v) => onChange((y) => ({ ...y, minutes: num(v) }))}
          />
          <span className={s.muted}>dk</span>
          <span className={s.grow} />
          <Dugme tur="sade" ikon={<ArrowUp size={14} />} disabled={first} onClick={() => onMove(-1)} aria-label="Oturumu yukarı taşı" />
          <Dugme tur="sade" ikon={<ArrowDown size={14} />} disabled={last} onClick={() => onMove(1)} aria-label="Oturumu aşağı taşı" />
          <Dugme tur="sade" ikon={<Trash2 size={14} />} onClick={onRemove} aria-label="Oturumu sil" />
        </div>
      }
    >
      <div className={`${s.table} ${s.exerciseTable}`}>
        <span className={s.th}>Hareket</span>
        <span className={s.th}>Yük / bant</span>
        <span className={s.th}>Kurulum</span>
        <span className={s.th}>Set</span>
        <span className={s.th}>Tekrar</span>
        <span className={s.th}>Hedef</span>
        <span className={s.th}>Not</span>
        <span />
        {x.exercises.map((e, i) => (
          <ExerciseRow
            key={e.id}
            exercise={e}
            first={i === 0}
            last={i === x.exercises.length - 1}
            onChange={(patch) => onExercise(e.id, patch)}
            onMove={(by) => moveExercise(i, by)}
            onRemove={() => removeExercise(e.id)}
          />
        ))}
      </div>
      <div className={s.tableFoot}>
        <input
          className={s.field}
          value={draft}
          placeholder="+ Hareket ekle (Enter)"
          aria-label="Yeni hareketin adı"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </div>
    </Kart>
  );
}

function ExerciseRow({
  exercise: e,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  exercise: Exercise;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<Exercise>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const text = (k: "load" | "setup" | "reps" | "target" | "note") => (v: string) => onChange({ [k]: v || undefined });
  return (
    <>
      <Field value={e.name} label="Hareket" onSave={(v) => v && onChange({ name: v })} />
      <Field value={e.load ?? ""} label="Yük ya da bant" placeholder="orta" onSave={text("load")} />
      <Field value={e.setup ?? ""} label="Kurulum" placeholder="göğüs hizası" onSave={text("setup")} />
      <Field type="number" value={e.sets ? String(e.sets) : ""} label="Set" placeholder="3" onSave={(v) => onChange({ sets: num(v) })} />
      <Field value={e.reps ?? ""} label="Tekrar" placeholder="12–15" onSave={text("reps")} />
      <Field value={e.target ?? ""} label="Hedef kas" placeholder="sırt" onSave={text("target")} />
      <Field value={e.note ?? ""} label="Not" onSave={text("note")} />
      <span className={s.rowTools}>
        <button type="button" className={s.tool} disabled={first} onClick={() => onMove(-1)} aria-label="Yukarı taşı">
          <ArrowUp size={13} />
        </button>
        <button type="button" className={s.tool} disabled={last} onClick={() => onMove(1)} aria-label="Aşağı taşı">
          <ArrowDown size={13} />
        </button>
        <button type="button" className={s.tool} onClick={onRemove} aria-label="Hareketi sil">
          <X size={13} />
        </button>
      </span>
    </>
  );
}

function PhaseRow({ phase: f, onChange, onRemove }: { phase: Phase; onChange: (patch: Partial<Phase>) => void; onRemove: () => void }) {
  return (
    <>
      <span className={s.weeks}>
        <Field
          type="number"
          className={s.tiny}
          value={String(f.fromWeek)}
          label="İlk hafta"
          onSave={(v) => num(v) && onChange({ fromWeek: num(v)!, toWeek: Math.max(num(v)!, f.toWeek) })}
        />
        <span className={s.muted}>–</span>
        <Field
          type="number"
          className={s.tiny}
          value={String(f.toWeek)}
          label="Son hafta"
          onSave={(v) => num(v) && num(v)! >= f.fromWeek && onChange({ toWeek: num(v)! })}
        />
      </span>
      <Field value={f.name} label="Evrenin adı" onSave={(v) => v && onChange({ name: v })} />
      <Field type="number" value={f.sets ? String(f.sets) : ""} label="Set" placeholder="—" onSave={(v) => onChange({ sets: num(v) })} />
      <Field value={f.reps ?? ""} label="Tekrar" placeholder="—" onSave={(v) => onChange({ reps: v || undefined })} />
      <Field value={f.note ?? ""} label="Not" onSave={(v) => onChange({ note: v || undefined })} />
      <span className={s.rowTools}>
        <button type="button" className={s.tool} onClick={onRemove} aria-label="Evreyi sil">
          <X size={13} />
        </button>
      </span>
    </>
  );
}
