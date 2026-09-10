import { AY_ADLARI } from "@ortak/gun";
import { paraMetni } from "@ortak/para";
import type { GunToplam } from "@ortak/harcama";
import s from "../harcama.module.css";

/**
 * Dönemin günlük gider çubukları. Harcamasız günler de çiziliyor (sıfır
 * yükseklikle): eksenden düşselerdi ay boyunca düzenli harcanmış gibi görünürdü.
 */
export function GunlukGrafik({ gunler, simge, bugun }: { gunler: GunToplam[]; simge: string; bugun: string }) {
  const enYuksek = gunler.reduce((a, g) => Math.max(a, g.gider), 0);

  if (enYuksek === 0) return <p className={`${s.soluk} ${s.butceSatir}`}>Bu dönemde gider yok.</p>;

  return (
    <div className={s.grafik}>
      {gunler.map((g) => (
        <div
          key={g.tarih}
          className={g.tarih === bugun ? `${s.sutun} ${s.sutunBugun}` : s.sutun}
          title={`${gunAdi(g.tarih)}: ${paraMetni(g.gider, simge)}`}
        >
          <span
            className={s.sutunGider}
            style={{ height: `${g.gider === 0 ? 0 : Math.max(2, Math.round((g.gider * 100) / enYuksek))}%` }}
          />
        </div>
      ))}
    </div>
  );
}

const gunAdi = (iso: string): string => `${Number(iso.slice(8, 10))} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`;
