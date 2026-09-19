import { Coffee, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Hafta as HaftaTipi, Seans } from "@ortak/plan";
import {
  BOS_DURUM,
  VARSAYILAN_ODAK,
  gecenSn,
  gosterSn,
  hedefSn,
  ikiHane,
  kayitYeterli,
  oran,
  sayacMetni,
  sayacParcalari,
  seansKaydi,
  type Kesinti,
  type OdakAyarlari,
  type OdakModu,
} from "@ortak/odak";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { useOdak } from "./odak-store";
import { saatMetni, usePlanVerisi } from "@/veri/plan";
import s from "./odak.module.css";

/**
 * Odak: pomodoro ve kronometre.
 *
 * Sayaç damga tabanlı (`@ortak/odak`) — pencere arkaya atılsa da sapmaz.
 * Çalışma fazı bitince seans KENDİLİĞİNDEN kaydedilir; mola kaydedilmez.
 * Ölçülen süre böyle bedava ve doğru oluyor (K15).
 *
 * Seans her zaman GÜNCEL haftanın dosyasına yazılır — Hafta ekranında eski
 * bir haftaya geçilmiş olsa bile.
 */

type Bicim = "dijital" | "analog" | "flip";

/* --- saat yüzleri -------------------------------------------------------- */

function Dijital({ sn, dolulukOrani, doldu }: { sn: number; dolulukOrani: number; doldu: boolean }) {
  const cevre = 2 * Math.PI * 88;
  return (
    <div className={s.halkaSarmal}>
      <svg className={s.halka} width="208" height="208" viewBox="0 0 208 208">
        <circle className={s.halkaZemin} cx="104" cy="104" r="88" />
        <circle
          className={doldu ? `${s.halkaArk} ${s.halkaArkDoldu}` : s.halkaArk}
          cx="104"
          cy="104"
          r="88"
          strokeDasharray={cevre}
          strokeDashoffset={cevre * (1 - dolulukOrani)}
        />
      </svg>
      <div className={s.halkaMetin}>
        <span className={s.rakam}>{sayacMetni(sn)}</span>
        {doldu && <span className={s.rakamAlt}>fazla mesai</span>}
      </div>
    </div>
  );
}

function Analog({ sn, dolulukOrani }: { sn: number; dolulukOrani: number }) {
  const aci = dolulukOrani * 2 * Math.PI - Math.PI / 2;
  const buyuk = dolulukOrani > 0.5 ? 1 : 0;
  const x = 104 + 84 * Math.cos(aci);
  const y = 104 + 84 * Math.sin(aci);
  return (
    <svg width="208" height="208" viewBox="0 0 208 208">
      <circle className={s.analogKadran} cx="104" cy="104" r="92" />
      {dolulukOrani > 0.001 && (
        <path
          className={s.analogDilim}
          d={`M104 104 L104 20 A84 84 0 ${buyuk} 1 ${x} ${y} Z`}
        />
      )}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * 2 * Math.PI - Math.PI / 2;
        return (
          <line
            key={i}
            className={s.analogCizgi}
            x1={104 + 78 * Math.cos(a)}
            y1={104 + 78 * Math.sin(a)}
            x2={104 + 86 * Math.cos(a)}
            y2={104 + 86 * Math.sin(a)}
          />
        );
      })}
      <line className={s.analogIbre} x1="104" y1="104" x2={x} y2={y} />
      <circle className={s.analogArgos} cx="104" cy="104" r="5" />
      <text
        x="104"
        y="150"
        textAnchor="middle"
        fill="var(--metin-orta)"
        fontSize="15"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {sayacMetni(sn)}
      </text>
    </svg>
  );
}

function Flip({ sn, doldu }: { sn: number; doldu: boolean }) {
  const parcalar = sayacParcalari(sn);
  // Son parça saniye: kart çevirme yalnızca onda.
  const sa = parcalar.at(-1)!;
  const oncekiSa = useRef(sa);
  const [degisti, setDegisti] = useState(false);

  useEffect(() => {
    if (oncekiSa.current === sa) return;
    oncekiSa.current = sa;
    setDegisti(true);
    const t = window.setTimeout(() => setDegisti(false), 180);
    return () => window.clearTimeout(t);
  }, [sa]);

  return (
    // Hedef dolunca sayı yeniden yukarı sayıyor; etiket olmadan geri sayım
    // sanılıyordu.
    <div className={s.flipSarmal}>
      <div className={s.flip}>
        {parcalar.map((p, i) => {
          const son = i === parcalar.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <span className={s.flipIki}>:</span>}
              <div className={son && degisti ? `${s.flipKart} ${s.flipDegisti}` : s.flipKart}>{p}</div>
            </Fragment>
          );
        })}
      </div>
      {doldu && <span className={s.rakamAlt}>fazla mesai</span>}
    </div>
  );
}

/* --- ekran --------------------------------------------------------------- */

/**
 * Uyku yüzünden duran sayaç: sessizce durmak yetmez, kullanıcı neden
 * durduğunu ve aradaki sürenin ne olacağını görmeli.
 */
function KesintiUyarisi({
  kesinti,
  sayilabilir,
  say,
  kapat,
}: {
  kesinti: Kesinti;
  sayilabilir: boolean;
  say: () => void;
  kapat: () => void;
}) {
  const an = new Date(kesinti.durduAn);
  const ara = saatMetni(Math.round(kesinti.sn / 60));
  return (
    <div className={s.kesinti} role="status">
      <span>
        Bilgisayar uykudayken sayaç durduruldu (son görülme {ikiHane(an.getHours())}:
        {ikiHane(an.getMinutes())}). Aradaki {ara} sayılmadı.
      </span>
      <div className={s.kesintiDugmeler}>
        {/* Saatlerce uykuyu "çalıştım" saymak nadiren doğru: vurgu Tamam'da.
            Dolu değil: sayacın "Devam" düğmesiyle yarışmasın. */}
        <Dugme tur="cizgili" onClick={kapat}>
          Tamam
        </Dugme>
        {sayilabilir && (
          <Dugme tur="sade" onClick={say}>
            Aradaki süreyi de say
          </Dugme>
        )}
      </div>
    </div>
  );
}

export function Odak() {
  const { haftalar, kurallar, bugun, yukleniyor } = usePlanVerisi();

  // Seanslar her zaman bugünü içeren haftaya yazılır.
  const guncel = useMemo(() => {
    const iceren = haftalar.find((h) => {
      const t = h.veri.gunler.map((g) => g.isoTarih).filter(Boolean);
      return t.length > 0 && t[0]! <= bugun && bugun <= t[t.length - 1]!;
    });
    return iceren ?? haftalar[haftalar.length - 1] ?? null;
  }, [haftalar, bugun]);

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Odak" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  if (!guncel) {
    return (
      <>
        <EkranBasi baslik="Odak" />
        <Kart>
          <BosDurum
            baslik="Hafta dosyası yok"
            metin="Seansın yazılacağı bir hafta dosyası bulunamadı."
          />
        </Kart>
      </>
    );
  }

  return (
    <OdakIcerik
      kod={guncel.kod}
      odakAyarlari={{ ...VARSAYILAN_ODAK, ...kurallar.odak }}
      bugun={bugun}
    />
  );
}

function OdakIcerik({
  kod,
  odakAyarlari,
  bugun,
}: {
  kod: string;
  odakAyarlari: OdakAyarlari;
  bugun: string;
}) {
  const { veri, yaz, hata } = useDosya<HaftaTipi>(`${kod}.json`);
  // Ekrandan çıkınca sayaç kaybolmasın diye durum ekranın dışında tutuluyor.
  const {
    d,
    setD,
    odakSlot: seciliSlot,
    setOdakSlot,
    odakMetin,
    setOdakMetin,
    kesinti,
    nabiz,
    kesintiyiSay,
    kesintiyiKapat,
  } = useOdak();
  // Seçim ekranlar arasında korunuyor; bu arada slot silinmiş ya da hafta
  // değişmiş olabilir. Olmayan slota seans yazılmasın.
  const odakSlot = veri?.slotlar.some((x) => x.id === seciliSlot) ? seciliSlot : "";
  const [simdi, setSimdi] = useState(Date.now());
  const [bicim, setBicim] = useState<Bicim>(() => {
    try {
      const x = localStorage.getItem("argos.saatBicimi");
      if (x === "analog" || x === "flip" || x === "dijital") return x;
    } catch {
      /* depolama kapalıysa varsayılan */
    }
    return (odakAyarlari.varsayilanBicim as Bicim) ?? "dijital";
  });
  const [not, setNot] = useState<string | null>(null);

  // Damga tabanlı: her tikte yalnızca "şimdi" tazelenir, sayaç artırılmaz.
  // Nabız önce atar: uykudan dönülünce ekran saatlerce fazla mesaiyi bir
  // an bile göstermesin, "hedef doldu" da yanlışlıkla tetiklenmesin.
  useEffect(() => {
    nabiz();
    if (!d.calisiyor) return;
    const t = window.setInterval(() => {
      nabiz();
      setSimdi(Date.now());
    }, 250);
    return () => window.clearInterval(t);
  }, [d.calisiyor, nabiz]);

  const bicimSec = (b: Bicim) => {
    setBicim(b);
    try {
      localStorage.setItem("argos.saatBicimi", b);
    } catch {
      /* önemli değil */
    }
  };

  const hedef = hedefSn(d, odakAyarlari);
  const gecen = gecenSn(d, simdi);
  const goster = gosterSn(d, odakAyarlari, simdi);
  const dolulukOrani = oran(d, odakAyarlari, simdi);

  // Hedef dolunca: molada faz kendiliğinden biter, çalışmada sayaç sürer.
  // Çalışmada duraklatılmışken de dolabilir (uykudaki ara sayılınca):
  // ekran 00:00'da takılmasın, doğrudan fazla mesaiyi göstersin.
  useEffect(() => {
    if (hedef === null || d.doldu || gecen < hedef) return;
    if (d.faz === "mola") {
      if (!d.calisiyor) return;
      setD((x) => ({ ...x, calisiyor: false, basladi: null, gecen: 0, doldu: false, faz: "calisma" }));
      setNot("Mola bitti.");
    } else {
      setD((x) => ({ ...x, doldu: true }));
      setNot("Hedef doldu — sayaç fazla mesaiye geçti.");
    }
  }, [hedef, gecen, d.doldu, d.calisiyor, d.faz]);

  const seansEkle = async (dk: number) => {
    if (!veri) return;
    const kayit = seansKaydi({
      tip: d.mod,
      dk,
      odakSlot: odakSlot || null,
      odakMetin,
      simdi: new Date(),
    });
    const ok = await yaz({ ...veri, seanslar: [...(veri.seanslar ?? []), kayit] });
    setNot(ok ? `${dk} dk kaydedildi.` : "Seans kaydedilemedi.");
  };

  const basla = () =>
    setD((x) => (x.calisiyor ? x : { ...x, calisiyor: true, basladi: Date.now() }));

  const duraklat = () =>
    setD((x) =>
      x.calisiyor ? { ...x, gecen: gecenSn(x, Date.now()), calisiyor: false, basladi: null } : x,
    );

  // Sayaç sıfırlanınca uykudaki arayı eklemenin anlamı kalmaz.
  const sifirla = () => {
    setD((x) => ({ ...x, calisiyor: false, basladi: null, gecen: 0, doldu: false }));
    kesintiyiKapat();
    setNot(null);
  };

  /** Molaya geç: çalışma süresi kaydedilir, tur ilerler. */
  const molayaGec = async () => {
    const sn = gecenSn(d, Date.now());
    kesintiyiKapat();
    setD((x) => ({
      ...x,
      calisiyor: false,
      basladi: null,
      gecen: 0,
      doldu: false,
      tur: x.tur + 1,
      faz: "mola",
    }));
    if (kayitYeterli(sn, odakAyarlari)) await seansEkle(Math.round(sn / 60));
    else setNot("Seans çok kısa, kaydedilmedi.");
  };

  /** Bitir: çalışma fazındaysa kaydeder, molada kaydetmez. */
  const bitir = async (kaydet = true) => {
    const sn = gecenSn(d, Date.now());
    const calismaFazi = d.faz === "calisma";
    kesintiyiKapat();
    setD((x) => ({ ...x, calisiyor: false, basladi: null, gecen: 0, doldu: false }));
    if (kaydet && calismaFazi && kayitYeterli(sn, odakAyarlari)) {
      await seansEkle(Math.round(sn / 60));
    } else if (kaydet && calismaFazi) {
      setNot("Seans çok kısa, kaydedilmedi.");
    }
  };

  const molaGec = () => {
    kesintiyiKapat();
    setD((x) => ({ ...x, calisiyor: false, basladi: null, gecen: 0, doldu: false, faz: "calisma" }));
  };

  const modDegis = (m: OdakModu) => {
    kesintiyiKapat();
    setD({ ...BOS_DURUM, mod: m });
  };

  const bugunSlotlari = (veri?.slotlar ?? []).filter(
    (x) => veri?.gunler.find((g) => g.no === x.gun)?.isoTarih === bugun,
  );
  const digerSlotlar = (veri?.slotlar ?? []).filter((x) => !bugunSlotlari.includes(x));

  const seanslar = [...(veri?.seanslar ?? [])].reverse();
  const toplamDk = (veri?.seanslar ?? []).reduce((t, x) => t + (x.sureDk ?? 0), 0);

  const seansDegis = (id: string, dk: number) => {
    if (!veri || !Number.isFinite(dk) || dk < 0) return;
    void yaz({
      ...veri,
      seanslar: (veri.seanslar ?? []).map((x) => (x.id === id ? { ...x, sureDk: dk } : x)),
    });
  };

  const seansSil = (id: string) => {
    if (!veri) return;
    void yaz({ ...veri, seanslar: (veri.seanslar ?? []).filter((x) => x.id !== id) });
  };

  const seansAdiYaz = (x: Seans): string =>
    x.odakSlot
      ? `${x.odakSlot}${
          veri?.slotlar.find((y) => y.id === x.odakSlot)
            ? ` · ${veri.slotlar.find((y) => y.id === x.odakSlot)!.alan}`
            : ""
        }`
      : x.odakMetin || "Odak (etiketsiz)";

  return (
    <>
      <EkranBasi
        baslik="Odak"
        altyazi={`Seanslar ${kod} dosyasına yazılır · ${odakAyarlari.pomodoroDk} dk çalışma, ${odakAyarlari.kisaMolaDk}/${odakAyarlari.uzunMolaDk} dk mola`}
      />

      <div className={s.duzen}>
        <Kart dolgulu={false}>
          <div className={s.saatKart}>
            <span
              className={[
                s.faz,
                d.faz === "mola" && s.fazMola,
                d.doldu && s.fazDoldu,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {d.mod === "kronometre"
                ? "kronometre"
                : d.faz === "mola"
                  ? d.tur % odakAyarlari.uzunMolaHerKacTur === 0
                    ? "uzun mola"
                    : "kısa mola"
                  : `çalışma · tur ${d.tur + 1}`}
            </span>

            {bicim === "dijital" && (
              <Dijital sn={goster} dolulukOrani={dolulukOrani} doldu={d.doldu} />
            )}
            {bicim === "analog" && <Analog sn={goster} dolulukOrani={dolulukOrani} />}
            {bicim === "flip" && <Flip sn={goster} doldu={d.doldu} />}

            <div className={s.dugmeler}>
              {d.calisiyor ? (
                <Dugme tur="cizgili" ikon={<Pause size={15} />} onClick={duraklat}>
                  Duraklat
                </Dugme>
              ) : (
                <Dugme tur="dolu" ikon={<Play size={15} />} onClick={basla}>
                  {gecen > 0 ? "Devam" : "Başla"}
                </Dugme>
              )}

              {d.mod === "pomodoro" && d.faz === "calisma" && (
                <Dugme ikon={<Coffee size={15} />} onClick={() => void molayaGec()}>
                  Molaya geç
                </Dugme>
              )}
              {d.mod === "pomodoro" && d.faz === "mola" && (
                <Dugme ikon={<Play size={15} />} onClick={molaGec}>
                  Molayı geç
                </Dugme>
              )}

              <Dugme ikon={<Square size={15} />} onClick={() => void bitir(true)}>
                Bitir ve kaydet
              </Dugme>
              <Dugme tur="sade" ikon={<RotateCcw size={15} />} onClick={sifirla}>
                Sıfırla
              </Dugme>
            </div>

            {kesinti && (
              <KesintiUyarisi
                kesinti={kesinti}
                // Molada uyunduysa arayı "çalıştım" diye eklemek anlamsız.
                sayilabilir={d.faz === "calisma"}
                say={kesintiyiSay}
                kapat={kesintiyiKapat}
              />
            )}
            {not && <span className={s.hedefEtiket}>{not}</span>}
            {hata && <span className={s.hedefEtiket}>{hata}</span>}
          </div>

          {/* İki ayrı açılır grup: biri mod, biri saat biçimi. */}
          <div className={s.acilirGrup}>
            <select
              className={s.acilir}
              value={d.mod}
              onChange={(e) => modDegis(e.target.value as OdakModu)}
              aria-label="Mod"
            >
              <option value="pomodoro">pomodoro</option>
              <option value="kronometre">kronometre</option>
            </select>
            <select
              className={s.acilir}
              value={bicim}
              onChange={(e) => bicimSec(e.target.value as Bicim)}
              aria-label="Saat biçimi"
            >
              <option value="dijital">dijital</option>
              <option value="analog">analog</option>
              <option value="flip">flip</option>
            </select>
          </div>
        </Kart>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--b5)" }}>
          <Kart dolgulu={false} baslik="Odak hedefi">
            <div className={s.hedefKart}>
              <select
                className={s.hedefSecim}
                value={odakSlot}
                onChange={(e) => setOdakSlot(e.target.value)}
                aria-label="Slot"
              >
                <option value="">— slot seçme —</option>
                {bugunSlotlari.length > 0 && (
                  <optgroup label="Bugün">
                    {bugunSlotlari.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.saat} · {x.alan} — {x.konu}
                      </option>
                    ))}
                  </optgroup>
                )}
                {digerSlotlar.length > 0 && (
                  <optgroup label="Haftanın diğer slotları">
                    {digerSlotlar.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.id} · {x.alan} — {x.konu}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <Giris
                value={odakMetin}
                placeholder="ya da serbest metin"
                onChange={(e) => setOdakMetin(e.target.value)}
                disabled={Boolean(odakSlot)}
              />
              <span className={s.hedefEtiket}>
                Slot seçilirse süre o slota yazılır; seçilmezse ayrı kalem olur.
              </span>
            </div>
          </Kart>

          <Kart dolgulu={false} baslik="Bu haftanın seansları" not={`${seanslar.length} seans`}>
            {seanslar.length === 0 ? (
              <BosDurum baslik="Henüz seans yok" />
            ) : (
              <>
                {seanslar.map((x) => (
                  <div key={x.id} className={s.seans}>
                    <span className={s.seansSaat}>
                      {(x.baslangic ?? "").slice(5, 10)} {(x.baslangic ?? "").slice(11, 16)}
                    </span>
                    <span className={s.seansAd}>{seansAdiYaz(x)}</span>
                    <Etiket>{x.tip}</Etiket>
                    <input
                      className={s.seansSure}
                      type="number"
                      min={0}
                      value={x.sureDk ?? 0}
                      onChange={(e) => seansDegis(x.id!, Number(e.target.value))}
                      aria-label="Süre (dk)"
                    />
                    <Dugme
                      tur="sade"
                      ikon={<Trash2 size={14} />}
                      onClick={() => seansSil(x.id!)}
                      aria-label="Seansı sil"
                    />
                  </div>
                ))}
                <div className={s.seansToplam}>
                  <span>ölçülen toplam</span>
                  <span>{saatMetni(toplamDk)}</span>
                </div>
              </>
            )}
          </Kart>
        </div>
      </div>
    </>
  );
}
