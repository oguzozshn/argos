import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { donemIceren, donemIcerir, donemKaydir, donemEtiketi, donemGunSayisi, donemKisaEtiketi } from "@ortak/donem";
import { gunEkle } from "@ortak/gun";
import { paraIsaretli, paraMetni } from "@ortak/para";
import { sonrakiTekrar } from "@ortak/duzenli";
import { kartTahmini } from "@ortak/tahmin";
import {
  butceDurumu,
  donemOzeti,
  donemSonuTahmini,
  gunlukHiz,
  hesapBakiyeleri,
  trend,
  type Islem,
} from "@ortak/harcama";
import { BosDurum, Dugme, EkranBasi, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { useDonemKaydirmasi, useHarcama } from "./kanca";
import { bosIslem, karsiTaraflar, kategoriSirasi, kisaTarih, hesapSirasi } from "./tipler";
import { DonemGezinti } from "./parcalar/DonemGezinti";
import { GunlukGrafik } from "./parcalar/GunlukGrafik";
import { KategoriDagilimi } from "./parcalar/KategoriDagilimi";
import { IslemFormu } from "./parcalar/IslemFormu";
import s from "./harcama.module.css";

/** Yaklaşan düzenli işlemlerde bakılan ufuk. */
const UFUK_GUN = 30;

export function Panel() {
  const defter = useHarcama(true);
  const [kaydirma, setKaydirma] = useDonemKaydirmasi();
  const [taslak, setTaslak] = useState<Islem | null>(null);

  const { tanimlar, islemler, bugun } = defter;
  const simge = tanimlar.ayarlar.simge;

  const donem = useMemo(
    () => donemKaydir(donemIceren(bugun, tanimlar.ayarlar.donemBaslangicGunu), kaydirma),
    [bugun, tanimlar.ayarlar.donemBaslangicGunu, kaydirma],
  );

  const ozet = useMemo(() => donemOzeti(islemler, donem, tanimlar.kategoriler), [islemler, donem, tanimlar.kategoriler]);

  const bakiyeler = useMemo(
    () => hesapBakiyeleri(tanimlar.hesaplar.filter((h) => !h.arsiv).sort(hesapSirasi), islemler),
    [tanimlar.hesaplar, islemler],
  );

  const tahminler = useMemo(
    // Bugüne bağlı, ekrandaki döneme değil: tahmin her zaman henüz başlamamış
    // dönemi anlatır, mart'a bakarken bile.
    () => kartTahmini(bakiyeler, islemler, tanimlar.duzenliler, bugun, tanimlar.ayarlar.donemBaslangicGunu),
    [bakiyeler, islemler, tanimlar.duzenliler, bugun, tanimlar.ayarlar.donemBaslangicGunu],
  );

  const butceler = useMemo(
    () => butceDurumu(tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun),
    [tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun],
  );

  const egilim = useMemo(() => trend(islemler, donem, 6), [islemler, donem]);
  const enYuksekEgilim = egilim.reduce((a, t) => Math.max(a, t.gider), 0);

  const yaklasan = useMemo(() => {
    const ufuk = gunEkle(bugun, UFUK_GUN);
    return tanimlar.duzenliler
      .map((kural) => ({ kural, tarih: sonrakiTekrar(kural, bugun) }))
      .filter((x): x is { kural: (typeof tanimlar.duzenliler)[number]; tarih: string } => x.tarih !== null && x.tarih <= ufuk)
      .sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
      .slice(0, 6);
  }, [tanimlar.duzenliler, bugun]);

  const sonIslemler = useMemo(
    () => [...islemler].sort((a, b) => (a.tarih === b.tarih ? (a.id < b.id ? 1 : -1) : a.tarih < b.tarih ? 1 : -1)).slice(0, 8),
    [islemler],
  );

  const hesapsizKural = tanimlar.duzenliler.filter((k) => !k.hesapId && !k.durdu).length;

  const yeniIslem = () => {
    const ilkKategori = tanimlar.kategoriler.filter((k) => k.tur === "gider" && !k.arsiv).sort(kategoriSirasi)[0];
    setTaslak(
      bosIslem(
        donemIcerir(donem, bugun) ? bugun : donem.bas,
        tanimlar.hesaplar.filter((h) => !h.arsiv).sort(hesapSirasi)[0]?.id ?? null,
        ilkKategori?.id ?? "",
      ),
    );
  };

  if (defter.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Panel" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  return (
    <>
      <EkranBasi
        baslik="Panel"
        altyazi={`${donemEtiketi(donem)} dönemi`}
        sag={
          <div className={s.eylemler}>
            <DonemGezinti donem={donem} kaydirma={kaydirma} onDegis={setKaydirma} />
            {!taslak && <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={yeniIslem}>İşlem ekle</Dugme>}
          </div>
        }
      />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}
      {defter.disaridanDegisti && <p className={s.orta}>Defter dışarıdan güncellendi.</p>}

      <div className={s.duzen}>
        {taslak && (
          <Kart>
            <IslemFormu
              key={taslak.id}
              baslangic={taslak}
              kategoriler={tanimlar.kategoriler}
              hesaplar={tanimlar.hesaplar.filter((h) => !h.arsiv).sort(hesapSirasi)}
              karsiTaraflar={karsiTaraflar(islemler)}
              onKaydet={(islem) => {
                void defter.islemKaydet(islem);
                setTaslak(null);
              }}
              onIptal={() => setTaslak(null)}
            />
          </Kart>
        )}

        <div className={s.dosemeler}>
          <Doseme baslik="Gider" deger={paraMetni(ozet.gider, simge)} alt={`${ozet.adet} işlem`} renk={s.gider} />
          <Doseme
            baslik="Gelir"
            deger={paraMetni(ozet.gelir, simge)}
            alt={ozet.gelir > 0 ? "dönem içinde" : "kayıt yok"}
            renk={s.gelir}
          />
          <Doseme
            baslik="Net"
            deger={paraIsaretli(ozet.net, simge)}
            alt={ozet.net < 0 ? "gelirden fazla harcandı" : "artıda"}
            renk={ozet.net < 0 ? s.gider : s.gelir}
          />
          <Doseme
            baslik="Günlük ortalama"
            deger={paraMetni(gunlukHiz(ozet, bugun), simge)}
            alt={
              donemIcerir(donem, bugun)
                ? `dönem sonu tahmini ${paraMetni(donemSonuTahmini(ozet, bugun), simge)}`
                : `${donemGunSayisi(donem)} günlük dönem`
            }
          />
        </div>

        {bakiyeler.length > 0 && (
          <Kart dolgulu={false} baslik="Hesaplar" git={{ yol: "/harcama/hesaplar", metin: "Tümü" }}>
            <div className={s.hesaplar}>
              {bakiyeler.map((b) => (
                <div key={b.hesap.id} className={s.hesapKutu}>
                  <span className={s.rozet}>
                    <span className={s.nokta} style={{ background: b.hesap.renk }} />
                    {b.hesap.simge ? `${b.hesap.simge} ${b.hesap.ad}` : b.hesap.ad}
                  </span>
                  <span className={`${s.tutar} ${b.bakiye < 0 ? s.gider : s.gelir}`}>
                    {paraMetni(b.bakiye, simge)}
                  </span>
                </div>
              ))}
            </div>
          </Kart>
        )}

        {tahminler.length > 0 && (
          <Kart baslik="Kart borç tahmini" not={donemEtiketi(tahminler[0]!.donem)}>
            {tahminler.map((t) => (
              <div key={t.bakiye.hesap.id} className={s.duzen}>
                <div className={s.aralik}>
                  <span className={s.rozet}>
                    <span className={s.nokta} style={{ background: t.bakiye.hesap.renk }} />
                    {t.bakiye.hesap.ad}
                  </span>
                  <span>şu anki borç {paraMetni(t.mevcutBorc, simge)}</span>
                </div>
                <span className={`${s.tutar} ${s.gider}`} style={{ fontSize: "var(--y2)" }}>
                  {paraMetni(t.orta, simge)}
                </span>
                <span className={s.soluk}>
                  tahmin aralığı {paraMetni(t.alt, simge)} – {paraMetni(t.ust, simge)} · {t.donemSayisi} dönemlik
                  geçmişe dayanıyor
                </span>
                {t.duzenli > 0 ? (
                  <span className={s.soluk}>
                    bunun {paraMetni(t.duzenli, simge)} kadarı bu karta bağlı düzenli işlemlerden
                  </span>
                ) : (
                  hesapsizKural > 0 && (
                    <span className={s.soluk}>
                      Bu karta bağlı düzenli işlem yok. <Link to="/harcama/duzenli">{hesapsizKural} kuralın</Link> hesabı
                      seçili değil; seçerseniz tahmin keskinleşir.
                    </span>
                  )
                )}
              </div>
            ))}
            <p className={s.soluk}>
              Geçmiş dönemlerin harcama hızından hesaplanır; iki farklı yöntemin verdiği alt ve üst sınır gösterilir.
              Tek büyük bir alışveriş bu aralığı aşar.
            </p>
          </Kart>
        )}

        <div className={s.ikiSutun}>
          <Kart dolgulu={false} baslik="Günlük harcama">
            <GunlukGrafik gunler={ozet.gunluk} simge={simge} bugun={bugun} />
          </Kart>
          <Kart dolgulu={false} baslik="Kategoriye göre gider">
            <KategoriDagilimi
              satirlar={ozet.kategoriler.filter((k) => k.tur === "gider")}
              simge={simge}
              bosMetin="Bu dönemde gider yok."
            />
          </Kart>
        </div>

        <div className={s.ikiSutun}>
          <Kart dolgulu={false} baslik="Bütçeler" git={{ yol: "/harcama/butceler", metin: "Tümü" }}>
            {butceler.length === 0 ? (
              <p className={`${s.soluk} ${s.butceSatir}`}>
                Henüz bütçe yok. Bir kategoriye aylık sınır koyunca burada takip edebilirsin.
              </p>
            ) : (
              butceler.slice(0, 4).map((b) => (
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
                </div>
              ))
            )}
          </Kart>

          <Kart dolgulu={false} baslik="Yaklaşan düzenli işlemler" git={{ yol: "/harcama/duzenli", metin: "Tümü" }}>
            {yaklasan.length === 0 ? (
              <p className={`${s.soluk} ${s.butceSatir}`}>Önümüzdeki {UFUK_GUN} günde düzenli işlem yok.</p>
            ) : (
              <div className={s.satirlar}>
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
              </div>
            )}
          </Kart>
        </div>

        <Kart dolgulu={false} baslik="Son 6 dönem">
          {enYuksekEgilim === 0 ? (
            <p className={`${s.soluk} ${s.butceSatir}`}>Karşılaştırılacak veri yok.</p>
          ) : (
            <>
              <div className={s.egilim}>
                {egilim.map((t) => (
                  <div
                    key={t.donem.bas}
                    className={t.donem.bas === donem.bas ? `${s.egilimSutun} ${s.egilimSecili}` : s.egilimSutun}
                    title={`${donemEtiketi(t.donem)}: ${paraMetni(t.gider, simge)}`}
                  >
                    <span
                      className={s.egilimDolgu}
                      style={{ height: `${Math.max(2, Math.round((t.gider * 100) / enYuksekEgilim))}%` }}
                    />
                    <span className={s.egilimAd}>{donemKisaEtiketi(t.donem)}</span>
                  </div>
                ))}
              </div>
              <div className={`${s.aralik} ${s.butceSatir}`}>
                <span>En yüksek: {paraMetni(enYuksekEgilim, simge)}</span>
                <span>
                  Ortalama: {paraMetni(Math.trunc(egilim.reduce((a, t) => a + t.gider, 0) / egilim.length), simge)}
                </span>
              </div>
            </>
          )}
        </Kart>

        <Kart dolgulu={false} baslik="Son işlemler" git={{ yol: "/harcama/islemler", metin: "Tümü" }}>
          {sonIslemler.length === 0 ? (
            <BosDurum baslik="Henüz işlem yok" metin="Yukarıdaki “İşlem ekle” ile başla." />
          ) : (
            <div className={s.satirlar}>
              {sonIslemler.map((i) => {
                const kategori = tanimlar.kategoriler.find((k) => k.id === i.kategoriId);
                return (
                  <Satir
                    key={i.id}
                    sol={<span className={s.tarihSutun}>{kisaTarih(i.tarih)}</span>}
                    baslik={
                      <span className={s.rozet}>
                        <span className={s.nokta} style={{ background: kategori?.renk ?? "#8b93a3" }} />
                        {kategori?.ad ?? "Silinmiş kategori"}
                      </span>
                    }
                    alt={i.karsiTaraf || i.not || undefined}
                    sag={
                      <span className={`${s.tutar} ${i.tur === "gelir" ? s.gelir : s.gider}`}>
                        {i.transfer ? paraMetni(i.kurus, simge) : paraIsaretli(i.tur === "gelir" ? i.kurus : -i.kurus, simge)}
                      </span>
                    }
                  />
                );
              })}
            </div>
          )}
        </Kart>
      </div>
    </>
  );
}

function Doseme({ baslik, deger, alt, renk }: { baslik: string; deger: string; alt: string; renk?: string }) {
  return (
    <div className={s.doseme}>
      <span className={s.dosemeBaslik}>{baslik}</span>
      <span className={`${s.dosemeDeger} ${renk ?? ""}`}>{deger}</span>
      <span className={s.soluk}>{alt}</span>
    </div>
  );
}
