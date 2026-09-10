import { paraMetni } from "@ortak/para";
import type { KategoriToplam } from "@ortak/harcama";
import s from "../harcama.module.css";

/** Kategori payları. Yüzde değil tutar yazılıyor; pay çubuğun kendisinde. */
export function KategoriDagilimi({
  satirlar,
  simge,
  bosMetin,
}: {
  satirlar: KategoriToplam[];
  simge: string;
  bosMetin: string;
}) {
  const toplam = satirlar.reduce((a, k) => a + k.kurus, 0);

  if (toplam === 0) return <p className={`${s.soluk} ${s.butceSatir}`}>{bosMetin}</p>;

  return (
    <div className={s.dagilim}>
      {satirlar.map((k) => (
        <div key={`${k.kategoriId}-${k.tur}`} className={s.dagilimSatir}>
          <span className={s.rozet}>
            <span className={s.nokta} style={{ background: k.renk }} />
            {k.simge ? `${k.simge} ${k.ad}` : k.ad}
          </span>
          <span className={`${s.tutar} ${s.orta}`}>{paraMetni(k.kurus, simge)}</span>
          <span className={s.dagilimCubuk}>
            <span
              className={s.dagilimDolgu}
              style={{ width: `${Math.max(1, Math.round((k.kurus * 100) / toplam))}%`, background: k.renk }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
