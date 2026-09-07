import { useMemo } from "react";
import { Kart } from "@/ui/bilesenler";
import { useGuncelHafta, useHatirla } from "./kanca";
import s from "./asistan.module.css";
import { DURUM_ISARETI, bugunGunNo, bugunIso, hatirlaBugun } from "@ortak/plan";

/**
 * Bugün ekranındaki iki kart: bugünün slotları ve akılda tutulacaklar.
 *
 * İkisi de SALT OKUNUR. Bir slotu tamamlamak beş yeri birden günceller
 * (plan dosyası, süre, roadmap adımı, ilerleme, Todoist) — yarısını yapan bir
 * işaret kutusu sistemi tutarsız bırakır. İşaretleme Asistan modülüyle gelir.
 */

const BICIM: Record<string, string> = {
  planli: s.planli,
  yapildi: s.yapildi,
  kacti: s.kacti,
  tasindi: s.tasindi,
};

function BugununPlani() {
  const { hafta, yukleniyor } = useGuncelHafta();
  const gunNo = bugunGunNo();

  const bugun = useMemo(() => hafta?.gunler.find((g) => g.no === gunNo) ?? null, [hafta, gunNo]);
  const slotlar = useMemo(
    () =>
      (hafta?.slotlar ?? [])
        .filter((x) => x.gun === gunNo)
        .sort((a, b) => a.saat.localeCompare(b.saat)),
    [hafta, gunNo],
  );

  if (yukleniyor || !hafta) return null;

  // Bugün bu haftanın içinde değilse (arada boş hafta varsa) kart görünmez.
  const guncel = bugun?.isoTarih === bugunIso();
  if (!guncel) return null;

  return (
    <Kart
      dolgulu={false}
      baslik="Bugünün planı"
      not={`${hafta.baslik} · ${bugun.ad}`}
    >
      {slotlar.length === 0 ? (
        <p className={s.dipNot} style={{ borderTop: "none" }}>
          Bugüne slot konmamış.
        </p>
      ) : (
        slotlar.map((x) => (
          <div key={x.id} className={s.slot}>
            <span className={s.saat}>{x.saat}</span>
            <span className={`${s.isaret} ${BICIM[x.durum] ?? s.planli}`}>
              {DURUM_ISARETI[x.durum] ?? "☐"}
            </span>
            <span className={s.govde}>
              <span className={s.alan}>{x.alan}</span>
              <span className={s.konu}>{x.konu}</span>
            </span>
            <span className={s.sure}>{x.sureDk} dk</span>
          </div>
        ))
      )}
      <p className={s.dipNot}>İşaretleme Asistan modülüyle gelecek — burası şimdilik okur.</p>
    </Kart>
  );
}

function AklindaTut() {
  const { maddeler, gunlukAdet, yukleniyor } = useHatirla();
  const bugun = useMemo(() => hatirlaBugun(maddeler, gunlukAdet), [maddeler, gunlukAdet]);

  if (yukleniyor || bugun.length === 0) return null;

  return (
    <Kart dolgulu={false} baslik="Bugün aklında tut" not="seçim her gün kayar">
      {bugun.map((m) => (
        <div key={m.id} className={s.hatirla}>
          {m.metin}
          <span className={s.hatirlaTarih}>{m.eklendi}</span>
        </div>
      ))}
    </Kart>
  );
}

export function AsistanOzet() {
  return (
    <>
      <BugununPlani />
      <AklindaTut />
    </>
  );
}
