import { useMemo } from "react";
import { donemEtiketi, donemIceren } from "@ortak/donem";
import { gunEkle } from "@ortak/gun";
import { paraIsaretli, paraMetni } from "@ortak/para";
import { sonrakiTekrar } from "@ortak/duzenli";
import { butceDurumu, donemOzeti, donemSonuTahmini, gunlukHiz } from "@ortak/harcama";
import { Etiket, Kart, Satir } from "@/ui/bilesenler";
import { useHarcama } from "./kanca";
import { kisaTarih } from "./tipler";
import s from "./harcama.module.css";

/** Yaklaşan düzenli işlemlerde Bugün kartının baktığı ufuk — panelinkinden dar. */
const UFUK_GUN = 7;

/**
 * Bugün kartı. Salt okunur: bir işlemi buradan düzenlemek dönem toplamlarını,
 * bakiyeyi ve bütçeyi birden değiştirir; yarısını yapan bir kart tutarsız
 * bırakır. Kurulum da tetiklenmez — kullanıcı modüle hiç girmediyse dosya
 * açılmaz.
 */
export function HarcamaOzet() {
  const defter = useHarcama();
  const { tanimlar, islemler, bugun } = defter;
  const simge = tanimlar.ayarlar.simge;

  const donem = useMemo(
    () => donemIceren(bugun, tanimlar.ayarlar.donemBaslangicGunu),
    [bugun, tanimlar.ayarlar.donemBaslangicGunu],
  );

  const ozet = useMemo(() => donemOzeti(islemler, donem, tanimlar.kategoriler), [islemler, donem, tanimlar.kategoriler]);

  const uyaranButceler = useMemo(
    () => butceDurumu(tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun).filter((b) => b.asti || b.yaklasti),
    [tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun],
  );

  const yaklasan = useMemo(() => {
    const ufuk = gunEkle(bugun, UFUK_GUN);
    return tanimlar.duzenliler
      .map((kural) => ({ kural, tarih: sonrakiTekrar(kural, bugun) }))
      .filter((x): x is { kural: (typeof tanimlar.duzenliler)[number]; tarih: string } => x.tarih !== null && x.tarih <= ufuk)
      .sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
      .slice(0, 3);
  }, [tanimlar.duzenliler, bugun]);

  if (defter.yukleniyor || !defter.kurulu || ozet.adet === 0) return null;

  return (
    <Kart dolgulu={false} baslik={donemEtiketi(donem)} git={{ yol: "/harcama/", metin: "Harcama" }}>
      <Satir
        baslik="Gider"
        alt={`${ozet.adet} işlem · günlük ortalama ${paraMetni(gunlukHiz(ozet, bugun), simge)}`}
        sag={<span className={`${s.tutar} ${s.gider}`}>{paraMetni(ozet.gider, simge)}</span>}
      />
      <Satir
        baslik="Net"
        alt={`bu hızla dönem sonu ${paraMetni(donemSonuTahmini(ozet, bugun), simge)}`}
        sag={
          <span className={`${s.tutar} ${ozet.net < 0 ? s.gider : s.gelir}`}>{paraIsaretli(ozet.net, simge)}</span>
        }
      />

      {uyaranButceler.slice(0, 3).map((b) => (
        <Satir
          key={b.kategori.id}
          baslik={
            <span className={s.rozet}>
              <span className={s.nokta} style={{ background: b.kategori.renk }} />
              {b.kategori.ad}
            </span>
          }
          alt={`${paraMetni(b.harcanan, simge)} / ${paraMetni(b.sinir, simge)}`}
          sag={<Etiket tur={b.asti ? "hata" : "uyari"}>{b.asti ? "aşıldı" : "%85"}</Etiket>}
        />
      ))}

      {yaklasan.map(({ kural, tarih }) => (
        <Satir
          key={kural.id}
          sol={<span className={s.tarihSutun}>{kisaTarih(tarih)}</span>}
          baslik={kural.ad}
          sag={
            <span className={`${s.tutar} ${kural.tur === "gelir" ? s.gelir : s.gider}`}>
              {paraMetni(kural.kurus, simge)}
            </span>
          }
        />
      ))}
    </Kart>
  );
}
