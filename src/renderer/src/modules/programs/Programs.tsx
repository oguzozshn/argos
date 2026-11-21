import { Dumbbell, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { bugunIso } from "@ortak/plan";
import { dayView, findProgram, newProgramId, progress, saveProgram, type Program } from "@ortak/program";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { usePrograms } from "./hooks";
import { ProgramEditor } from "./ProgramEditor";
import { dayLine, daysText, nextMonday } from "./text";
import s from "./programs.module.css";

/**
 * Programlar: plans written once and laid on the days by Argos (a training
 * plan, guitar practice…). The list, or one program's editor with `?p=<id>`.
 */
export function Programs() {
  const [params, setParams] = useSearchParams();
  const { data, loading, error, change } = usePrograms();
  const today = bugunIso();
  const openId = params.get("p");

  if (loading) {
    return (
      <>
        <EkranBasi baslik="Programlar" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const open = openId ? findProgram(data, openId) : null;
  if (open) return <ProgramEditor program={open} file={data} change={change} close={() => setParams({})} />;

  const create = () => {
    const id = newProgramId();
    const p: Program = {
      id,
      name: "Yeni program",
      start: nextMonday(today),
      weeks: 8,
      days: [0, 2, 4],
      order: ["A"],
      sessions: [{ id: "A", name: "A günü", exercises: [] }],
      phases: [],
      warmup: [],
      cooldown: [],
      minGapDays: 2,
    };
    void change((d) => saveProgram(d, p)).then((ok) => ok && setParams({ p: id }));
  };

  const active = data.programs.filter((p) => !p.archived);
  const archived = data.programs.filter((p) => p.archived);

  const row = (p: Program) => {
    const pr = progress(data, p, today);
    const v = dayView(data, p, today);
    const status =
      v.kind === "notStarted" ? "başlamadı" : pr.ended ? `bitti · ${pr.done}/${pr.total}` : `${pr.week}. hafta · ${pr.done}/${pr.total}`;
    return (
      <Satir
        key={p.id}
        baslik={p.name}
        alt={`${daysText(p)} · ${p.weeks} hafta · bugün: ${dayLine(v)}`}
        sag={<Etiket tur={v.kind === "workout" ? "vurgu" : "sade"}>{status}</Etiket>}
        onClick={() => setParams({ p: p.id })}
      />
    );
  };

  return (
    <>
      <EkranBasi
        baslik="Programlar"
        altyazi="Bir kez yazılan planlar. Argos onları günlere dağıtır, sen yalnızca kaydı düşersin."
        sag={
          <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={create}>
            Yeni program
          </Dugme>
        }
      />
      <div className={s.stack}>
        {error && <Etiket tur="hata">{error}</Etiket>}
        {active.length === 0 ? (
          <Kart>
            <BosDurum
              ikon={<Dumbbell size={22} />}
              baslik="Henüz program yok"
              metin="Bir antrenman planı ya da düzenli bir çalışma yaz; Argos hangi gün ne yapacağını gösterir."
            />
          </Kart>
        ) : (
          <Kart dolgulu={false}>{active.map(row)}</Kart>
        )}
        {archived.length > 0 && (
          <Kart dolgulu={false} baslik="Arşiv">
            {archived.map(row)}
          </Kart>
        )}
      </div>
    </>
  );
}
