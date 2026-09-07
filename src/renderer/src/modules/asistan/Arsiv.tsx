import { useMemo, useState } from "react";
import { arsiv, zamanOzet, type Kapsam } from "@ortak/ozet";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { saatMetni, usePlanVerisi } from "@/veri/plan";
import s from "./asistan.module.css";

/**
 * Arşiv: neye ne kadar zaman gittiği. Tamamen `@ortak/ozet`'ten türetiliyor —
 * o fonksiyonlar `app.py` ile parite testinden geçiyor, yani bu ekran eski
 * uygulamanın Arşiv sekmesiyle aynı sayıları gösterir.
 *
 * Oran üzerine yorum yok: sayı var, sonucu okuyan çıkarır.
 */

const KAPSAMLAR: { id: Kapsam; ad: string }[] = [
  { id: "gun", ad: "gün" },
  { id: "hafta", ad: "hafta" },
  { id: "ay", ad: "ay" },
  { id: "yil", ad: "yıl" },
];

function Cubuklar({ dizi }: { dizi: { etiket: string; anahtar: string; dk: number }[] }) {
  const enBuyuk = Math.max(1, ...dizi.map((x) => x.dk));
  return (
    <div className={s.cubuklar}>
      {dizi.map((x) => (
        <div key={x.anahtar} className={s.cubukSutun} title={`${x.etiket}: ${saatMetni(x.dk)}`}>
          <div className={s.cubukYuva}>
            <div
              className={s.cubuk}
              style={{ height: `${x.dk ? Math.max(3, (x.dk / enBuyuk) * 100) : 0}%` }}
            />
          </div>
          <span className={s.cubukEtiket}>{x.etiket}</span>
        </div>
      ))}
    </div>
  );
}

export function Arsiv() {
  const { haftalar, bugun, yukleniyor, hata } = usePlanVerisi();
  const [kapsam, setKapsam] = useState<Kapsam>("hafta");
  const [tarih, setTarih] = useState(bugun);

  const ozet = useMemo(() => arsiv(haftalar, bugun), [haftalar, bugun]);
  const zaman = useMemo(
    () => zamanOzet(haftalar, kapsam, tarih, bugun),
    [haftalar, kapsam, tarih, bugun],
  );

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Arşiv" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  if (hata || haftalar.length === 0) {
    return (
      <>
        <EkranBasi baslik="Arşiv" />
        <Kart>
          <BosDurum baslik="Hafta dosyası bulunamadı" metin={hata ?? undefined} />
        </Kart>
      </>
    );
  }

  return (
    <>
      <EkranBasi
        baslik="Arşiv"
        altyazi="Kaynak hafta dosyaları — ayrı bir arşiv kaydı tutulmuyor."
      />

      <div className={s.ikili}>
        <Kart>
          <p className={s.olcuEtiket}>Bu yıl ({ozet.yil})</p>
          <p className={s.olcu}>{saatMetni(ozet.yilToplamDk)}</p>
        </Kart>
        <Kart>
          <p className={s.olcuEtiket}>Tüm zamanlar</p>
          <p className={s.olcu}>{saatMetni(ozet.genelToplamDk)}</p>
        </Kart>
      </div>

      <Kart
        dolgulu={false}
        baslik="Zaman dökümü"
        not={zaman.baslik}
        bas={
          <div className={s.kapsamlar}>
            {KAPSAMLAR.map((x) => (
              <button
                key={x.id}
                type="button"
                className={x.id === kapsam ? `${s.cip} ${s.cipSecili}` : s.cip}
                onClick={() => setKapsam(x.id)}
              >
                {x.ad}
              </button>
            ))}
          </div>
        }
      >
        <div className={s.gezinme}>
          <Dugme tur="sade" onClick={() => setTarih(zaman.onceki)}>
            ‹ önceki
          </Dugme>
          <span className={s.toplam}>{saatMetni(zaman.toplamDk)}</span>
          <Dugme tur="sade" onClick={() => setTarih(zaman.sonraki)}>
            sonraki ›
          </Dugme>
          {tarih !== bugun && (
            <Dugme tur="sade" onClick={() => setTarih(bugun)}>
              bugüne dön
            </Dugme>
          )}
        </div>

        {zaman.dizi.length > 0 && <Cubuklar dizi={zaman.dizi} />}

        {zaman.alanlar.length === 0 ? (
          <BosDurum baslik="Bu aralıkta kayıt yok" />
        ) : (
          zaman.alanlar.map((a) => (
            <Satir
              key={a.alan}
              baslik={a.alan}
              sag={
                <>
                  <span className={s.oran}>%{a.oran}</span>
                  <Etiket>{saatMetni(a.dk)}</Etiket>
                </>
              }
            />
          ))
        )}
      </Kart>

      <Kart dolgulu={false} baslik="Alan başına toplam" not={`${ozet.alanlar.length} alan`}>
        {ozet.alanlar.map((a) => (
          <Satir
            key={a.alan}
            baslik={a.alan}
            alt={`${a.seans} kayıt · ${a.haftaSayisi} hafta · ortalama ${saatMetni(a.ortalamaDk)}`}
            sag={
              <>
                {a.olculenDk > 0 && <Etiket tur="vurgu">ölçülen {saatMetni(a.olculenDk)}</Etiket>}
                <Etiket>{saatMetni(a.toplamDk)}</Etiket>
              </>
            }
          />
        ))}
      </Kart>

      <Kart dolgulu={false} baslik="Hafta hafta" not={`${ozet.haftalar.length} hafta`}>
        {[...ozet.haftalar].reverse().map((h) => (
          <Satir
            key={`${h.yil}-${h.hafta}`}
            baslik={h.baslik}
            alt={h.alanlar.join(" · ") || "kayıt yok"}
            sag={
              <>
                <span className={s.oran}>
                  {h.slotYapilan}/{h.slotPlanli}
                </span>
                <Etiket>{saatMetni(h.yapilanDk)}</Etiket>
              </>
            }
          />
        ))}
      </Kart>
    </>
  );
}
