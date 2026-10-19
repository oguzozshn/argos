import { useEffect, useMemo, useRef } from "react";
import { VARSAYILAN_ODAK, gecenSn, gosterSn, hedefSn, oran, sayacMetni, type OdakAyarlari, type OdakDurumu } from "@ortak/odak";
import type { Kurallar } from "@ortak/ozet";
import { useDosya } from "@/veri/kanca";
import { kopru } from "@/veri/kanca";
import { odakBaslat, odakDuraklat, useOdak } from "./odak-store";

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

/** The phase as the Odak screen names it. */
export function fazAdi(d: OdakDurumu, k: OdakAyarlari): string {
  if (d.mod === "kronometre") return "kronometre";
  if (d.faz === "mola") return d.tur % k.uzunMolaHerKacTur === 0 ? "uzun mola" : "kısa mola";
  return `çalışma · tur ${d.tur + 1}`;
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

      // The floating mini window shows this; the main process drops it while that is closed.
      const o = useOdak.getState();
      kopru()?.odakMini.durumGonder({
        sayac: sayacMetni(gosterSn(o.d, ayar, simdi)),
        faz: fazAdi(o.d, ayar),
        mola: o.d.faz === "mola",
        calisiyor: o.d.calisiyor,
        doldu: o.d.doldu,
        oran: oran(o.d, ayar, simdi),
        konu: o.odakMetin,
      });

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
    // The mini window's buttons.
    const birak = kopru()?.odakMini.komutDinle((k) => {
      if (k === "baslat") odakBaslat();
      else if (k === "duraklat") odakDuraklat();
      else location.hash = "#/asistan/odak";
      bak();
    });
    return () => {
      window.clearInterval(t);
      birak?.();
      void kopru()?.odakTepsi(null);
    };
  }, [ayar]);

  return null;
}
