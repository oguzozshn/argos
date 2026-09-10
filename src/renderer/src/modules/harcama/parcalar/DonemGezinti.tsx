import { ChevronLeft, ChevronRight } from "lucide-react";
import { donemEtiketi, type Donem } from "@ortak/donem";
import { Dugme } from "@/ui/bilesenler";
import s from "../harcama.module.css";

/**
 * Dönemler arasında gezinti. Ekranın hangi dönemi gösterdiğini kaydırma sayısı
 * taşıyor: 0 bugünün dönemi, -1 bir öncesi. Tarih yerine sayı tutulması dönem
 * başlangıç günü değiştiğinde ekranın kaymamasını sağlıyor.
 */
export function DonemGezinti({
  donem,
  kaydirma,
  onDegis,
}: {
  donem: Donem;
  kaydirma: number;
  onDegis: (kaydirma: number) => void;
}) {
  return (
    <div className={s.donem}>
      <Dugme tur="sade" ikon={<ChevronLeft size={16} />} onClick={() => onDegis(kaydirma - 1)} aria-label="Önceki dönem" />
      <span className={s.donemAd}>{donemEtiketi(donem)}</span>
      <Dugme tur="sade" ikon={<ChevronRight size={16} />} onClick={() => onDegis(kaydirma + 1)} aria-label="Sonraki dönem" />
      {kaydirma !== 0 && (
        <Dugme tur="sade" onClick={() => onDegis(0)}>
          Bugün
        </Dugme>
      )}
    </div>
  );
}
