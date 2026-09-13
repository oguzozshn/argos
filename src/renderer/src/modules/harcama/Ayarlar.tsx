import { useState } from "react";
import { Check } from "lucide-react";
import { baslangicGunuDuzelt, donemEtiketi, donemIceren } from "@ortak/donem";
import { paraMetni } from "@ortak/para";
import { defterOzeti } from "@ortak/harcama";
import { Dugme, EkranBasi, Giris, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { useOrtam } from "@/veri/kanca";
import { useHarcama } from "./kanca";
import { kisaTarih } from "./tipler";
import s from "./harcama.module.css";

export function Ayarlar() {
  const defter = useHarcama(true);
  const [ortam] = useOrtam();
  const [simge, setSimge] = useState<string | null>(null);
  const [gun, setGun] = useState<string | null>(null);

  const { tanimlar, islemler } = defter;
  const ayarlar = tanimlar.ayarlar;
  const ozet = defterOzeti(islemler, tanimlar);

  const kaydet = () =>
    void defter.tanimlariYaz({
      ...tanimlar,
      ayarlar: {
        simge: (simge ?? ayarlar.simge).trim() || "₺",
        donemBaslangicGunu: baslangicGunuDuzelt(Number(gun ?? ayarlar.donemBaslangicGunu)),
      },
    });

  if (defter.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Ayarlar" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const secilen = baslangicGunuDuzelt(Number(gun ?? ayarlar.donemBaslangicGunu));
  const ornek = donemIceren(defter.bugun, secilen);

  return (
    <>
      <EkranBasi baslik="Ayarlar" altyazi="Para birimi ve dönem döngüsü." />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}

      <div className={s.duzen}>
        <Kart>
          <div className={s.form}>
            <label className={s.alan}>
              <span className={s.etiket}>Para birimi simgesi</span>
              <Giris value={simge ?? ayarlar.simge} maxLength={4} onChange={(e) => setSimge(e.target.value)} />
            </label>
            <label className={s.alan}>
              <span className={s.etiket}>Dönem başlangıç günü</span>
              <input
                className={`${s.metin} ${s.sayiAlani}`}
                type="number"
                min={1}
                max={28}
                value={gun ?? String(ayarlar.donemBaslangicGunu)}
                onChange={(e) => setGun(e.target.value)}
              />
            </label>
          </div>
          <p className={s.soluk}>
            Şu anki dönem bu ayarla <strong>{donemEtiketi(ornek)}</strong> olur ({ornek.bas} – {ornek.son}). Maaş günü
            gibi bir değer seçilirse bütün raporlar ve bütçeler o döngüye göre hesaplanır. Ayın 28'inden sonrası
            Şubat'ta bulunmadığı için oraya kırpılır.
          </p>
          <div className={s.eylemler}>
            <Dugme tur="dolu" ikon={<Check size={15} />} onClick={kaydet}>
              Kaydet
            </Dugme>
          </div>
        </Kart>

        <Kart dolgulu={false} baslik="Veri">
          <div className={s.satirlar}>
            <Satir baslik="İşlem" sag={<span className={s.tutar}>{ozet.islem}</span>} />
            <Satir baslik="Kategori" sag={<span className={s.tutar}>{ozet.kategori}</span>} />
            <Satir baslik="Hesap" sag={<span className={s.tutar}>{tanimlar.hesaplar.length}</span>} />
            <Satir baslik="Düzenli kural" sag={<span className={s.tutar}>{ozet.kural}</span>} />
            <Satir
              baslik="Aralık"
              sag={
                <span className={s.orta}>
                  {ozet.ilk && ozet.son ? `${kisaTarih(ozet.ilk)} … ${kisaTarih(ozet.son)}` : "kayıt yok"}
                </span>
              }
            />
            <Satir
              baslik="Toplam gider"
              alt="bütün defter, transferler hariç"
              sag={
                <span className={`${s.tutar} ${s.gider}`}>
                  {paraMetni(
                    islemler.filter((i) => !i.transfer && i.tur === "gider").reduce((a, i) => a + i.kurus, 0),
                    ayarlar.simge,
                  )}
                </span>
              }
            />
            <Satir
              baslik="Dosyalar"
              alt="tanımlar tek dosyada, işlemler takvim ayına göre"
              sag={<span className={s.orta}>{ortam ? `${ortam.dataDir}/harcama` : "—"}</span>}
            />
          </div>
        </Kart>
      </div>
    </>
  );
}
