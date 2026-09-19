import { useKisayol } from "./kisayol";

export interface KisayolTanimi {
  tus: string;
  aciklama: string;
  /** null ise kayıt yok (ör. ilk haftada "önceki"). */
  eylem: (() => void) | null | undefined;
}

function Kisayol({ grup, tanim }: { grup: string; tanim: KisayolTanimi }) {
  useKisayol(tanim.tus, tanim.aciklama, grup, tanim.eylem);
  return null;
}

/**
 * Ekranın kısayollarını JSX içinden kaydeder. Hook yerine bileşen: ekranların
 * çoğu veri gelene dek erken dönüyor, kısayollar ancak veriyle anlamlı.
 */
export function Kisayollar({ grup, liste }: { grup: string; liste: KisayolTanimi[] }) {
  return (
    <>
      {liste.map((t) => (
        <Kisayol key={t.tus} grup={grup} tanim={t} />
      ))}
    </>
  );
}
