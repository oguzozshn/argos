import { AlertTriangle } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { moduller } from "@/modules";
import { ekranGecisi } from "@/ui/hareket";
import { ToastAlani, bildir } from "@/ui/toast";
import { KOPRU_VAR, kopru, useOrtam } from "@/veri/kanca";
import { BaslikCubugu } from "./BaslikCubugu";
import { Bugun } from "./Bugun";
import { HataSiniri } from "./HataSiniri";
import { KenarCubugu } from "./KenarCubugu";
import s from "./kabuk.module.css";

/** Ekran değişiminde solma + kayma — kural 1. */
function Yonlendirme() {
  const konum = useLocation();
  // Düşen ekranın adı söylensin; Bugün ekranında ad yok, genel metin kalır.
  const modulAdi = moduller.find((m) => m.id === konum.pathname.split("/")[1])?.ad;
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
        <HataSiniri key={konum.pathname} ad={modulAdi}>
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
        </HataSiniri>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Telegram'dan gelen eklemeler plana işlenince söylenir. Dosyalar ana
 * süreçte yazılıyor; açık ekranlar izleyiciden haber alıp kendini tazeliyor.
 *
 * Adlar ana süreçte birikir ve yalnızca pencere görünürken alınır: tepsideki
 * pencerede gösterilen bildirim kimse görmeden kaybolurdu.
 */
function useTelegramBildirimi(): void {
  useEffect(() => {
    const k = kopru();
    if (!k) return;
    const al = async () => {
      if (document.visibilityState !== "visible") return;
      const eklenenler = await k.botAl();
      if (eklenenler.length === 0) return;
      const ilk = eklenenler.slice(0, 2).join(", ");
      const fazla = eklenenler.length > 2 ? ` ve ${eklenenler.length - 2} tane daha` : "";
      bildir({ metin: `Telegram'dan eklendi: ${ilk}${fazla}`, sure: 8000 });
    };
    void al();
    document.addEventListener("visibilitychange", al);
    const birak = k.botAktarildiDinle(() => void al());
    return () => {
      document.removeEventListener("visibilitychange", al);
      birak();
    };
  }, []);
}

function Icerik() {
  useTelegramBildirimi();
  const [kaydirildi, setKaydirildi] = useState(false);
  const [ortam, setOrtam] = useOrtam();
  const [secimHatasi, setSecimHatasi] = useState<string | null>(null);

  const klasorSec = async () => {
    const k = kopru();
    if (!k) return;
    let yeni: Awaited<ReturnType<typeof k.klasorSec>>;
    try {
      yeni = await k.klasorSec();
    } catch (e) {
      // Ayar dosyası kilitliyse seçim kaydedilmedi; sessiz kalırsa kullanıcı seçtim sanır.
      setSecimHatasi(`Seçim kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setSecimHatasi(null);
    if (!yeni) return;
    // Açık ekranlar eski (ya da olmayan) klasörden okudu; izleyici yeni
    // klasörde `ignoreInitial` ile başladığı için kendiliğinden tazelenmezler.
    if (yeni.dataDirVar && !yeni.ayarUyarisi) {
      window.location.reload();
      return;
    }
    setOrtam(yeni);
  };

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
              Veri klasörü bulunamadı: <span className={s.seritYol}>{ortam.dataDir}</span>.
              {/* Elle dosya yerleştirmek tek çare olmasın: klasör buradan seçilir. */}
              <button type="button" className={s.seritDugme} onClick={() => void klasorSec()}>
                Klasör seç
              </button>
              <span className={s.seritIkincil}>
                Seçim <span className={s.seritYol}>{ortam.ayarYolu}</span> dosyasına yazılır.
              </span>
              {/* Nereye bakıldığı da yazılıyor: "bulunamadı" tek başına
                  neyin yanlış gittiğini söylemiyor. */}
              <span className={s.seritArananlar}>
                {ortam.arananYollar.map((y) => (
                  <span key={y.yol}>
                    {y.bulundu ? "VAR" : "yok"} — {y.yol}
                  </span>
                ))}
              </span>
            </span>
          </div>
        )}
        {secimHatasi && (
          <div className={s.serit}>
            <AlertTriangle size={16} strokeWidth={2} />
            <span>{secimHatasi}</span>
          </div>
        )}
        {ortam?.ayarUyarisi && (
          <div className={s.serit}>
            <AlertTriangle size={16} strokeWidth={2} />
            <span>{ortam.ayarUyarisi}</span>
          </div>
        )}
        <Yonlendirme />
      </main>
      <ToastAlani />
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
