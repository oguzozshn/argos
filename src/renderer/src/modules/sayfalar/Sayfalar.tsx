import { useCallback, useRef, useState } from "react";
import { BosDurum, EkranBasi, Kart, Yuklenirken } from "@/ui/bilesenler";
import { Kisayollar } from "@/ui/Kisayollar";
import { Sayfa } from "./Sayfa";
import { SayfaAgaci } from "./SayfaAgaci";
import { secimiOku, secimiYaz, useSayfaAgaci } from "./kanca";
import s from "./sayfalar.module.css";

/**
 * Sayfalar: solda ağaç, sağda açık sayfa. Notion'daki gibi blok blok yazılan
 * notlar; veri `data/pages/` altında kendi dosyalarında durur.
 */
export function Sayfalar() {
  const agac = useSayfaAgaci();
  const [secim, setSecim] = useState<string | null>(secimiOku);
  // Gövde her tuşta değişiyor; ağaçtaki düzenleme damgası bu sıklıkta
  // yazılmaz — dakikada bir yeter, "son düzenlenenler" sırası için.
  const sonDamga = useRef(0);

  const sec = (id: string) => {
    setSecim(id);
    secimiYaz(id);
  };

  // Silinen ya da hiç seçilmemiş sayfa: ağacın ilkine düşülür.
  const acik = agac.bul(secim) ?? agac.anahat[0]?.page ?? null;

  const damgala = useCallback(() => {
    if (!acik) return;
    const simdi = Date.now();
    if (simdi - sonDamga.current < 60000) return;
    sonDamga.current = simdi;
    void agac.guncelle(acik.id, {});
  }, [acik, agac]);

  return (
    <>
      <EkranBasi baslik="Sayfalar" />
      {agac.hata && <div className={s.hataSerit}>Sayfa ağacı okunamadı: {agac.hata}</div>}
      <Kisayollar
        grup="Sayfalar"
        liste={[{ tus: "n", aciklama: "Yeni sayfa", eylem: () => void agac.ekle(null).then((id) => id && sec(id)) }]}
      />

      {agac.yukleniyor && agac.anahat.length === 0 ? (
        <Kart>
          <Yuklenirken />
        </Kart>
      ) : (
        <div className={s.pano}>
          <SayfaAgaci agac={agac} acikId={acik?.id ?? null} onSec={sec} />
          <div className={s.govde}>
            {acik ? (
              <Sayfa
                key={acik.id}
                page={acik}
                onBaslik={(title) => void agac.guncelle(acik.id, { title })}
                onIkon={(icon) => void agac.guncelle(acik.id, { icon })}
                onDegisti={damgala}
              />
            ) : (
              <BosDurum
                baslik="Sayfa yok"
                metin="Soldaki + ile ilk sayfanı aç. Başlıklar, maddeler ve yapılacaklar markdown kısayollarıyla yazılır."
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
