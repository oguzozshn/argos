import { Monitor, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { moduller } from "@/modules";
import { Dugme } from "@/ui/bilesenler";
import { useTema } from "@/ui/tema";
import s from "./kabuk.module.css";

/** Bulunulan yerin adı: "Argos / Hobiler / Oyunlar". */
function kirinti(pathname: string): string[] {
  const [, modulId, rotaYolu = ""] = pathname.split("/");
  const modul = moduller.find((m) => m.id === modulId);
  if (!modul) return ["Bugün"];
  const rota = modul.rotalar.find((r) => r.yol === rotaYolu);
  return modul.rotalar.length > 1 && rota ? [modul.ad, rota.ad] : [modul.ad];
}

const TEMA_ADI = { sistem: "Sistem teması", acik: "Açık tema", koyu: "Koyu tema" } as const;

export function BaslikCubugu({ kaydirildi }: { kaydirildi: boolean }) {
  const { pathname } = useLocation();
  const { tercih, sonraki } = useTema();
  const parcalar = kirinti(pathname);
  const Ikon = tercih === "sistem" ? Monitor : tercih === "acik" ? Sun : Moon;

  return (
    <header className={kaydirildi ? `${s.baslikCubugu} ${s.baslikCizgili}` : s.baslikCubugu}>
      <span className={s.marka}>Argos</span>
      <span className={s.kirintiAyrac}>/</span>
      <span className={s.kirinti}>
        {parcalar.map((p, i) => (
          <span key={p} style={{ display: "contents" }}>
            {i > 0 && <span className={s.kirintiAyrac}>/</span>}
            <span>{p}</span>
          </span>
        ))}
      </span>

      <div className={s.baslikSag}>
        <Dugme
          tur="sade"
          onClick={sonraki}
          title={`${TEMA_ADI[tercih]} — değiştirmek için tıkla`}
          aria-label={TEMA_ADI[tercih]}
          ikon={<Ikon size={16} strokeWidth={1.9} />}
        />
      </div>
    </header>
  );
}
