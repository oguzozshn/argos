import { useMemo } from "react";
import type { KartAyari } from "@ortak/bugun-duzen";
import { HOBI_SIRA_PATH, normalizeSira, orderLists, type HobiSira } from "@ortak/hobi-sira";
import type { KartSecenegi, KartTuru } from "@/modules";
import { Kart, Satir } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { useAlanlar } from "./kanca";
import s from "./hobiler.module.css";

/**
 * Bugün card for one Hobiler list (Dizi, Oyunlar…): what is going on and
 * what is next, by status group. Finished and dropped groups stay out: the
 * card is for "what am I watching / playing", the list screen has the rest.
 */

/** Groups that are over: not shown on the card. */
const BITMIS = /bitt|bırak|birak/i;
/** Entries shown per group before "+N". */
const GRUP_BASI = 8;

/** The lists, in the order chosen on the Hobiler screen. */
function useListeler() {
  const { alanlar, yukleniyor } = useAlanlar();
  const siraDosyasi = useDosya<HobiSira>(HOBI_SIRA_PATH);
  const sira = normalizeSira(siraDosyasi.veri);
  // `sira` is rebuilt every render; its content is what matters.
  const anahtar = sira.join("\n");
  const sirali = useMemo(() => orderLists(alanlar, anahtar ? anahtar.split("\n") : []), [alanlar, anahtar]);
  return { listeler: sirali, yukleniyor };
}

function useListeSecenekleri(): KartSecenegi[] {
  const { listeler } = useListeler();
  return listeler.map((a) => ({ deger: a.slug, ad: a.ad }));
}

function HobiListeKarti({ ayar }: { ayar: KartAyari }) {
  const { listeler, yukleniyor } = useListeler();
  // Not chosen yet, or the list was deleted: the first list.
  const alan = listeler.find((a) => a.slug === ayar.liste) ?? listeler[0];
  if (yukleniyor || !alan?.veri) return null;

  const veri = alan.veri;
  const gruplar = veri.durumlar
    .filter((d) => !BITMIS.test(d.ad))
    .map((d) => ({ ...d, maddeler: veri.maddeler.filter((m) => m.durum === d.ad) }))
    .filter((g) => g.maddeler.length > 0);

  return (
    <Kart dolgulu={false} baslik={alan.ad} not={`${veri.maddeler.length} kayıt`} git={{ yol: "/hobiler/", metin: "Hobiler" }}>
      {gruplar.length === 0 ? (
        <p className={s.kartBos}>Şu an devam eden ya da sırada bekleyen bir şey yok.</p>
      ) : (
        gruplar.map((g) => (
          <div key={g.ad}>
            <div className={s.kartGrup}>
              <span className={s.durumNokta} style={{ background: g.renk }} />
              {g.ad}
              <span className={s.kartGrupSayi}>{g.maddeler.length}</span>
            </div>
            {g.maddeler.slice(0, GRUP_BASI).map((m) => (
              <Satir key={m.id} baslik={m.ad} alt={m.not || undefined} />
            ))}
            {g.maddeler.length > GRUP_BASI && <p className={s.kartDaha}>+{g.maddeler.length - GRUP_BASI} daha</p>}
          </div>
        ))
      )}
    </Kart>
  );
}

export const hobiListeKarti: KartTuru = {
  id: "liste",
  ad: "Hobi listesi (Dizi, Oyunlar…)",
  Bilesen: HobiListeKarti,
  ayarlar: [{ anahtar: "liste", ad: "Liste", useSecenekler: useListeSecenekleri }],
  w: 4,
  h: 10,
};
