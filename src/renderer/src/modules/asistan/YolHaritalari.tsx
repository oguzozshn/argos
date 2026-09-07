import { useMemo } from "react";
import { roadmapOzet } from "@ortak/ozet";
import { BosDurum, EkranBasi, Etiket, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { usePlanVerisi } from "@/veri/plan";
import s from "./asistan.module.css";

/**
 * Yol haritaları — salt okunur liste. Tahminler `@ortak/ozet`'ten geliyor,
 * yani eski uygulamayla aynı sayılar (parite testi).
 *
 * Düzenleme (aşama/adım ekleme, "şu an" işareti) Faz 5'in 5. adımında.
 */
const tarihYaz = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, a, g] = iso.split("-");
  return `${Number(g)}.${a}.${y}`;
};

export function YolHaritalari() {
  const { haftalar, kurallar, roadmapler, bugun, yukleniyor } = usePlanVerisi();
  const liste = useMemo(
    () => roadmapOzet(haftalar, kurallar, roadmapler, bugun),
    [haftalar, kurallar, roadmapler, bugun],
  );

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Yol haritaları" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  if (liste.length === 0) {
    return (
      <>
        <EkranBasi baslik="Yol haritaları" />
        <Kart>
          <BosDurum
            baslik="Yol haritası yok"
            metin="Haritalar data/roadmap/ altında durur."
          />
        </Kart>
      </>
    );
  }

  return (
    <>
      <EkranBasi
        baslik="Yol haritaları"
        altyazi="Tahminler ölçülen hızdan; ölçüm iki haftaya varmadıysa plandan."
      />

      {liste.map((r) => (
        <Kart
          key={r.slug}
          dolgulu={false}
          baslik={r.alan}
          not={`${r.adimBiten}/${r.adimToplam} adım`}
          className={s.rmKart}
        >
          <div className={s.rmGovde}>
            <p className={s.rmHedef}>{r.hedef}</p>

            <div className={s.ilerlemeYuva}>
              <div
                className={s.ilerleme}
                style={{ width: `${r.adimToplam ? (r.adimBiten / r.adimToplam) * 100 : 0}%` }}
              />
            </div>

            <div className={s.rmSatir}>
              <Etiket tur="vurgu">
                Aşama {Math.min(r.suAnAsama + 1, r.asamaSayisi)}/{r.asamaSayisi} ·{" "}
                {r.suAnAsamaAd}
              </Etiket>
              <Etiket>{r.kalanSaat} saat kaldı</Etiket>
              {r.hizKaynagi && (
                <Etiket tur={r.hizKaynagi === "olculen" ? "iyi" : "uyari"}>
                  {r.hizKaynagi === "olculen" ? "ölçülen" : "plan"} · haftada {r.haftalikDk} dk
                </Etiket>
              )}
            </div>
          </div>

          {r.siradakiAdim && (
            <Satir
              baslik={r.siradakiAdim}
              alt="sıradaki adım"
              sag={
                r.tahminiBitis ? (
                  <Etiket>
                    ~{r.tahminiHafta} hafta · {tarihYaz(r.tahminiBitis)}
                  </Etiket>
                ) : null
              }
            />
          )}
        </Kart>
      ))}
    </>
  );
}
