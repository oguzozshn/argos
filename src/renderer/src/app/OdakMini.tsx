import { Maximize2, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { OdakMiniDurum } from "@ortak/tipler";
import { cozulmusTema } from "@/ui/tema";
import { kopru } from "@/veri/kanca";
import s from "./odakMini.module.css";

/**
 * The floating Odak window: the timer, start/pause, and a way back to the
 * Odak screen. Dragged by any empty part of the card.
 */
export function OdakMini() {
  const [d, setD] = useState<OdakMiniDurum | null>(null);
  useEffect(() => {
    document.documentElement.dataset.tema = cozulmusTema();
    return kopru()?.odakMini.durumDinle(setD);
  }, []);
  const k = kopru();

  return (
    <div className={[s.kart, d?.mola && s.mola, d?.doldu && s.doldu].filter(Boolean).join(" ")}>
      <div className={s.cubuk}>
        <span style={{ width: `${Math.min(100, (d?.oran ?? 0) * 100)}%` }} />
      </div>
      <div className={s.govde}>
        <div className={s.metin}>
          <span className={s.sayac}>{d?.sayac ?? "--:--"}</span>
          <span className={s.faz} title={d?.konu || undefined}>
            {d ? (d.konu ? `${d.faz} · ${d.konu}` : d.faz) : "bağlanıyor…"}
          </span>
        </div>
        <div className={s.dugmeler}>
          <button
            type="button"
            className={s.ana}
            disabled={!d}
            aria-label={d?.calisiyor ? "Duraklat" : "Başlat"}
            title={d?.calisiyor ? "Duraklat" : "Başlat"}
            onClick={() => k?.odakMini.komut(d?.calisiyor ? "duraklat" : "baslat")}
          >
            {d?.calisiyor ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" aria-label="Odak ekranını aç" title="Odak ekranını aç" onClick={() => k?.odakMini.komut("ac")}>
            <Maximize2 size={13} />
          </button>
          <button type="button" aria-label="Mini pencereyi kapat" title="Kapat" onClick={() => void k?.odakMini.kapat()}>
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
