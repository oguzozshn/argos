import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { dakika } from "@ortak/kural";
import { VARSAYILAN_ODAK, gosterSn, sayacMetni } from "@ortak/odak";
import type { Kurallar } from "@ortak/ozet";
import { DURUM_ISARETI, bugunIso, hatirlaBugun, type Hafta, type Slot } from "@ortak/plan";
import { aliskanlikBekleniyor, aliskanlikCevir, simdiVeSiradaki, slotDurumunuDondur } from "@ortak/plan-islem";
import { Dugme, Kart } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { useGuncelHafta, useHatirla } from "./kanca";
import { odakBaslat, odakDuraklat, useOdak } from "./odak-store";
import s from "./asistan.module.css";

/**
 * Bugün panosundaki Asistan kartları:
 *  - Şimdi: şu anki ya da sıradaki slot ve mini odak sayacı.
 *  - Bugünün planı: slot durumu ve alışkanlıklar tek tıkla işaretlenir.
 *  - Aklında tut.
 *
 * İşaretleme Hafta ekranıyla aynı: yalnızca hafta dosyasındaki durum değişir;
 * süre, roadmap adımı ve Todoist'e dokunulmaz (kullanıcı kararı, 2026-09-19).
 */

const BICIM: Record<string, string> = {
  planli: s.planli,
  yapildi: s.yapildi,
  kacti: s.kacti,
  tasindi: s.tasindi,
};

/** Saniyede bir tazelenen saat; sayaç ve "kaldı" metni için. */
function useSimdi(): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setSimdi(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return simdi;
}

function dkMetni(dk: number): string {
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  return dk % 60 ? `${sa} sa ${dk % 60} dk` : `${sa} sa`;
}

const slotAdi = (x: Slot): string => (x.konu ? `${x.alan} — ${x.konu}` : x.alan);

/* --- şimdi ----------------------------------------------------------------- */

function SimdiKarti({ slotlar, kurallar }: { slotlar: Slot[]; kurallar: Kurallar | null }) {
  const simdi = useSimdi();
  const d = useOdak((o) => o.d);
  const odakSlot = useOdak((o) => o.odakSlot);
  const ayar = useMemo(() => ({ ...VARSAYILAN_ODAK, ...kurallar?.odak }), [kurallar]);

  const t = new Date(simdi);
  const simdiDk = t.getHours() * 60 + t.getMinutes();
  const { simdi: suAn, siradaki } = simdiVeSiradaki(slotlar, simdiDk);
  const bagli = slotlar.find((x) => x.id === odakSlot) ?? null;
  const baslamadi = !d.calisiyor && d.gecen === 0;

  return (
    <Kart dolgulu={false} className={s.genis}>
      <div className={s.simdi}>
        <div className={s.simdiSol}>
          {suAn ? (
            <>
              <span className={s.simdiEtiket}>Şimdi</span>
              <span className={s.simdiSlot}>
                <span className={s.saat}>{suAn.saat}</span> {slotAdi(suAn)}
              </span>
              <span className={s.simdiAlt}>
                {dkMetni(dakika(suAn.saat) + suAn.sureDk - simdiDk)} kaldı
                {siradaki ? ` · sıradaki ${siradaki.saat} ${siradaki.konu || siradaki.alan}` : ""}
              </span>
            </>
          ) : siradaki ? (
            <>
              <span className={s.simdiEtiket}>Sıradaki</span>
              <span className={s.simdiSlot}>
                <span className={s.saat}>{siradaki.saat}</span> {slotAdi(siradaki)}
              </span>
              <span className={s.simdiAlt}>{dkMetni(dakika(siradaki.saat) - simdiDk)} sonra</span>
            </>
          ) : (
            <>
              <span className={s.simdiEtiket}>Şimdi</span>
              <span className={s.simdiSlot}>Bugün için planlı slot kalmadı.</span>
            </>
          )}
        </div>

        <div className={s.simdiSag}>
          <div className={s.miniSayac}>
            <span className={s.miniRakam}>{sayacMetni(gosterSn(d, ayar, simdi))}</span>
            <span className={s.simdiAlt}>
              {d.calisiyor ? (d.faz === "mola" ? "mola" : "odak") : baslamadi ? "odak sayacı" : "duraklatıldı"}
              {bagli ? ` · ${bagli.konu || bagli.alan}` : ""}
            </span>
          </div>
          {d.calisiyor ? (
            <Dugme tur="cizgili" ikon={<Pause size={15} />} onClick={odakDuraklat}>
              Duraklat
            </Dugme>
          ) : suAn && baslamadi ? (
            <Dugme tur="dolu" ikon={<Play size={15} />} onClick={() => odakBaslat(suAn.id)}>
              Bu slotla başlat
            </Dugme>
          ) : (
            <Dugme tur="dolu" ikon={<Play size={15} />} onClick={() => odakBaslat()}>
              {baslamadi ? "Başlat" : "Devam"}
            </Dugme>
          )}
          <Link to="/asistan/odak" className={s.simdiBag}>
            Odak →
          </Link>
        </div>
      </div>
    </Kart>
  );
}

/* --- plan ------------------------------------------------------------------ */

function PlanKarti({ veri, yaz, gunNo, gunAdi, simdiId }: {
  veri: Hafta;
  yaz: (h: Hafta) => Promise<boolean>;
  gunNo: number;
  gunAdi: string;
  simdiId: string | null;
}) {
  const slotlar = veri.slotlar.filter((x) => x.gun === gunNo).sort((a, b) => a.saat.localeCompare(b.saat));
  const aliskanliklar = (veri.gunlukAliskanliklar ?? []).filter((a) => aliskanlikBekleniyor(a, gunNo));
  const yapilan = slotlar.filter((x) => x.durum === "yapildi").length;

  return (
    <Kart
      dolgulu={false}
      baslik="Bugünün planı"
      not={
        <>
          {veri.baslik || `Hafta ${veri.hafta}`} · {gunAdi}
          {slotlar.length > 0 && ` · ${yapilan}/${slotlar.length}`} · <Link to="/asistan">Hafta →</Link>
        </>
      }
    >
      {slotlar.length === 0 ? (
        <p className={s.dipNot} style={{ borderTop: "none" }}>
          Bugüne slot konmamış.
        </p>
      ) : (
        slotlar.map((x) => (
          <div key={x.id} className={x.id === simdiId ? `${s.slot} ${s.slotSimdi}` : s.slot}>
            <span className={s.saat}>{x.saat}</span>
            <button
              type="button"
              className={`${s.isaret} ${s.isaretDugme} ${BICIM[x.durum] ?? s.planli}`}
              onClick={() => void yaz(slotDurumunuDondur(veri, x.id))}
              title="Durumu değiştir: planlı → yapıldı → kaçtı"
              aria-label={`${slotAdi(x)}: durumu değiştir`}
            >
              {DURUM_ISARETI[x.durum] ?? "☐"}
            </button>
            <span className={s.govde}>
              <span className={s.alan}>{x.alan}</span>
              <span className={s.konu}>{x.konu}</span>
            </span>
            <span className={s.sure}>{x.sureDk} dk</span>
          </div>
        ))
      )}

      {aliskanliklar.length > 0 && (
        <div className={s.aliskanlikSatiri}>
          {aliskanliklar.map((a) => {
            const yapildi = Boolean((a.gunler ?? {})[String(gunNo)]);
            return (
              <button
                key={a.ad}
                type="button"
                className={yapildi ? `${s.aliskanlikCip} ${s.aliskanlikYapildi}` : s.aliskanlikCip}
                onClick={() => void yaz(aliskanlikCevir(veri, a.ad, gunNo))}
                aria-pressed={yapildi}
              >
                {yapildi ? "☑" : "☐"} {a.ad}
              </button>
            );
          })}
        </div>
      )}
    </Kart>
  );
}

/**
 * Bu haftanın dosyası `useDosya` ile açılır: işaretleme damgalı yazılır,
 * dışarıdan gelen değişiklik (Hafta ekranı, app.py, Telegram) kartı tazeler.
 */
function BuHafta({ kod }: { kod: string }) {
  const { veri, yaz } = useDosya<Hafta>(`${kod}.json`);
  const { veri: kurallar } = useDosya<Kurallar>("kurallar.json");
  const simdi = useSimdi();

  const bugun = bugunIso();
  const gun = veri?.gunler.find((g) => g.isoTarih === bugun) ?? null;
  // Bugün bu haftanın içinde değilse (arada boş hafta varsa) kartlar görünmez.
  if (!veri || !gun) return null;

  const slotlar = veri.slotlar.filter((x) => x.gun === gun.no);
  const t = new Date(simdi);
  const simdiId = simdiVeSiradaki(slotlar, t.getHours() * 60 + t.getMinutes()).simdi?.id ?? null;

  return (
    <>
      <SimdiKarti slotlar={slotlar} kurallar={kurallar} />
      <PlanKarti veri={veri} yaz={yaz} gunNo={gun.no} gunAdi={gun.ad} simdiId={simdiId} />
    </>
  );
}

function AklindaTut() {
  const { maddeler, gunlukAdet, yukleniyor } = useHatirla();
  const bugun = useMemo(() => hatirlaBugun(maddeler, gunlukAdet), [maddeler, gunlukAdet]);

  if (yukleniyor || bugun.length === 0) return null;

  return (
    <Kart dolgulu={false} baslik="Bugün aklında tut" not="seçim her gün kayar">
      {bugun.map((m) => (
        <div key={m.id} className={s.hatirla}>
          {m.metin}
          <span className={s.hatirlaTarih}>{m.eklendi}</span>
        </div>
      ))}
    </Kart>
  );
}

export function AsistanOzet() {
  const { kod } = useGuncelHafta();
  return (
    <>
      {kod && <BuHafta key={kod} kod={kod} />}
      <AklindaTut />
    </>
  );
}
