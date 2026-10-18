import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KartAyari } from "@ortak/bugun-duzen";
import { VARSAYILAN_ODAK, gosterSn, oran, sayacMetni } from "@ortak/odak";
import { zamanOzet, type Kurallar } from "@ortak/ozet";
import type { KartSecenegi, KartTuru } from "@/modules";
import { Dugme, Etiket, Kart, Satir } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { saatMetni, usePlanVerisi } from "@/veri/plan";
import { odakBaslat, odakDuraklat, useOdak } from "./odak-store";
import s from "./asistan.module.css";

/**
 * Asistan's cards for Bugün besides the plan: the focus timer, and Arşiv's
 * time breakdown for this week, month or year.
 */

/* --- Odak ------------------------------------------------------------------------- */

function OdakKarti() {
  const d = useOdak((o) => o.d);
  const odakMetin = useOdak((o) => o.odakMetin);
  const { veri: kurallar } = useDosya<Kurallar>("kurallar.json");
  const ayar = useMemo(() => ({ ...VARSAYILAN_ODAK, ...kurallar?.odak }), [kurallar]);
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    if (!d.calisiyor) return;
    const t = window.setInterval(() => setSimdi(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [d.calisiyor]);

  const an = d.calisiyor ? simdi : Date.now();
  const baslamadi = !d.calisiyor && d.gecen === 0;
  const doluluk = oran(d, ayar, an);
  const durum = d.calisiyor
    ? d.faz === "mola"
      ? "mola"
      : d.mod === "kronometre"
        ? "kronometre"
        : `pomodoro · ${d.tur + 1}. tur`
    : baslamadi
      ? d.mod === "kronometre"
        ? "kronometre"
        : `pomodoro · ${ayar.pomodoroDk} dk`
      : "duraklatıldı";

  return (
    <Kart dolgulu={false} baslik="Odak" not={odakMetin || undefined} git={{ yol: "/asistan/odak", metin: "Odak" }}>
      <div className={s.odakKart}>
        <span className={s.odakKartRakam}>{sayacMetni(gosterSn(d, ayar, an))}</span>
        <span className={s.simdiAlt}>{durum}</span>
        {d.mod !== "kronometre" && (
          <span className={s.odakKartCubuk}>
            <span
              className={d.faz === "mola" ? `${s.odakKartDolgu} ${s.odakKartMola}` : s.odakKartDolgu}
              style={{ width: `${Math.round(doluluk * 100)}%` }}
            />
          </span>
        )}
        {d.calisiyor ? (
          <Dugme tur="cizgili" ikon={<Pause size={15} />} onClick={odakDuraklat}>
            Duraklat
          </Dugme>
        ) : (
          <Dugme tur="dolu" ikon={<Play size={15} />} onClick={() => odakBaslat()}>
            {baslamadi ? "Başlat" : "Devam"}
          </Dugme>
        )}
      </div>
    </Kart>
  );
}

/* --- Arşiv ------------------------------------------------------------------------ */

const KAPSAMLAR: KartSecenegi[] = [
  { deger: "hafta", ad: "Haftalık" },
  { deger: "ay", ad: "Aylık" },
  { deger: "yil", ad: "Yıllık" },
];

const KAPSAM_BASLIK: Record<string, string> = { hafta: "bu hafta", ay: "bu ay", yil: "bu yıl" };

/** Areas shown before the rest are summed up. */
const ALAN_SAYISI = 5;

function ArsivKarti({ ayar }: { ayar: KartAyari }) {
  const kapsam = KAPSAMLAR.some((k) => k.deger === ayar.kapsam) ? ayar.kapsam! : "hafta";
  const { haftalar, bugun, yukleniyor } = usePlanVerisi();
  const zaman = useMemo(() => zamanOzet(haftalar, kapsam, bugun, bugun), [haftalar, kapsam, bugun]);
  if (yukleniyor || haftalar.length === 0) return null;

  const enBuyuk = Math.max(1, ...zaman.dizi.map((x) => x.dk));
  const kalan = zaman.alanlar.slice(ALAN_SAYISI);
  return (
    <Kart dolgulu={false} baslik={`Arşiv · ${KAPSAM_BASLIK[kapsam]}`} not={saatMetni(zaman.toplamDk)} git={{ yol: "/asistan/arsiv", metin: "Arşiv" }}>
      {zaman.dizi.length > 0 && (
        <div className={s.cubuklar}>
          {zaman.dizi.map((x) => (
            <div key={x.anahtar} className={s.cubukSutun} title={`${x.etiket}: ${saatMetni(x.dk)}`}>
              <div className={s.cubukYuva}>
                <div className={s.cubuk} style={{ height: `${x.dk ? Math.max(3, (x.dk / enBuyuk) * 100) : 0}%` }} />
              </div>
              <span className={s.cubukEtiket}>{x.etiket}</span>
            </div>
          ))}
        </div>
      )}
      {zaman.alanlar.length === 0 ? (
        <p className={s.dipNot} style={{ borderTop: "none" }}>
          Bu aralıkta kayıt yok.
        </p>
      ) : (
        <>
          {zaman.alanlar.slice(0, ALAN_SAYISI).map((a) => (
            <Satir
              key={a.alan}
              baslik={a.alan}
              sag={
                <>
                  <span className={s.oran}>%{a.oran}</span>
                  <Etiket>{saatMetni(a.dk)}</Etiket>
                </>
              }
            />
          ))}
          {kalan.length > 0 && (
            <p className={s.dipNot}>
              {kalan.length} alan daha · {saatMetni(kalan.reduce((t, a) => t + a.dk, 0))}
            </p>
          )}
        </>
      )}
    </Kart>
  );
}

export const asistanKartlari: KartTuru[] = [
  { id: "odak", ad: "Odak sayacı", Bilesen: OdakKarti, w: 3, h: 9 },
  {
    id: "arsiv",
    ad: "Arşiv (hafta, ay, yıl)",
    Bilesen: ArsivKarti,
    ayarlar: [{ anahtar: "kapsam", ad: "Dönem", useSecenekler: () => KAPSAMLAR }],
    w: 5,
    h: 12,
  },
];
