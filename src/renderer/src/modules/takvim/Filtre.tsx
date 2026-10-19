import { Filter } from "lucide-react";
import { createContext, useState } from "react";
import { tumEtiketler, type CpDosyasi } from "@ortak/calisma-plani";
import type { GunOturumu } from "@/ui/CalismaOturumlari";
import { Popover } from "@/ui/Popover";
import s from "./takvim.module.css";

/**
 * What the calendar shows: Planlar sessions and tasks can be hidden as a
 * whole, and sessions narrowed to some plans or tags. Within tags (and
 * within plans) any one is enough; tags and plans narrow each other.
 * Kept per computer, like the view.
 */
export interface TakvimFiltresi {
  planlarGizli?: boolean;
  gorevlerGizli?: boolean;
  etiketler: string[];
  planIdler: string[];
}

const BOS: TakvimFiltresi = { etiketler: [], planIdler: [] };
const ANAHTAR = "argos.takvim.filtre";

function oku(): TakvimFiltresi {
  try {
    const h = JSON.parse(localStorage.getItem(ANAHTAR) ?? "null") as Partial<TakvimFiltresi> | null;
    if (!h || typeof h !== "object") return BOS;
    const dizi = (x: unknown) => (Array.isArray(x) ? x.filter((e): e is string => typeof e === "string") : []);
    return {
      ...(h.planlarGizli ? { planlarGizli: true } : {}),
      ...(h.gorevlerGizli ? { gorevlerGizli: true } : {}),
      etiketler: dizi(h.etiketler),
      planIdler: dizi(h.planIdler),
    };
  } catch {
    return BOS;
  }
}

export function useTakvimFiltresi(): [TakvimFiltresi, (f: TakvimFiltresi) => void] {
  const [f, setF] = useState(oku);
  const yaz = (y: TakvimFiltresi) => {
    setF(y);
    try {
      localStorage.setItem(ANAHTAR, JSON.stringify(y));
    } catch {
      /* not kept: the filter still applies until the app closes */
    }
  };
  return [f, yaz];
}

/** How many choices narrow what is shown; 0 when nothing does. */
export const filtreSayisi = (f: TakvimFiltresi): number =>
  (f.planlarGizli ? 1 : 0) + (f.gorevlerGizli ? 1 : 0) + f.etiketler.length + f.planIdler.length;

export function oturumGorunur(f: TakvimFiltresi, x: GunOturumu): boolean {
  if (f.planlarGizli) return false;
  if (f.planIdler.length && !f.planIdler.includes(x.plan.id)) return false;
  if (f.etiketler.length && !(x.plan.etiketler ?? []).some((e) => f.etiketler.includes(e))) return false;
  return true;
}

/** The filter for the day panels, set by the calendar. */
export const FiltreBaglam = createContext<TakvimFiltresi>(BOS);

const ac = (l: string[], x: string, var_: boolean) => (var_ ? [...l, x] : l.filter((y) => y !== x));

export function FiltreDugmesi({ f, onDegis, veri }: { f: TakvimFiltresi; onDegis: (f: TakvimFiltresi) => void; veri: CpDosyasi }) {
  const [yer, setYer] = useState<{ x: number; y: number } | null>(null);
  const n = filtreSayisi(f);
  const etiketler = tumEtiketler(veri);
  return (
    <>
      <button
        type="button"
        className={n ? `${s.gorunumDugme} ${s.gorunumSecili}` : s.gorunumDugme}
        aria-expanded={yer !== null}
        title="Takvimde ne görünsün"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setYer(yer ? null : { x: r.left, y: r.bottom + 6 });
        }}
      >
        <Filter size={12} /> filtre{n ? ` · ${n}` : ""}
      </button>
      {yer && (
        <Popover x={yer.x} y={yer.y} onClose={() => setYer(null)} label="Takvim filtresi" className={s.filtre}>
          <p className={s.filtreBaslik}>Göster</p>
          <label className={s.filtreSatir}>
            <input type="checkbox" checked={!f.planlarGizli} onChange={(e) => onDegis({ ...f, planlarGizli: !e.target.checked || undefined })} />
            Planlar
          </label>
          <label className={s.filtreSatir}>
            <input type="checkbox" checked={!f.gorevlerGizli} onChange={(e) => onDegis({ ...f, gorevlerGizli: !e.target.checked || undefined })} />
            Görevler
          </label>

          <p className={s.filtreBaslik}>Etiketler</p>
          {etiketler.length === 0 && <p className={s.filtreBos}>Henüz etiket yok; Planlar'da bir plana etiket ver.</p>}
          <div className={s.filtreCipler}>
            {etiketler.map((e) => {
              const var_ = f.etiketler.includes(e);
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={var_}
                  className={var_ ? `${s.filtreCip} ${s.filtreCipSecili}` : s.filtreCip}
                  onClick={() => onDegis({ ...f, etiketler: ac(f.etiketler, e, !var_) })}
                >
                  #{e}
                </button>
              );
            })}
          </div>

          {veri.planlar.length > 0 && <p className={s.filtreBaslik}>Planlar</p>}
          {veri.planlar.map((p) => (
            <label key={p.id} className={s.filtreSatir}>
              <input type="checkbox" checked={f.planIdler.includes(p.id)} onChange={(e) => onDegis({ ...f, planIdler: ac(f.planIdler, p.id, e.target.checked) })} />
              <span className={s.filtreRenk} style={{ background: p.renk }} />
              <span className={s.filtreAd}>{p.ad}</span>
            </label>
          ))}
          {veri.planlar.length > 0 && <p className={s.filtreBos}>Plan seçmezsen hepsi görünür.</p>}

          {n > 0 && (
            <button type="button" className={s.filtreTemizle} onClick={() => onDegis({ etiketler: [], planIdler: [] })}>
              Filtreyi temizle
            </button>
          )}
        </Popover>
      )}
    </>
  );
}
