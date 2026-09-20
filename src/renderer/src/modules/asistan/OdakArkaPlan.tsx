import { useEffect, useMemo, useRef } from "react";
import { VARSAYILAN_ODAK, gecenSn, gosterSn, hedefSn, sayacMetni } from "@ortak/odak";
import type { Kurallar } from "@ortak/ozet";
import { useDosya } from "@/veri/kanca";
import { kopru } from "@/veri/kanca";
import { useOdak } from "./odak-store";

/**
 * Odak sayacının ekrandan bağımsız parçası: süre dolunca fazı çevirir,
 * bildirim ve ses verir, tepsi ipucuna kalan süreyi yazar.
 *
 * Kabuk bunu her ekranda çalıştırıyor (`Modul.ArkaPlan`). Önceden yalnızca
 * Odak ekranı açıkken çalışıyordu: başka ekrandayken ya da pencere tepsideyken
 * pomodoro sessizce doluyordu.
 */

const TEPSI_ARALIK_MS = 15_000;

/** Kısa iki ton. Dosya yok: ses kartı yoksa ya da tarayıcı izin vermezse sessiz kalır. */
function cal(): void {
  try {
    const AC = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const simdi = ctx.currentTime;
    for (const [i, hz] of [880, 660].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, simdi + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.18, simdi + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, simdi + i * 0.22 + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(simdi + i * 0.22);
      o.stop(simdi + i * 0.22 + 0.2);
    }
    setTimeout(() => void ctx.close().catch(() => undefined), 1200);
  } catch {
    // Ses çalınamadıysa bildirim yine çıkar.
  }
}

export function OdakArkaPlan() {
  const { veri: kurallar } = useDosya<Kurallar>("kurallar.json");
  const ayar = useMemo(() => ({ ...VARSAYILAN_ODAK, ...kurallar?.odak }), [kurallar]);
  const sonTepsi = useRef({ zaman: 0, metin: "" });

  useEffect(() => {
    const bak = () => {
      const { d, setD, setOlay } = useOdak.getState();
      const simdi = Date.now();
      const hedef = hedefSn(d, ayar);
      const gecen = gecenSn(d, simdi);

      // Hedef doldu: molada faz kendiliğinden biter, çalışmada sayaç fazla mesaiye geçer.
      if (hedef !== null && !d.doldu && gecen >= hedef) {
        if (d.faz === "mola") {
          if (d.calisiyor) {
            setD((x) => ({ ...x, calisiyor: false, basladi: null, gecen: 0, doldu: false, faz: "calisma" }));
            setOlay("Mola bitti.");
            cal();
            void kopru()?.bildirimGoster("Mola bitti", "Odağa dönme zamanı.");
          }
        } else {
          setD((x) => ({ ...x, doldu: true }));
          setOlay("Hedef doldu — sayaç fazla mesaiye geçti.");
          cal();
          void kopru()?.bildirimGoster(
            "Odak süresi doldu",
            `${ayar.pomodoroDk} dk bitti. Mola ver ya da sayacı bitir.`,
          );
        }
      }

      // Tepsi ipucu: her saniye değil, 15 saniyede bir ve durum değişince.
      const metin = d.calisiyor
        ? `${d.faz === "mola" ? "mola" : "odak"} ${sayacMetni(gosterSn(useOdak.getState().d, ayar, simdi))}`
        : "";
      const degisti = metin === "" ? sonTepsi.current.metin !== "" : simdi - sonTepsi.current.zaman >= TEPSI_ARALIK_MS;
      if (degisti) {
        sonTepsi.current = { zaman: simdi, metin };
        void kopru()?.odakTepsi(metin || null);
      }
    };

    const t = window.setInterval(bak, 1000);
    bak();
    return () => {
      window.clearInterval(t);
      void kopru()?.odakTepsi(null);
    };
  }, [ayar]);

  return null;
}
