import { useMemo } from "react";
import { AY_ADLARI, gunAl } from "@ortak/gun";
import { CP_YOLU, normalizeCp, oturumIsaretle, planBul, type CalismaPlani, type CpDosyasi, type Oturum } from "@ortak/calisma-plani";
import { useDosya } from "@/veri/kanca";
import s from "./calismaOturumlari.module.css";

/**
 * Planlar's sessions where the day's other things are: the calendar and
 * the Inbox. Ticking one here marks it done in Planlar too; a part done is
 * said in Planlar.
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
  /** Undone sessions of days before `bugun`, the oldest first. */
  const kalanlar = (bugun: string): GunOturumu[] =>
    Object.keys(veri.takvim)
      .filter((g) => g < bugun)
      .sort()
      .flatMap((g) => gunun(g).filter((x) => !x.oturum.yapildi));
  const isaretle = (gun: string, id: string, yapildi: boolean) =>
    void dosya.degistir((d) => oturumIsaretle(normalizeCp(d), gun, id, yapildi));
  return { veri, gunun, kalanlar, isaretle, yukleniyor: dosya.yukleniyor };
}

/** One session as a row: a tick, the plan's colour, the hours and the name. */
function OturumSatiri({ x, gunGoster, isaretle }: { x: GunOturumu; gunGoster?: boolean; isaretle: ReturnType<typeof useCalisma>["isaretle"] }) {
  const { oturum: o } = x;
  return (
    <label className={o.yapildi ? `${s.satir} ${s.bitti}` : s.satir}>
      <input type="checkbox" checked={Boolean(o.yapildi)} aria-label={`${x.ad}: yapıldı`} onChange={(e) => isaretle(x.gun, o.id, e.target.checked)} />
      <span className={s.renk} style={{ background: x.plan.renk }} />
      <span className={s.ad}>{x.ad}</span>
      <span className={s.sure}>
        {gunGoster && `${gunAl(x.gun)} ${AY_ADLARI[Number(x.gun.slice(5, 7)) - 1]} · `}
        {o.planlananDk ? `${saatMetni(o.dk)}/${saatMetni(o.planlananDk)}` : saatMetni(o.dk)}
      </span>
    </label>
  );
}

/** The day's sessions, for the calendar's day panel. Nothing when there are none. */
export function GununCalismasi({ gun }: { gun: string }) {
  const c = useCalisma();
  const liste = c.gunun(gun);
  if (liste.length === 0) return null;
  return (
    <div className={s.liste}>
      <p className={s.baslik}>Çalışma planı</p>
      {liste.map((x) => (
        <OturumSatiri key={x.oturum.id} x={x} isaretle={c.isaretle} />
      ))}
    </div>
  );
}

/** Today's sessions and the ones left undone before it, for the Inbox. */
export function BugununCalismasi({ bugun }: { bugun: string }) {
  const c = useCalisma();
  const kalan = c.kalanlar(bugun);
  const bugunku = c.gunun(bugun);
  if (kalan.length === 0 && bugunku.length === 0) return null;
  return (
    <div className={s.liste}>
      <p className={s.baslik}>
        Çalışma planı <span>{bugunku.filter((x) => !x.oturum.yapildi).length + kalan.length}</span>
      </p>
      {kalan.map((x) => (
        <OturumSatiri key={x.oturum.id} x={x} gunGoster isaretle={c.isaretle} />
      ))}
      {bugunku.map((x) => (
        <OturumSatiri key={x.oturum.id} x={x} isaretle={c.isaretle} />
      ))}
    </div>
  );
}
