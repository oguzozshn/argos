import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { gecisEgrisi } from "@/ui/hareket";
import { tusMetni, useKisayolDeposu, type KisayolKaydi } from "@/ui/kisayol";
import s from "./kisayolYardimi.module.css";

/**
 * "?" ile açılan kısayol listesi. O an geçerli olanları gösterir: genel
 * kısayollar ve açık ekranın kaydettikleri. Aynı tuş iki kez kayıtlıysa
 * yalnızca kazanan (son kaydeden) görünür.
 */
export function KisayolYardimi({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  return <AnimatePresence>{acik && <Liste kapat={kapat} />}</AnimatePresence>;
}

const SABITLER: Pick<KisayolKaydi, "tus" | "aciklama">[] = [{ tus: "Ctrl K", aciklama: "Komut paleti" }];

function Liste({ kapat }: { kapat: () => void }) {
  const kayitlar = useKisayolDeposu((d) => d.kayitlar);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        kapat();
      }
    };
    window.addEventListener("keydown", tus, true);
    return () => window.removeEventListener("keydown", tus, true);
  }, [kapat]);

  const gecerli = kayitlar.filter((k, i) => !kayitlar.slice(i + 1).some((x) => x.tus === k.tus));
  const gruplar = new Map<string, Pick<KisayolKaydi, "tus" | "aciklama">[]>([["Genel", [...SABITLER]]]);
  for (const k of gecerli) gruplar.set(k.grup, [...(gruplar.get(k.grup) ?? []), k]);

  return (
    <motion.div
      className={s.perde}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: gecisEgrisi }}
      exit={{ opacity: 0, transition: { ...gecisEgrisi, duration: 0.1 } }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) kapat();
      }}
    >
      <motion.div
        className={s.kutu}
        role="dialog"
        aria-label="Klavye kısayolları"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0, transition: gecisEgrisi }}
        exit={{ opacity: 0, y: -4, transition: { ...gecisEgrisi, duration: 0.1 } }}
      >
        <div className={s.baslik}>Klavye kısayolları</div>
        {[...gruplar].map(([grup, liste]) => (
          <section key={grup} className={s.grup}>
            <h3 className={s.grupAd}>{grup}</h3>
            {liste.map((k) => (
              <div key={`${grup}-${k.tus}`} className={s.satir}>
                <span>{k.aciklama}</span>
                <kbd className={s.tus}>{tusMetni(k.tus)}</kbd>
              </div>
            ))}
          </section>
        ))}
        <div className={s.not}>Yazı yazarken tek tuşlu kısayollar çalışmaz.</div>
      </motion.div>
    </motion.div>
  );
}
