import { X } from "lucide-react";
import { useMemo } from "react";
import { CP_YOLU, normalizeCp, oturumIsaretle, oturumYapilmadi, planBul, type CalismaPlani, type CpDosyasi, type Oturum } from "@ortak/calisma-plani";
import { useDosya } from "@/veri/kanca";
import s from "./calismaOturumlari.module.css";

/**
 * Planlar's sessions in the calendar, where the day's other things are.
 * They stay out of the to-do lists on purpose. Ticking one here marks it
 * done in Planlar too; a part done is said in Planlar.
 */

export interface GunOturumu {
  gun: string;
  oturum: Oturum;
  plan: CalismaPlani;
  ad: string;
}

const saatMetni = (dk: number): string => {
  const sa = dk / 60;
  return `${Number.isInteger(sa) ? sa : sa.toFixed(2).replace(/0$/, "").replace(".", ",")} sa`;
};

export function useCalisma() {
  const dosya = useDosya<CpDosyasi>(CP_YOLU);
  const veri = useMemo(() => normalizeCp(dosya.veri), [dosya.veri]);
  /** Sessions of the day, in the file's order. */
  const gunun = (gun: string): GunOturumu[] =>
    (veri.takvim[gun] ?? []).flatMap((oturum) => {
      const plan = planBul(veri, oturum.planId);
      if (!plan) return [];
      const alt = oturum.altId ? plan.altlar.find((a) => a.id === oturum.altId) : null;
      return [{ gun, oturum, plan, ad: alt ? `${plan.ad} · ${alt.ad}` : plan.ad }];
    });
  const isaretle = (gun: string, id: string, yapildi: boolean) =>
    void dosya.degistir((d) => oturumIsaretle(normalizeCp(d), gun, id, yapildi));
  const yapilmadi = (gun: string, id: string, deger: boolean) =>
    void dosya.degistir((d) => oturumYapilmadi(normalizeCp(d), gun, id, deger));
  return { veri, gunun, isaretle, yapilmadi, yukleniyor: dosya.yukleniyor };
}

/**
 * One session as a row: a tick, the plan's colour, the hours and the name,
 * and ✕ to mark it not done (its hours go back to the plan).
 */
function OturumSatiri({ x, c }: { x: GunOturumu; c: ReturnType<typeof useCalisma> }) {
  const { oturum: o } = x;
  const isaretle = c.isaretle;
  return (
    <label className={[s.satir, o.yapildi && s.bitti, o.yapilmadi && s.yapilmadi].filter(Boolean).join(" ")}>
      <input type="checkbox" checked={Boolean(o.yapildi)} aria-label={`${x.ad}: yapıldı`} onChange={(e) => isaretle(x.gun, o.id, e.target.checked)} />
      <span className={s.renk} style={{ background: x.plan.renk }} />
      <span className={s.ad}>{x.ad}</span>
      <span className={s.sure}>
        {o.planlananDk ? `${saatMetni(o.dk)}/${saatMetni(o.planlananDk)}` : saatMetni(o.dk)}
        {o.yapilmadi && " · yapılmadı"}
      </span>
      <button
        type="button"
        className={o.yapilmadi ? `${s.kacti} ${s.kactiSecili}` : s.kacti}
        aria-pressed={Boolean(o.yapilmadi)}
        aria-label={`${x.ad}: yapılmadı`}
        title={o.yapilmadi ? "Yapılmadı işaretini kaldır" : "Yapılmadı olarak işaretle — saatleri plana geri döner, otomatik planlama ileriye dağıtır"}
        onClick={(e) => {
          e.preventDefault();
          c.yapilmadi(x.gun, o.id, !o.yapilmadi);
        }}
      >
        <X size={13} />
      </button>
    </label>
  );
}

/** The day's sessions, for the calendar's day panel. Nothing when there are none. */
export function GununCalismasi({ gun, suz }: { gun: string; suz?: (x: GunOturumu) => boolean }) {
  const c = useCalisma();
  const liste = suz ? c.gunun(gun).filter(suz) : c.gunun(gun);
  if (liste.length === 0) return null;
  return (
    <div className={s.liste}>
      <p className={s.baslik}>Çalışma planı</p>
      {liste.map((x) => (
        <OturumSatiri key={x.oturum.id} x={x} c={c} />
      ))}
    </div>
  );
}
