import { useNavigate } from "react-router-dom";
import { gunFarki } from "@ortak/gun";
import { bugunIso } from "@ortak/plan";
import { dayView, progress, type DayView, type Program } from "@ortak/program";
import { Etiket, Kart, Satir } from "@/ui/bilesenler";
import { usePrograms } from "./hooks";
import { dayLine, dayText, setsText } from "./text";

/**
 * Bugün's card: what each program holds today. A workout opens its log; a
 * rest day says when the next one is. Programs more than a week from their
 * start, or ended over a week ago, stay off the card.
 */
export function TodayCard() {
  const { data, loading } = usePrograms();
  const navigate = useNavigate();
  const today = bugunIso();
  if (loading) return null;

  const rows = data.programs
    .filter((p) => !p.archived)
    .map((p) => ({ p, v: dayView(data, p, today) }))
    .filter(({ p, v }) => {
      if (v.kind === "notStarted") return gunFarki(p.start, today) <= 7;
      if (v.kind === "ended") return gunFarki(today, p.start) < p.weeks * 7 + 7;
      return true;
    });
  if (rows.length === 0) return null;

  const open = (p: Program) => navigate(`/programs/log?p=${encodeURIComponent(p.id)}`);
  const detail = (p: Program, v: DayView): string | undefined => {
    const pr = progress(data, p, today);
    switch (v.kind) {
      case "workout": {
        const sets = v.phase?.sets || v.phase?.reps ? setsText(v.phase.sets, v.phase.reps) : "";
        return [`${v.week}. hafta`, v.phase?.name, sets, `${v.exercises.length} hareket`].filter(Boolean).join(" · ");
      }
      case "logged":
        return `${p.name} · ${pr.done}/${pr.total}`;
      case "rest":
        return [p.name, v.nextDate && `sıradaki ${dayText(v.nextDate)}`, v.restLog && `${v.restDay?.name ?? "ara gün"} yapıldı`]
          .filter(Boolean)
          .join(" · ");
      case "ended":
        return `${p.name} · ${pr.done}/${pr.total} antrenman`;
      default:
        return p.name;
    }
  };

  return (
    <Kart dolgulu={false} baslik="Programlar" git={{ yol: "/programs/", metin: "Tümü" }}>
      {rows.map(({ p, v }) => (
        <Satir
          key={p.id}
          baslik={v.kind === "workout" ? `${p.name}: ${dayLine(v)}` : dayLine(v)}
          alt={detail(p, v)}
          sag={
            v.kind === "workout" ? (
              <Etiket tur="vurgu">bugün</Etiket>
            ) : v.kind === "logged" ? (
              <Etiket tur={v.log.status === "done" ? "iyi" : "sade"}>{v.log.status === "done" ? "✓" : "atlandı"}</Etiket>
            ) : undefined
          }
          onClick={() => (v.kind === "ended" || v.kind === "notStarted" ? navigate(`/programs/?p=${encodeURIComponent(p.id)}`) : open(p))}
        />
      ))}
    </Kart>
  );
}
