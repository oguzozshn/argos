import { useState } from "react";
import { aciliyet, kalanGun, kalanMetni, tarihEtiketi } from "@ortak/geri-sayim";
import type { TodoistGorev } from "@ortak/tipler";
import { Kart } from "@/ui/bilesenler";
import { useBugun } from "@/veri/kanca";
import { useOnemliler } from "./kanca";
import s from "./yapilacak.module.css";

/**
 * Bugün ekranının en üstündeki geri sayım: sınav, başvuru gibi `@önemli`
 * etiketli görevler. Her an göz önünde olsun diye ızgaranın dışında durur.
 *
 * One row per date, stacked: the countdown sits in a fixed column on the
 * left so it lines up and stays next to the name, the date goes to the
 * right. The countdown is the only coloured text: green, yellow within a
 * week, red within three days and once passed.
 */

/** Rows shown before "+N daha". */
const GORUNEN = 5;

function Doseme({ gorev, bugun }: { gorev: TodoistGorev; bugun: string }) {
  if (!gorev.tarih) {
    return (
      <div className={s.doseme} title={gorev.icerik}>
        <span className={`${s.kalan} ${s.kalanYok}`}>—</span>
        <span className={s.dosemeAd}>{gorev.icerik}</span>
        <span className={s.dosemeTarih}>tarih yok</span>
      </div>
    );
  }
  const gun = kalanGun(gorev.tarih, bugun);
  return (
    <div className={s.doseme} title={gorev.icerik}>
      <span className={`${s.kalan} ${s[`kalan_${aciliyet(gun)}`]}`}>{kalanMetni(gun)}</span>
      <span className={s.dosemeAd}>{gorev.icerik}</span>
      <span className={s.dosemeTarih}>{tarihEtiketi(gorev.tarih, bugun)}</span>
    </div>
  );
}

export function OnemliTarihler() {
  const bugun = useBugun();
  const gorevler = useOnemliler(bugun);
  const [hepsi, setHepsi] = useState(false);

  if (!gorevler || gorevler.length === 0) return null;

  const gorunen = hepsi ? gorevler : gorevler.slice(0, GORUNEN);
  const artan = gorevler.length - GORUNEN;

  return (
    <Kart
      dolgulu={false}
      baslik="Önemli tarihler"
      git={{ yol: "/yapilacak/", metin: "Yapılacaklar" }}
      bas={
        artan > 0 && (
          <button
            type="button"
            className={s.dahaDugme}
            onClick={() => setHepsi((x) => !x)}
            aria-expanded={hepsi}
          >
            {hepsi ? "daha az" : `+${artan} daha`}
          </button>
        )
      }
    >
      <div className={s.dosemeler}>
        {gorunen.map((g) => (
          <Doseme key={g.id} gorev={g} bugun={bugun} />
        ))}
      </div>
    </Kart>
  );
}
