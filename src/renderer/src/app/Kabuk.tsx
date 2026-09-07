import { AlertTriangle } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { moduller } from "@/modules";
import { ekranGecisi } from "@/ui/hareket";
import { KOPRU_VAR, useOrtam } from "@/veri/kanca";
import { BaslikCubugu } from "./BaslikCubugu";
import { Bugun } from "./Bugun";
import { KenarCubugu } from "./KenarCubugu";
import s from "./kabuk.module.css";

/** Ekran değişiminde solma + kayma — kural 1. */
function Yonlendirme() {
  const konum = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={konum.pathname}
        variants={ekranGecisi}
        initial="giris"
        animate="duruyor"
        exit="cikis"
        className={s.icerikIc}
      >
        <Routes location={konum}>
          <Route path="/" element={<Bugun />} />
          {moduller.map((m) =>
            m.rotalar.map((r) => (
              <Route key={`${m.id}/${r.yol}`} path={`/${m.id}/${r.yol}`} element={<r.Ekran />} />
            )),
          )}
          {/* Modülün köküne gelinirse ilk rotasına gönder. Rotasız modül atlanır. */}
          {moduller
            .filter((m) => m.rotalar.length > 0)
            .map((m) => (
              <Route
                key={`${m.id}-kok`}
                path={`/${m.id}`}
                element={<Navigate to={`/${m.id}/${m.rotalar[0]!.yol}`} replace />}
              />
            ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function Icerik() {
  const [kaydirildi, setKaydirildi] = useState(false);
  const ortam = useOrtam();

  return (
    <div className={s.kabuk}>
      <BaslikCubugu kaydirildi={kaydirildi} />
      <KenarCubugu />
      <main className={s.icerik} onScroll={(e) => setKaydirildi(e.currentTarget.scrollTop > 4)}>
        {/* Preload yüklenmediyse hiçbir veri gelmez; beyaz ekran yerine sebep. */}
        {!KOPRU_VAR && (
          <div className={s.serit}>
            <AlertTriangle size={16} strokeWidth={2} />
            <span>
              Uygulama köprüsü yüklenmedi — veri okunamıyor. Sayfa Electron dışında açıldıysa
              beklenen durum budur.
            </span>
          </div>
        )}

        {/* Yanlış yol sessizce boş ekran üretmesin — sebebi söylenir. */}
        {ortam && !ortam.dataDirVar && (
          <div className={s.serit}>
            <AlertTriangle size={16} strokeWidth={2} />
            <span>
              Veri klasörü bulunamadı: <span className={s.seritYol}>{ortam.dataDir}</span> — yolu{" "}
              <span className={s.seritYol}>{ortam.ayarYolu}</span> dosyasına{" "}
              <span className={s.seritYol}>{`{"dataDir": "..."}`}</span> olarak yaz.
            </span>
          </div>
        )}
        <Yonlendirme />
      </main>
    </div>
  );
}

export function Kabuk() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Icerik />
      </HashRouter>
    </MotionConfig>
  );
}
