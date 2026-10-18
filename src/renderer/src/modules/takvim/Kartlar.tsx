import { useEffect, useMemo, useState } from "react";
import type { KartAyari } from "@ortak/bugun-duzen";
import { AY_ADLARI, AY_TAM, GUN_ADLARI, GUN_KISA, ayBasi, gunAl, gunEkle, gunFarki, haftaninGunu, yilAl } from "@ortak/gun";
import type { Slot } from "@ortak/plan";
import type { TodoistGorev } from "@ortak/tipler";
import type { KartSecenegi, KartTuru } from "@/modules";
import { Kart } from "@/ui/bilesenler";
import { usePlanVerisi } from "@/veri/plan";
import { gorevSaati, useTodoistAralik } from "@/veri/todoist";
import s from "./kartlar.module.css";

/**
 * Takvim's cards for Bugün: the calendar at a glance (week, month or year),
 * today's flow, and what is coming. Read-only: plan slots and tasks are
 * edited on the Takvim screen, one click away.
 */

/** Plan slots by ISO date, from the week files. */
function useSlotlar(): Map<string, Slot[]> {
  const { haftalar } = usePlanVerisi();
  return useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const { veri } of haftalar) {
      for (const g of veri.gunler ?? []) {
        if (!g.isoTarih) continue;
        const slotlar = (veri.slotlar ?? []).filter((x) => x.gun === g.no);
        if (slotlar.length) m.set(g.isoTarih, [...(m.get(g.isoTarih) ?? []), ...slotlar]);
      }
    }
    for (const l of m.values()) l.sort((a, b) => a.saat.localeCompare(b.saat));
    return m;
  }, [haftalar]);
}

const slotAdi = (x: Slot): string => (x.konu ? `${x.alan} — ${x.konu}` : x.alan);

/** A day's plan slots and tasks as one list in time order; all-day tasks first. */
interface Oge {
  anahtar: string;
  saat: string | null;
  ad: string;
  tur: "slot" | "gorev";
  bitti?: boolean;
}

function gununOgeleri(slotlar: Slot[] | undefined, gorevler: TodoistGorev[] | undefined): Oge[] {
  const ogeler: Oge[] = [
    ...(slotlar ?? []).map((x) => ({
      anahtar: `s:${x.id}`,
      saat: x.saat,
      ad: slotAdi(x),
      tur: "slot" as const,
      bitti: x.durum === "yapildi",
    })),
    ...(gorevler ?? []).map((g) => ({ anahtar: `g:${g.id}`, saat: gorevSaati(g), ad: g.icerik, tur: "gorev" as const })),
  ];
  return ogeler.sort((a, b) => {
    if (a.saat && b.saat) return a.saat.localeCompare(b.saat);
    if (a.saat) return 1;
    if (b.saat) return -1;
    return 0;
  });
}

function OgeSatiri({ o, gecti }: { o: Oge; gecti?: boolean }) {
  const cls = [s.oge, o.tur === "slot" ? s.ogeSlot : s.ogeGorev, (gecti || o.bitti) && s.ogeGecti].filter(Boolean).join(" ");
  return (
    <div className={cls} title={o.saat ? `${o.saat} · ${o.ad}` : o.ad}>
      <span className={s.ogeSaat}>{o.saat ?? ""}</span>
      <span className={s.ogeAd}>{o.ad}</span>
    </div>
  );
}

/** "Yarın", "Çarşamba", "21 Eki Pzt": a day's heading relative to today. */
function gunBasligi(iso: string, bugun: string): string {
  const fark = gunFarki(iso, bugun);
  if (fark === 0) return "Bugün";
  if (fark === 1) return "Yarın";
  const tarih = `${gunAl(iso)} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`;
  return fark < 7 ? `${GUN_ADLARI[haftaninGunu(iso)]} · ${tarih}` : `${tarih} · ${GUN_KISA[haftaninGunu(iso)]}`;
}

/** The time of day in minutes, refreshed every minute. */
function useDakika(): number {
  const simdi = () => {
    const t = new Date();
    return t.getHours() * 60 + t.getMinutes();
  };
  const [dk, setDk] = useState(simdi);
  useEffect(() => {
    const t = window.setInterval(() => setDk(simdi()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return dk;
}

const saatDk = (saat: string): number => Number(saat.slice(0, 2)) * 60 + Number(saat.slice(3, 5));

const TAKVIM_GIT = { yol: "/takvim/", metin: "Takvim" };

/* --- Takvim: hafta / ay / yıl -------------------------------------------------- */

const GORUNUMLER: KartSecenegi[] = [
  { deger: "hafta", ad: "Haftalık" },
  { deger: "ay", ad: "Aylık" },
  { deger: "yil", ad: "Yıllık" },
];

/** The range a view covers: the week, the month's full weeks, or the year. */
function aralik(gorunum: string, bugun: string): { bas: string; son: string } {
  if (gorunum === "yil") return { bas: `${yilAl(bugun)}-01-01`, son: `${yilAl(bugun)}-12-31` };
  if (gorunum === "ay") {
    const ilk = ayBasi(bugun);
    const bas = gunEkle(ilk, -haftaninGunu(ilk));
    const sonGun = gunEkle(ayBasi(gunEkle(ilk, 31)), -1);
    return { bas, son: gunEkle(sonGun, 6 - haftaninGunu(sonGun)) };
  }
  const bas = gunEkle(bugun, -haftaninGunu(bugun));
  return { bas, son: gunEkle(bas, 6) };
}

const gunlerArasi = (bas: string, son: string): string[] => {
  const gunler: string[] = [];
  for (let g = bas; g <= son; g = gunEkle(g, 1)) gunler.push(g);
  return gunler;
};

function TakvimKarti({ ayar }: { ayar: KartAyari }) {
  const gorunum = GORUNUMLER.some((g) => g.deger === ayar.gorunum) ? ayar.gorunum! : "hafta";
  const { bugun } = usePlanVerisi();
  const { bas, son } = aralik(gorunum, bugun);
  const { gunlere, yukleniyor } = useTodoistAralik(bas, son);
  const slotlar = useSlotlar();
  const gunler = useMemo(() => gunlerArasi(bas, son), [bas, son]);
  if (yukleniyor && gunlere.size === 0) return null;

  const ay = Number(bugun.slice(5, 7));
  const baslik =
    gorunum === "yil"
      ? String(yilAl(bugun))
      : gorunum === "ay"
        ? `${AY_TAM[ay - 1]} ${yilAl(bugun)}`
        : `${gunAl(bas)} ${AY_ADLARI[Number(bas.slice(5, 7)) - 1]} – ${gunAl(son)} ${AY_ADLARI[Number(son.slice(5, 7)) - 1]}`;

  return (
    <Kart dolgulu={false} baslik={baslik} git={TAKVIM_GIT}>
      {gorunum === "hafta" && (
        <div className={s.hafta}>
          {gunler.map((g) => {
            const ogeler = gununOgeleri(slotlar.get(g), gunlere.get(g));
            return (
              <div key={g} className={g === bugun ? `${s.haftaGun} ${s.bugun}` : s.haftaGun}>
                <div className={s.haftaGunAd}>
                  <span>{GUN_KISA[haftaninGunu(g)]}</span>
                  <span className={s.haftaGunNo}>{gunAl(g)}</span>
                </div>
                <div className={s.haftaOgeler}>
                  {ogeler.length === 0 ? <span className={s.bos}>—</span> : ogeler.map((o) => <OgeSatiri key={o.anahtar} o={o} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {gorunum === "ay" && (
        <div className={s.ay}>
          {GUN_KISA.map((g) => (
            <span key={g} className={s.ayBaslik}>
              {g}
            </span>
          ))}
          {gunler.map((g) => {
            const gorev = gunlere.get(g)?.length ?? 0;
            const slot = slotlar.get(g)?.length ?? 0;
            const cls = [s.ayGun, g.slice(5, 7) !== bugun.slice(5, 7) && s.ayDisi, g === bugun && s.bugun].filter(Boolean).join(" ");
            return (
              <div key={g} className={cls} title={[gorev && `${gorev} görev`, slot && `${slot} slot`].filter(Boolean).join(" · ") || undefined}>
                <span className={s.ayGunNo}>{gunAl(g)}</span>
                <span className={s.noktalar}>
                  {Array.from({ length: Math.min(gorev, 3) }, (_, i) => (
                    <span key={`g${i}`} className={s.noktaGorev} />
                  ))}
                  {slot > 0 && <span className={s.noktaSlot} />}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {gorunum === "yil" && (
        <div className={s.yil}>
          {AY_TAM.map((ad, i) => {
            const ilk = `${yilAl(bugun)}-${String(i + 1).padStart(2, "0")}-01`;
            const sonGun = gunEkle(ayBasi(gunEkle(ilk, 31)), -1);
            const gunlerAy = gunlerArasi(ilk, sonGun);
            return (
              <div key={ad} className={s.yilAy}>
                <span className={i + 1 === ay ? `${s.yilAyAd} ${s.yilAyBu}` : s.yilAyAd}>{ad}</span>
                <div className={s.yilIzgara}>
                  {Array.from({ length: haftaninGunu(ilk) }, (_, k) => (
                    <span key={`b${k}`} />
                  ))}
                  {gunlerAy.map((g) => {
                    const n = (gunlere.get(g)?.length ?? 0) + (slotlar.get(g)?.length ?? 0);
                    const seviye = n === 0 ? "" : n === 1 ? s.yogun1 : n <= 3 ? s.yogun2 : s.yogun3;
                    return (
                      <span
                        key={g}
                        className={[s.yilGun, seviye, g === bugun && s.bugun, g < bugun && s.gecmis].filter(Boolean).join(" ")}
                        title={`${gunAl(g)} ${ad}${n ? ` · ${n}` : ""}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Kart>
  );
}

/* --- Bugünün akışı ----------------------------------------------------------------- */

function AkisKarti() {
  const { bugun } = usePlanVerisi();
  const { gunlere, yukleniyor } = useTodoistAralik(bugun, bugun);
  const slotlar = useSlotlar();
  const dk = useDakika();
  if (yukleniyor && gunlere.size === 0) return null;

  const ogeler = gununOgeleri(slotlar.get(bugun), gunlere.get(bugun));
  const gunBoyu = ogeler.filter((o) => !o.saat);
  const saatli = ogeler.filter((o) => o.saat);
  // The "now" line goes before the first item that has not started yet.
  const simdiOnce = saatli.findIndex((o) => saatDk(o.saat!) > dk);
  const cizgiYeri = simdiOnce === -1 ? saatli.length : simdiOnce;
  const simdiCizgisi = (
    <div key="simdi" className={s.simdi}>
      <span>{`${String(Math.floor(dk / 60)).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`}</span>
    </div>
  );

  return (
    <Kart dolgulu={false} baslik="Bugünün akışı" not={GUN_ADLARI[haftaninGunu(bugun)]} git={TAKVIM_GIT}>
      <div className={s.akis}>
        {ogeler.length === 0 && <p className={s.bosMetin}>Bugüne slot ya da görev yok.</p>}
        {gunBoyu.length > 0 && (
          <div className={s.gunBoyu}>
            {gunBoyu.map((o) => (
              <OgeSatiri key={o.anahtar} o={o} />
            ))}
          </div>
        )}
        {saatli.flatMap((o, i) => [
          ...(i === cizgiYeri ? [simdiCizgisi] : []),
          <OgeSatiri key={o.anahtar} o={o} gecti={i < cizgiYeri} />,
        ])}
        {saatli.length > 0 && cizgiYeri === saatli.length && simdiCizgisi}
      </div>
    </Kart>
  );
}

/* --- Yaklaşanlar ----------------------------------------------------------------- */

const UFUKLAR: KartSecenegi[] = [
  { deger: "7", ad: "7 gün" },
  { deger: "14", ad: "14 gün" },
  { deger: "30", ad: "30 gün" },
];

function YaklasanlarKarti({ ayar }: { ayar: KartAyari }) {
  const gun = Number(UFUKLAR.find((u) => u.deger === ayar.gun)?.deger ?? UFUKLAR[0]!.deger);
  const { bugun } = usePlanVerisi();
  const bas = gunEkle(bugun, 1);
  const son = gunEkle(bugun, gun);
  const { gunlere, yukleniyor } = useTodoistAralik(bas, son);
  if (yukleniyor && gunlere.size === 0) return null;

  const gunler = gunlerArasi(bas, son).filter((g) => gunlere.get(g)?.length);

  return (
    <Kart dolgulu={false} baslik={`Önümüzdeki ${gun} gün`} git={TAKVIM_GIT}>
      <div className={s.akis}>
        {gunler.length === 0 && <p className={s.bosMetin}>Önümüzdeki {gun} günde tarihli görev yok.</p>}
        {gunler.map((g) => (
          <div key={g} className={s.yaklasanGun}>
            <div className={s.yaklasanBaslik}>{gunBasligi(g, bugun)}</div>
            {gununOgeleri(undefined, gunlere.get(g)).map((o) => (
              <OgeSatiri key={o.anahtar} o={o} />
            ))}
          </div>
        ))}
      </div>
    </Kart>
  );
}

export const takvimKartlari: KartTuru[] = [
  {
    id: "takvim",
    ad: "Takvim (hafta, ay, yıl)",
    Bilesen: TakvimKarti,
    ayarlar: [{ anahtar: "gorunum", ad: "Görünüm", useSecenekler: () => GORUNUMLER }],
    w: 6,
    h: 12,
  },
  { id: "akis", ad: "Bugünün akışı", Bilesen: AkisKarti, w: 4, h: 12 },
  {
    id: "yaklasanlar",
    ad: "Yaklaşanlar",
    Bilesen: YaklasanlarKarti,
    ayarlar: [{ anahtar: "gun", ad: "Süre", useSecenekler: () => UFUKLAR }],
    w: 4,
    h: 12,
  },
];
