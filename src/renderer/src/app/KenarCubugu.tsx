import { AnimatePresence, motion } from "motion/react";
import { Home } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { moduller, type Modul } from "@/modules";
import { kayanGosterge } from "@/ui/hareket";
import { useOrtam } from "@/veri/kanca";
import s from "./kabuk.module.css";

/** Aktif maddenin arkasında kayan tek kutu — kural 2. */
function Gosterge() {
  return <motion.span layoutId="kenar-gosterge" className={s.gosterge} transition={kayanGosterge} />;
}

function ModulBagi({ modul, etkin }: { modul: Modul; etkin: boolean }) {
  const Ikon = modul.ikon;
  const ilk = modul.rotalar[0];
  return (
    <>
      <NavLink
        to={`/${modul.id}/${ilk?.yol ?? ""}`}
        className={etkin ? `${s.bag} ${s.bagEtkin}` : s.bag}
      >
        {etkin && <Gosterge />}
        <span className={s.bagIkon}>
          <Ikon size={17} strokeWidth={1.9} />
        </span>
        <span className={s.bagMetin}>{modul.ad}</span>
      </NavLink>

      {/* Alt rotalar yalnızca modül açıkken görünür — kenar çubuğu kalabalıklaşmasın. */}
      <AnimatePresence initial={false}>
        {etkin && modul.rotalar.length > 1 && (
          <motion.div
            className={s.altListe}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {modul.rotalar.map((r) => (
              <NavLink
                key={r.yol}
                to={`/${modul.id}/${r.yol}`}
                className={({ isActive }) => (isActive ? `${s.altBag} ${s.altBagEtkin}` : s.altBag)}
                end
              >
                {r.ad}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function KenarCubugu() {
  const { pathname } = useLocation();
  const [ortam] = useOrtam();
  const acikModul = pathname.split("/")[1] ?? "";
  const gezilebilir = moduller.filter((m) => m.rotalar.length > 0);

  return (
    <nav className={s.kenar} aria-label="Modüller">
      <NavLink to="/" className={pathname === "/" ? `${s.bag} ${s.bagEtkin}` : s.bag}>
        {pathname === "/" && <Gosterge />}
        <span className={s.bagIkon}>
          <Home size={17} strokeWidth={1.9} />
        </span>
        <span className={s.bagMetin}>Bugün</span>
      </NavLink>

      {/* Rotasız modül yalnızca Bugün kartı verir; gezinmede yeri yok. */}
      {gezilebilir.length > 0 && <p className={s.kenarBolum}>Modüller</p>}
      {gezilebilir.map((m) => (
        <ModulBagi key={m.id} modul={m} etkin={acikModul === m.id} />
      ))}

      <div className={s.kenarDip}>
        <span>Veri klasörü</span>
        <span className={s.kenarDipYol} title={ortam?.dataDir}>
          {ortam?.dataDir ?? "…"}
        </span>
      </div>
    </nav>
  );
}
