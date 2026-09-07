import { Link } from "react-router-dom";
import { Etiket, Kart, Satir } from "@/ui/bilesenler";
import { useAlanlar } from "./kanca";

/**
 * Bugün ekranındaki kart: şu an devam edenler. Her alanın ilk durumu
 * "devam eden"dir (oynuyorum · izliyorum · okuyorum) — şablonlar böyle kurulu.
 *
 * Bilerek yok: kaç tanesi bitmemiş, ne kadarı kaldı. Envanter, plan değil.
 */
export function HobilerOzet() {
  const { alanlar, yukleniyor } = useAlanlar();

  const devam = alanlar.flatMap((a) => {
    const ilk = a.veri?.durumlar[0]?.ad;
    if (!ilk) return [];
    return (a.veri?.maddeler ?? [])
      .filter((m) => m.durum === ilk)
      .map((m) => ({ ...m, alanAd: a.ad, alanSlug: a.slug }));
  });

  if (yukleniyor || devam.length === 0) return null;

  return (
    <Kart
      dolgulu={false}
      baslik="Şu an"
      not={<Link to="/hobiler/">Hobiler →</Link>}
    >
      {devam.slice(0, 6).map((m) => (
        <Satir
          key={m.id}
          baslik={m.ad}
          alt={m.not || undefined}
          sag={<Etiket>{m.alanAd}</Etiket>}
        />
      ))}
    </Kart>
  );
}
