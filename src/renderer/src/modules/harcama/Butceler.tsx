import { useMemo, useState } from "react";
import { donemIceren, donemKaydir, donemEtiketi } from "@ortak/donem";
import { paraCoz, paraGiris, paraMetni } from "@ortak/para";
import {
  atilButceler,
  butceDurumu,
  butceKapsami,
  kapsamaDisiOlanlar,
  type Butce,
} from "@ortak/harcama";
import { BosDurum, Dugme, EkranBasi, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { useDonemKaydirmasi, useHarcama } from "./kanca";
import { kategoriSirasi } from "./tipler";
import { DonemGezinti } from "./parcalar/DonemGezinti";
import s from "./harcama.module.css";

export function Butceler() {
  const defter = useHarcama(true);
  const [kaydirma, setKaydirma] = useDonemKaydirmasi();
  const [duzenlenen, setDuzenlenen] = useState<{ kategoriId: string; deger: string } | null>(null);
  const [gecersiz, setGecersiz] = useState(false);

  const { tanimlar, islemler, bugun } = defter;
  const simge = tanimlar.ayarlar.simge;

  const donem = useMemo(
    () => donemKaydir(donemIceren(bugun, tanimlar.ayarlar.donemBaslangicGunu), kaydirma),
    [bugun, tanimlar.ayarlar.donemBaslangicGunu, kaydirma],
  );

  const durumlar = useMemo(
    () => butceDurumu(tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun),
    [tanimlar.butceler, tanimlar.kategoriler, islemler, donem, bugun],
  );

  const kapsam = useMemo(
    () => butceKapsami(tanimlar.kategoriler, tanimlar.butceler, islemler, donem),
    [tanimlar.kategoriler, tanimlar.butceler, islemler, donem],
  );

  /** Sınır sıfır ya da altındaysa bütçe silinir: sıfır sınır bir bütçe değildir. */
  /**
   * Boş alan "sınırı kaldır" demek; okunamayan metin ise hiçbir şey demek
   * değil. Önceden ikisi de 0 oluyor, bir yazım hatası bütçeyi siliyordu.
   */
  const girileniKoy = (kategoriId: string, metin: string) => {
    const kurus = metin.trim() === "" ? 0 : paraCoz(metin);
    if (kurus === null || kurus < 0) {
      setGecersiz(true);
      return;
    }
    sinirKoy(kategoriId, kurus);
  };

  const sinirKoy = (kategoriId: string, kurus: number) => {
    const kalanlar = tanimlar.butceler.filter((b) => b.kategoriId !== kategoriId);
    const yeni: Butce[] = kurus > 0 ? [...kalanlar, { kategoriId, sinirKurus: kurus }] : kalanlar;
    void defter.tanimlariYaz({ ...tanimlar, butceler: yeni });
    setDuzenlenen(null);
  };

  if (defter.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Bütçeler" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const giderKategorileri = tanimlar.kategoriler.filter((k) => k.tur === "gider" && !k.arsiv).sort(kategoriSirasi);
  const kapsamaDisi = kapsamaDisiOlanlar(kapsam);
  const atil = atilButceler(kapsam);

  return (
    <>
      <EkranBasi
        baslik="Bütçeler"
        altyazi={`${donemEtiketi(donem)} · kategori başına dönemlik sınır`}
        sag={<DonemGezinti donem={donem} kaydirma={kaydirma} onDegis={setKaydirma} />}
      />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}

      <div className={s.duzen}>
        <Kart dolgulu={false} baslik="Bu dönem">
          {durumlar.length === 0 ? (
            <BosDurum
              baslik="Henüz bütçe yok"
              metin="Aşağıdaki listeden bir kategoriye aylık sınır koyunca doluluk burada görünür."
            />
          ) : (
            durumlar.map((b) => (
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
                    {b.asti
                      ? `${paraMetni(-b.kalan, simge)} aşıldı`
                      : `${paraMetni(b.kalan, simge)} kaldı`}
                  </span>
                  {/* Çıplak çubuğun söyleyemediği şey: bu hızla dönem sonunda nerede biter. */}
                  <span>bu hızla dönem sonu {paraMetni(b.tahmin, simge)}</span>
                </div>
              </div>
            ))
          )}
        </Kart>

        <Kart
          dolgulu={false}
          baslik="Kapsam"
          not={`son ${kapsam.donemSayisi} dönemin ortalaması`}
        >
          <div className={s.butceSatir}>
            <div className={s.aralik}>
              <span>Olağan aylık harcamanın bütçe altındaki payı</span>
              <span className={s.tutar}>%{Math.round(kapsam.oran * 100)}</span>
            </div>
            <span className={s.cubuk}>
              <span className={s.dolgu} style={{ width: `${Math.round(kapsam.oran * 100)}%` }} />
            </span>
            <div className={s.aralik}>
              <span>bütçeli {paraMetni(kapsam.butceliOrtalama, simge)}</span>
              <span>kapsam dışı {paraMetni(kapsam.kapsamaDisi, simge)}</span>
            </div>
          </div>

          {kapsamaDisi.length > 0 && (
            <div className={s.satirlar}>
              {kapsamaDisi.slice(0, 6).map((h) => (
                <Satir
                  key={h.kategori.id}
                  sol={<span className={s.nokta} style={{ background: h.kategori.renk }} />}
                  baslik={h.kategori.ad}
                  alt={`aylık ortalama ${paraMetni(h.aylikOrtalama, simge)} · sınırsız`}
                  sag={
                    <Dugme tur="sade" onClick={() => sinirKoy(h.kategori.id, h.aylikOrtalama)}>
                      Sınır koy
                    </Dugme>
                  }
                />
              ))}
            </div>
          )}

          {atil.length > 0 && (
            <p className={`${s.soluk} ${s.butceSatir}`}>
              Hiç harcama olmayan {atil.length} kategoride sınır duruyor ({atil.map((a) => a.kategori.ad).join(", ")}).
              Toplamı şişirir, bir şey izlemez.
            </p>
          )}
        </Kart>

        <Kart dolgulu={false} baslik="Sınırlar">
          <div className={s.satirlar}>
            {giderKategorileri.map((k) => {
              const sinir = tanimlar.butceler.find((b) => b.kategoriId === k.id)?.sinirKurus ?? 0;
              const ortalama = kapsam.kategoriler.find((h) => h.kategori.id === k.id)?.aylikOrtalama ?? 0;
              const acik = duzenlenen?.kategoriId === k.id;
              return (
                <Satir
                  key={k.id}
                  sol={<span className={s.nokta} style={{ background: k.renk }} />}
                  baslik={k.ad}
                  alt={ortalama > 0 ? `aylık ortalama ${paraMetni(ortalama, simge)}` : "bu pencerede harcama yok"}
                  sag={
                    acik ? (
                      <div className={s.eylemler}>
                        <input
                          className={`${s.metin} ${s.sayiAlani}`}
                          style={{ width: 120 }}
                          value={duzenlenen.deger}
                          inputMode="decimal"
                          autoFocus
                          aria-invalid={gecersiz}
                          title={gecersiz ? "Tutar okunamadı" : undefined}
                          onChange={(e) => {
                            setGecersiz(false);
                            setDuzenlenen({ kategoriId: k.id, deger: e.target.value });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") girileniKoy(k.id, duzenlenen.deger);
                            if (e.key === "Escape") setDuzenlenen(null);
                          }}
                        />
                        {gecersiz && <span className={s.soluk}>Tutar okunamadı</span>}
                        <Dugme tur="dolu" onClick={() => girileniKoy(k.id, duzenlenen.deger)}>
                          Kaydet
                        </Dugme>
                        <Dugme tur="sade" onClick={() => setDuzenlenen(null)}>
                          Vazgeç
                        </Dugme>
                      </div>
                    ) : (
                      <div className={s.eylemler}>
                        <span className={`${s.tutar} ${sinir > 0 ? "" : s.soluk}`}>
                          {sinir > 0 ? paraMetni(sinir, simge) : "sınır yok"}
                        </span>
                        <Dugme
                          tur="sade"
                          onClick={() => {
                            setGecersiz(false);
                            setDuzenlenen({ kategoriId: k.id, deger: sinir > 0 ? paraGiris(sinir) : "" });
                          }}
                        >
                          {sinir > 0 ? "Değiştir" : "Sınır koy"}
                        </Dugme>
                      </div>
                    )
                  }
                />
              );
            })}
          </div>
        </Kart>
      </div>
    </>
  );
}
