import { LayoutGrid } from "lucide-react";
import { moduller } from "@/modules";
import { BosDurum, EkranBasi } from "@/ui/bilesenler";
import { HataSiniri } from "./HataSiniri";
import s from "./bugun.module.css";

const gunAdi = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Modüllerin buluştuğu tek ekran. Her modül kendi `Ozet` kartını verir;
 * bu ekran onları ızgaraya dizmekten başka bir şey yapmaz — koordinasyon
 * yüzeyi budur. Geniş ekranda iki sütun; bir kart tüm satırı isterse
 * kendi sınıfıyla `grid-column: 1 / -1` verir.
 */
export function Bugun() {
  const ozetler = moduller.filter((m) => m.Ozet);

  return (
    <>
      <EkranBasi
        ustyazi={gunAdi.format(new Date())}
        baslik="Bugün"
      />

      {ozetler.length === 0 ? (
        <BosDurum
          ikon={<LayoutGrid size={34} strokeWidth={1.4} />}
          baslik="Henüz modül yok"
          metin="Kabuk kuruldu. İlk modül eklendiğinde özeti bu ekranda görünecek."
        />
      ) : (
        <div className={s.izgara}>
          {ozetler.map((m) => {
            const Ozet = m.Ozet!;
            // Kartlar yan yana duruyor; biri düşerse diğerleri kalsın.
            return (
              <HataSiniri key={m.id} ad={m.ad}>
                <Ozet />
              </HataSiniri>
            );
          })}
        </div>
      )}
    </>
  );
}
