import { Archive, Plus, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { bugunIso, hatirlaBugun, type HatirlaMaddesi } from "@ortak/plan";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { usePlanVerisi } from "@/veri/plan";
import s from "./asistan.module.css";

/**
 * Hatırla: akılda tutulmak istenenler.
 *
 * Günün öne çıkanları `hatirlaBugun` ile seçilir — seçim tarihten türer,
 * gün içinde sabit kalır, ertesi gün kayar. Dosyaya "gösterildi" sayacı
 * yazılmaz; sayaç tutmak her açılışta yazma demek olurdu.
 */

interface HatirlaDosyasi {
  maddeler: HatirlaMaddesi[];
}

const yeniId = (): string =>
  "h-" +
  new Date()
    .toISOString()
    .replace(/[-:T.]/g, "")
    .slice(0, 17);

export function Hatirla() {
  const { kurallar } = usePlanVerisi();
  const { veri, yukleniyor, hata, yaz } = useDosya<HatirlaDosyasi>("hatirla.json");
  const [yeni, setYeni] = useState("");

  const gunlukAdet = kurallar.hatirla?.gunlukAdet ?? 3;
  const maddeler = veri?.maddeler ?? [];
  const aktif = maddeler.filter((m) => !m.arsiv);
  const arsivli = maddeler.filter((m) => m.arsiv);
  const bugun = useMemo(() => hatirlaBugun(maddeler, gunlukAdet), [maddeler, gunlukAdet]);

  const kaydet = (yeniListe: HatirlaMaddesi[]) => void yaz({ ...(veri ?? {}), maddeler: yeniListe });

  const ekle = () => {
    const metin = yeni.trim();
    if (!metin) return;
    kaydet([...maddeler, { id: yeniId(), metin, eklendi: bugunIso(), arsiv: false }]);
    setYeni("");
  };

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Hatırla" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  return (
    <>
      <EkranBasi
        baslik="Hatırla"
        altyazi="Akılda tutulacaklar. Her gün birkaçı Bugün ekranında öne çıkar."
      />

      {bugun.length > 0 && (
        <Kart
          dolgulu={false}
          baslik="Bugün önüne çıkanlar"
          not={`${gunlukAdet} madde · seçim tarihe göre döner`}
        >
          {bugun.map((m) => (
            <div key={m.id} className={s.hatirla}>
              {m.metin}
              <span className={s.hatirlaTarih}>{m.eklendi}</span>
            </div>
          ))}
        </Kart>
      )}

      <Kart
        dolgulu={false}
        baslik="Tüm liste"
        not={`${aktif.length} aktif · ${arsivli.length} arşiv`}
        className={s.rmKart}
      >
        <div className={s.eklemeSatiri}>
          <Giris
            value={yeni}
            placeholder="aklında tutmak istediğin şey"
            onChange={(e) => setYeni(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ekle()}
          />
          <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={ekle} disabled={!yeni.trim()}>
            Ekle
          </Dugme>
        </div>

        {hata && <p className={s.dipNot}>{hata}</p>}

        {aktif.length === 0 ? (
          <BosDurum baslik="Aktif madde yok" />
        ) : (
          aktif.map((m) => (
            <div key={m.id} className={s.maddeSatiri}>
              <span className={s.maddeMetin}>{m.metin}</span>
              <span className={s.hatirlaTarih}>{m.eklendi}</span>
              <Dugme
                tur="sade"
                ikon={<Archive size={14} />}
                title="Listeden çıkar ama silme"
                onClick={() =>
                  kaydet(maddeler.map((x) => (x.id === m.id ? { ...x, arsiv: true } : x)))
                }
              >
                Arşivle
              </Dugme>
              <Dugme
                tur="sade"
                ikon={<X size={14} />}
                aria-label="Tamamen sil"
                title="Tamamen sil"
                onClick={() => {
                  if (confirm(`Bu madde tamamen silinecek:\n\n${m.metin}`)) {
                    kaydet(maddeler.filter((x) => x.id !== m.id));
                  }
                }}
              />
            </div>
          ))
        )}
      </Kart>

      {arsivli.length > 0 && (
        <Kart dolgulu={false} baslik="Arşiv" not="öne çıkmaz, silinmez">
          {arsivli.map((m) => (
            <div key={m.id} className={s.maddeSatiri}>
              <span className={s.maddeMetin}>{m.metin}</span>
              <span className={s.hatirlaTarih}>{m.eklendi}</span>
              <Dugme
                tur="sade"
                ikon={<RotateCcw size={14} />}
                onClick={() =>
                  kaydet(maddeler.map((x) => (x.id === m.id ? { ...x, arsiv: false } : x)))
                }
              >
                Geri al
              </Dugme>
            </div>
          ))}
        </Kart>
      )}
    </>
  );
}
