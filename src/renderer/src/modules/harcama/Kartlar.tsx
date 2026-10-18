import { useMemo } from "react";
import type { KartAyari } from "@ortak/bugun-duzen";
import { donemEtiketi, donemIceren } from "@ortak/donem";
import { abonelikToplami, sonrakiTekrar } from "@ortak/duzenli";
import { gunEkle } from "@ortak/gun";
import { butceDurumu, type Duzenli } from "@ortak/harcama";
import { paraMetni } from "@ortak/para";
import type { KartSecenegi, KartTuru } from "@/modules";
import { Kart, Satir } from "@/ui/bilesenler";
import { useHarcama } from "./kanca";
import { kisaTarih } from "./tipler";
import s from "./harcama.module.css";

/**
 * Harcama's cards for Bugün: subscriptions, budgets and upcoming payments.
 * Read-only like the summary card (see Ozet.tsx): editing a payment from
 * here would change totals, balance and budget at once.
 */

/** Rows shown before "N daha". */
const EN_COK = 10;

const bosMetin = (metin: string) => <p className={`${s.soluk} ${s.butceSatir}`}>{metin}</p>;

/** Running rules with their next date, earliest first. */
function siradakiler(kurallar: Duzenli[], bugun: string) {
  return kurallar
    .filter((k) => !k.durdu)
    .map((kural) => ({ kural, tarih: sonrakiTekrar(kural, bugun) }))
    .filter((x): x is { kural: Duzenli; tarih: string } => x.tarih !== null)
    .sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.kural.ad.localeCompare(b.kural.ad, "tr")));
}

function OdemeSatiri({ kural, tarih, simge, alt }: { kural: Duzenli; tarih: string; simge: string; alt?: string }) {
  return (
    <Satir
      sol={<span className={s.tarihSutun}>{kisaTarih(tarih)}</span>}
      baslik={kural.ad}
      alt={alt}
      sag={
        <span className={`${s.tutar} ${kural.tur === "gelir" ? s.gelir : s.gider}`}>{paraMetni(kural.kurus, simge)}</span>
      }
    />
  );
}

/* --- Abonelikler ---------------------------------------------------------------- */

function AboneliklerKarti() {
  const { tanimlar, bugun, yukleniyor, kurulu } = useHarcama();
  const simge = tanimlar.ayarlar.simge;
  const toplam = useMemo(() => abonelikToplami(tanimlar.duzenliler, bugun), [tanimlar.duzenliler, bugun]);
  const liste = useMemo(
    () => siradakiler(tanimlar.duzenliler.filter((k) => k.abonelik), bugun),
    [tanimlar.duzenliler, bugun],
  );
  if (yukleniyor || !kurulu) return null;

  return (
    <Kart
      dolgulu={false}
      baslik="Abonelikler"
      not={toplam.adet ? `aylık ${paraMetni(toplam.aylik, simge)}` : undefined}
      git={{ yol: "/harcama/abonelikler", metin: "Abonelikler" }}
    >
      {liste.length === 0
        ? bosMetin("Süren abonelik yok.")
        : liste
            .slice(0, EN_COK)
            .map(({ kural, tarih }) => (
              <OdemeSatiri
                key={kural.id}
                kural={kural}
                tarih={tarih}
                simge={simge}
                alt={kural.periyot === "yillik" ? "yıllık" : "aylık"}
              />
            ))}
      {liste.length > EN_COK && bosMetin(`${liste.length - EN_COK} abonelik daha`)}
    </Kart>
  );
}

/* --- Bütçeler ------------------------------------------------------------------- */

function ButcelerKarti() {
  const { tanimlar, islemler, bugun, yukleniyor, kurulu } = useHarcama();
  const simge = tanimlar.ayarlar.simge;
  const donem = useMemo(
    () => donemIceren(bugun, tanimlar.ayarlar.donemBaslangicGunu),
    [bugun, tanimlar.ayarlar.donemBaslangicGunu],
  );
  const durumlar = useMemo(
    () => butceDurumu(tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun),
    [tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun],
  );
  if (yukleniyor || !kurulu) return null;

  return (
    <Kart dolgulu={false} baslik="Bütçeler" not={donemEtiketi(donem)} git={{ yol: "/harcama/butceler", metin: "Bütçeler" }}>
      {durumlar.length === 0
        ? bosMetin("Henüz bütçe yok. Bütçeler ekranından bir kategoriye sınır koyabilirsin.")
        : durumlar.map((b) => (
            <div key={b.kategori.id} className={s.butceSatir}>
              <div className={s.aralik}>
                <span className={s.rozet}>
                  <span className={s.nokta} style={{ background: b.kategori.renk }} />
                  {b.kategori.ad}
                </span>
                <span className={s.tutar}>
                  {paraMetni(b.harcanan, simge)} / {paraMetni(b.sinir, simge)}
                </span>
              </div>
              <span className={s.cubuk}>
                <span
                  className={`${s.dolgu} ${b.asti ? s.dolguAsti : b.yaklasti ? s.dolguYaklasti : ""}`}
                  style={{ width: `${Math.round(b.doluluk * 100)}%` }}
                />
              </span>
              <div className={s.aralik}>
                <span>
                  {b.asti ? `${paraMetni(-b.kalan, simge)} aşıldı` : `${paraMetni(b.kalan, simge)} kaldı`}
                </span>
              </div>
            </div>
          ))}
    </Kart>
  );
}

/* --- Yaklaşan ödemeler ---------------------------------------------------------- */

const UFUKLAR: KartSecenegi[] = [
  { deger: "7", ad: "7 gün" },
  { deger: "14", ad: "14 gün" },
  { deger: "30", ad: "30 gün" },
];

function YaklasanKarti({ ayar }: { ayar: KartAyari }) {
  const { tanimlar, bugun, yukleniyor, kurulu } = useHarcama();
  const simge = tanimlar.ayarlar.simge;
  const gun = Number(UFUKLAR.find((u) => u.deger === ayar.gun)?.deger ?? UFUKLAR[0]!.deger);
  const liste = useMemo(() => {
    const ufuk = gunEkle(bugun, gun);
    return siradakiler(tanimlar.duzenliler, bugun).filter((x) => x.tarih <= ufuk);
  }, [tanimlar.duzenliler, bugun, gun]);
  if (yukleniyor || !kurulu) return null;

  const gider = liste.filter((x) => x.kural.tur !== "gelir").reduce((t, x) => t + x.kural.kurus, 0);
  return (
    <Kart
      dolgulu={false}
      baslik={`${gun} günde ödemeler`}
      not={gider ? paraMetni(gider, simge) : undefined}
      git={{ yol: "/harcama/duzenli", metin: "Düzenli" }}
    >
      {liste.length === 0
        ? bosMetin(`Önümüzdeki ${gun} günde ödeme yok.`)
        : liste
            .slice(0, EN_COK)
            .map(({ kural, tarih }) => (
              <OdemeSatiri
                key={kural.id}
                kural={kural}
                tarih={tarih}
                simge={simge}
                alt={kural.abonelik ? "abonelik" : undefined}
              />
            ))}
      {liste.length > EN_COK && bosMetin(`${liste.length - EN_COK} ödeme daha`)}
    </Kart>
  );
}

export const harcamaKartlari: KartTuru[] = [
  { id: "abonelikler", ad: "Abonelikler", Bilesen: AboneliklerKarti, w: 4, h: 9 },
  { id: "butceler", ad: "Bütçeler", Bilesen: ButcelerKarti, w: 4, h: 9 },
  {
    id: "yaklasan",
    ad: "Yaklaşan ödemeler",
    Bilesen: YaklasanKarti,
    ayarlar: [{ anahtar: "gun", ad: "Süre", useSecenekler: () => UFUKLAR }],
    w: 4,
    h: 9,
  },
];
