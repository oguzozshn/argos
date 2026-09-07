import { LayoutGrid } from "lucide-react";
import { moduller } from "@/modules";
import { BosDurum, EkranBasi } from "@/ui/bilesenler";

const gunAdi = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Modüllerin buluştuğu tek ekran. Her modül kendi `Ozet` kartını verir;
 * bu ekran onları dizmekten başka bir şey yapmaz — koordinasyon yüzeyi budur.
 */
export function Bugun() {
  const ozetler = moduller.filter((m) => m.Ozet);

  return (
    <>
      <EkranBasi
        ustyazi={gunAdi.format(new Date())}
        baslik="Bugün"
        altyazi="Modüllerin özetleri burada toplanır."
      />

      {ozetler.length === 0 ? (
        <BosDurum
          ikon={<LayoutGrid size={34} strokeWidth={1.4} />}
          baslik="Henüz modül yok"
          metin="Kabuk kuruldu. İlk modül eklendiğinde özeti bu ekranda görünecek."
        />
      ) : (
        <div style={{ display: "grid", gap: "var(--b5)" }}>
          {ozetler.map((m) => {
            const Ozet = m.Ozet!;
            return <Ozet key={m.id} />;
          })}
        </div>
      )}
    </>
  );
}
