import { Check, ChevronLeft, ChevronRight, Flag, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AY_ADLARI, AY_TAM, GUN_ADLARI, GUN_KISA, ayBasi, gunAl, gunEkle, haftaninGunu } from "@ortak/gun";
import {
  ANA_PAY_ADI,
  BOS_CP,
  CP_YOLU,
  ESKI_YL_YOLU,
  PLAN_RENKLERI,
  PLAN_TURLERI,
  altEkle,
  altGuncelle,
  altSil,
  altlarTasiyor,
  calismaGunleri,
  ceyrek,
  eforu,
  gerekenGunluk,
  gunPayi,
  haftaBasi,
  haftalikHedef,
  kalanGun,
  normalizeCp,
  otomatikPlanla,
  oturumEkle,
  oturumIsaretle,
  oturumKismen,
  oturumSil,
  planBul,
  planDurumu,
  planEkle,
  planGuncelle,
  planSil,
  ylDenTasi,
  type AltPlan,
  type CalismaPlani,
  type CpDosyasi,
  type Oturum,
  type ParcaDurumu,
  type PlanTuru,
  type PlanlamaRaporu,
} from "@ortak/calisma-plani";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { Popover } from "@/ui/Popover";
import { bildir, silVeBildir } from "@/ui/toast";
import { kopru, useBugun, useDosya } from "@/veri/kanca";
import { saatMetni } from "@/veri/plan";
import { useTodoistAralik } from "@/veri/todoist";
import { DuzenMetni } from "./DuzenMetni";
import s from "./planlar.module.css";

/**
 * Planlar (issue #73): plans measured in hours — a course, a book, a
 * skill, an exam, a project — with sub-plans that share the hours
 * ("A dersi 25 saat: Vize 10, Final 10, the rest extra work"), and a
 * calendar (day, week, month) to give them time, by hand or with the
 * automatic planning over the weekdays and weekly hours each plan asks
 * for. The calendar also shows the Yapılacaklar tasks of each day, and
 * each week its effort total.
 *
 * It replaces the Yüksek Lisans screen of issue #57; its courses are
 * carried over once from yuksek-lisans.json, which is left as it was.
 */

let sayac = 0;
const yeniId = (on: string) => `${on}-${Date.now().toString(36)}-${(sayac++).toString(36)}`;

const kisaTarih = (iso: string): string => `${gunAl(iso)} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`;

/** Hours typed as "1,5" or "1.5" → minutes, a quarter hour at the least. */
function saatOku(metin: string): number {
  const n = Number(metin.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? Math.max(15, ceyrek(n * 60)) : 0;
}

/** Minutes as hours to type back: 90 → "1,5". */
const saatYaz = (dk: number): string => (dk ? String(Math.round((dk / 60) * 100) / 100).replace(".", ",") : "");

type Gorunum = "gun" | "hafta" | "ay";
const GORUNUMLER: { id: Gorunum; ad: string }[] = [
  { id: "gun", ad: "Gün" },
  { id: "hafta", ad: "Hafta" },
  { id: "ay", ad: "Ay" },
];
const GORUNUM_ANAHTARI = "argos.planlar.gorunum";

/** The plan or sub-plan sessions are given to. */
interface Hedef {
  planId: string;
  altId?: string;
}

type Degistir = (f: (d: CpDosyasi) => CpDosyasi) => Promise<boolean>;

/** "12 oturum, 25 sa planlandı. Yetişmeyen: Final 2 sa." */
function raporMetni(p: CalismaPlani, r: PlanlamaRaporu): string {
  if (r.ayarYok) return `"${p.ad}" için bir son tarih ya da haftalık saat gir; otomatik planlama ona göre yapılır.`;
  if (!r.oturum && !r.yetismeyen.length) return `"${p.ad}" zaten tamamen planlı.`;
  const hiz = r.hesaplandi && r.gunlukDk ? ` Günde ~${saatMetni(r.gunlukDk)}.` : "";
  const bas = r.oturum ? `"${p.ad}": ${r.oturum} oturum, ${saatMetni(r.eklenenDk)} planlandı.${hiz}` : `"${p.ad}": eklenecek gün bulunamadı.`;
  const eksik = r.yetismeyen.map((x) => `${x.ad} ${saatMetni(x.eksikDk)}`).join(", ");
  return eksik ? `${bas} Son tarihine yetişmeyen: ${eksik}.` : bas;
}

/** Days and range a view covers around `tarih`. */
function gorunumAraligi(g: Gorunum, tarih: string): { bas: string; son: string } {
  if (g === "gun") return { bas: tarih, son: tarih };
  if (g === "hafta") {
    const bas = haftaBasi(tarih);
    return { bas, son: gunEkle(bas, 6) };
  }
  const ilk = ayBasi(tarih);
  const sonGun = gunEkle(ayBasi(gunEkle(ilk, 31)), -1);
  return { bas: haftaBasi(ilk), son: gunEkle(haftaBasi(sonGun), 6) };
}

export function Planlar() {
  const dosya = useDosya<CpDosyasi>(CP_YOLU);
  const bugun = useBugun();
  const veri = useMemo(() => normalizeCp(dosya.veri), [dosya.veri]);
  const degistir: Degistir = (f) => dosya.degistir((d) => f(normalizeCp(d ?? BOS_CP)));

  const [gorunum, setGorunumHam] = useState<Gorunum>(() => {
    try {
      const g = localStorage.getItem(GORUNUM_ANAHTARI);
      if (g === "gun" || g === "hafta" || g === "ay") return g;
    } catch {
      /* storage closed: the default */
    }
    return "hafta";
  });
  const setGorunum = (g: Gorunum) => {
    setGorunumHam(g);
    try {
      localStorage.setItem(GORUNUM_ANAHTARI, g);
    } catch {
      /* not important */
    }
  };
  const [tarih, setTarih] = useState(bugun);
  const [secili, setSecili] = useState<Hedef | null>(null);
  const [yeniAcik, setYeniAcik] = useState(false);
  const [gunAcik, setGunAcik] = useState<{ gun: string; x: number; y: number } | null>(null);

  // The Yüksek Lisans courses of issue #57 come over once, when this file does not exist yet.
  const tasindi = useRef(false);
  useEffect(() => {
    if (dosya.yukleniyor || dosya.veri !== null || tasindi.current) return;
    tasindi.current = true;
    const k = kopru();
    if (!k) return;
    void k.veri.oku(ESKI_YL_YOLU).then((r) => {
      const tasinan = ylDenTasi(r.veri);
      if (tasinan.planlar.length) void dosya.degistir((d) => (d ? d : tasinan));
    });
  }, [dosya]);

  const { bas, son } = gorunumAraligi(gorunum, tarih);
  const td = useTodoistAralik(bas, son);

  // Deadlines of plans and sub-plans, by day.
  const sonTarihler = useMemo(() => {
    const m = new Map<string, { id: string; renk: string; ad: string; ipucu: string }[]>();
    const ekle = (gun: string, x: { id: string; renk: string; ad: string; ipucu: string }) => (m.get(gun) ?? m.set(gun, []).get(gun)!).push(x);
    for (const p of veri.planlar) {
      if (p.sonTarih) ekle(p.sonTarih, { id: p.id, renk: p.renk, ad: p.ad, ipucu: `Son tarih: ${p.ad}` });
      for (const a of p.altlar) if (a.sonTarih) ekle(a.sonTarih, { id: a.id, renk: p.renk, ad: a.ad, ipucu: `${a.ad} (${p.ad}) · ${saatMetni(a.hedefDk)}` });
    }
    return m;
  }, [veri.planlar]);

  if (dosya.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Planlar" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const buHafta = eforu(veri, haftaBasi(bugun));

  const otoPlanla = (planId: string) => {
    let rapor: PlanlamaRaporu | null = null;
    void degistir((d) => {
      const r = otomatikPlanla(d, planId, bugun, () => yeniId("o"));
      rapor = r.rapor;
      return r.dosya;
    }).then((ok) => {
      const p = planBul(veri, planId);
      if (ok && p && rapor) bildir({ metin: raporMetni(p, rapor) });
    });
  };

  const olustur = (p: CalismaPlani, oto: boolean) => {
    let rapor: PlanlamaRaporu | null = null;
    void degistir((d) => {
      const eklendi = planEkle(d, p);
      if (!oto) return eklendi;
      const r = otomatikPlanla(eklendi, p.id, bugun, () => yeniId("o"));
      rapor = r.rapor;
      return r.dosya;
    }).then((ok) => {
      if (ok && rapor) bildir({ metin: raporMetni(p, rapor) });
    });
    setSecili({ planId: p.id });
    setYeniAcik(false);
  };

  const planiSil = (p: CalismaPlani) => {
    const eski = veri;
    silVeBildir({
      metin: `"${p.ad}" planı silindi, takvimdeki oturumlarıyla.`,
      sil: () => degistir((d) => planSil(d, p.id)),
      geriKoy: () =>
        degistir((d) => {
          const takvim = { ...d.takvim };
          for (const [gun, l] of Object.entries(eski.takvim)) {
            const geri = l.filter((o) => o.planId === p.id);
            if (geri.length) takvim[gun] = [...(takvim[gun] ?? []), ...geri];
          }
          return { ...d, planlar: [...d.planlar, p], takvim };
        }),
    });
  };

  const gunuAc = (gun: string) => (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setGunAcik({ gun, x: r.left, y: r.bottom + 4 });
  };

  const ileri = (yon: -1 | 1) =>
    setTarih((t) => (gorunum === "gun" ? gunEkle(t, yon) : gorunum === "hafta" ? gunEkle(t, 7 * yon) : ayBasi(gunEkle(ayBasi(t), yon < 0 ? -1 : 32))));

  const baslik =
    gorunum === "gun"
      ? `${kisaTarih(tarih)} ${GUN_ADLARI[haftaninGunu(tarih)]}`
      : gorunum === "hafta"
        ? `${kisaTarih(bas)} – ${kisaTarih(son)}`
        : `${AY_TAM[Number(tarih.slice(5, 7)) - 1]} ${tarih.slice(0, 4)}`;
  const seciliAd = secili ? hedefAdi(veri, secili) : null;
  const ortak = { veri, bugun, sonTarihler, gorevler: td.gunlere, gunuAc };

  return (
    <>
      <EkranBasi
        baslik="Planlar"
        altyazi={`Bu hafta ${saatMetni(buHafta.planliDk)} planlı · ${saatMetni(buHafta.yapilanDk)} yapıldı`}
        sag={
          !yeniAcik && (
            <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={() => setYeniAcik(true)}>
              Yeni plan
            </Dugme>
          )
        }
      />
      {dosya.hata && <p className={s.soluk}>{dosya.hata}</p>}

      <div className={s.duzen}>
        <div className={s.sol}>
          {yeniAcik && (
            <YeniPlan renk={PLAN_RENKLERI[veri.planlar.length % PLAN_RENKLERI.length]!} bugun={bugun} onOlustur={olustur} onVazgec={() => setYeniAcik(false)} />
          )}
          {veri.planlar.length === 0 && !yeniAcik && (
            <Kart>
              <BosDurum
                baslik="Henüz plan yok"
                metin="Bir ders, kitap, sınav ya da proje için toplam saati ve haftada ne kadar çalışacağını söyle; günlere Argos dağıtsın."
                eylem={
                  <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={() => setYeniAcik(true)}>
                    Yeni plan
                  </Dugme>
                }
              />
            </Kart>
          )}
          {veri.planlar.map((p) => (
            <PlanKarti
              key={p.id}
              plan={p}
              veri={veri}
              bugun={bugun}
              secili={secili}
              onSec={setSecili}
              degistir={degistir}
              onOtoPlanla={() => otoPlanla(p.id)}
              onSil={() => planiSil(p)}
            />
          ))}
        </div>

        <Kart dolgulu={false} className={s.takvimKart}>
          <div className={s.takvimBas}>
            <h2 className={s.takvimBaslik}>{baslik}</h2>
            <div className={s.gorunumler} role="tablist" aria-label="Görünüm">
              {GORUNUMLER.map((g) => (
                <button key={g.id} type="button" role="tab" aria-selected={gorunum === g.id} className={gorunum === g.id ? `${s.gorunum} ${s.gorunumSecili}` : s.gorunum} onClick={() => setGorunum(g.id)}>
                  {g.ad}
                </button>
              ))}
            </div>
            <div className={s.gez}>
              <Dugme tur="sade" ikon={<ChevronLeft size={16} />} aria-label="Önceki" onClick={() => ileri(-1)} />
              {(bugun < bas || bugun > son) && (
                <Dugme tur="sade" onClick={() => setTarih(bugun)}>
                  Bugün
                </Dugme>
              )}
              <Dugme tur="sade" ikon={<ChevronRight size={16} />} aria-label="Sonraki" onClick={() => ileri(1)} />
            </div>
          </div>
          <div className={s.ipucu}>
            {seciliAd ? (
              <>
                Planlanan: <b>{seciliAd}</b> — bir güne tıkla
                <button type="button" className={s.ikon} aria-label="Seçimi bırak" onClick={() => setSecili(null)}>
                  <X size={12} />
                </button>
              </>
            ) : (
              "Soldan bir plan ya da alt plan seç, sonra bir güne tıkla."
            )}
          </div>

          {gorunum === "ay" && <AyGorunumu {...ortak} bas={bas} son={son} ay={tarih} />}
          {gorunum === "hafta" && <HaftaGorunumu {...ortak} bas={bas} />}
          {gorunum === "gun" && <GunGorunumu {...ortak} gun={tarih} secili={secili} degistir={degistir} />}
        </Kart>
      </div>

      {gunAcik && (
        <Popover x={gunAcik.x} y={gunAcik.y} onClose={() => setGunAcik(null)} label={`${kisaTarih(gunAcik.gun)} planı`} className={s.panel}>
          <div className={s.panelBas}>
            <b>
              {kisaTarih(gunAcik.gun)} {GUN_KISA[haftaninGunu(gunAcik.gun)]}
            </b>
            <span className={s.soluk}>
              {td.gunlere.get(gunAcik.gun)?.length ? `${td.gunlere.get(gunAcik.gun)!.length} görev · ` : ""}hafta {saatMetni(eforu(veri, haftaBasi(gunAcik.gun)).planliDk)}
            </span>
          </div>
          <OturumListesi gun={gunAcik.gun} veri={veri} degistir={degistir} />
          <OturumEkle gun={gunAcik.gun} veri={veri} secili={secili} degistir={degistir} odak />
        </Popover>
      )}
    </>
  );
}

const hedefAdi = (d: CpDosyasi, h: Hedef): string | null => {
  const p = planBul(d, h.planId);
  if (!p) return null;
  const a = h.altId ? p.altlar.find((x) => x.id === h.altId) : null;
  return a ? `${p.ad} · ${a.ad}` : p.altlar.length ? `${p.ad} · ${ANA_PAY_ADI.toLocaleLowerCase("tr")}` : p.ad;
};

/* --- plans (left) ----------------------------------------------------------------- */

function GunSecimi({ gunler, onDegis, etiket }: { gunler: number[]; onDegis: (g: number[]) => void; etiket: string }) {
  return (
    <div className={s.gunSecim} role="group" aria-label={etiket}>
      {GUN_KISA.map((ad, i) => {
        const var_ = gunler.includes(i);
        return (
          <button
            key={ad}
            type="button"
            aria-pressed={var_}
            className={var_ ? `${s.gunKutu} ${s.gunKutuSecili}` : s.gunKutu}
            onClick={() => onDegis(var_ ? gunler.filter((g) => g !== i) : [...gunler, i].sort())}
          >
            {ad}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hours for each weekday ("Pzt 1 sa, Cmt 2 sa, Paz 2 sa"): a day picked
 * gets a field below it; a day left empty or at 0 is not worked.
 */
function GunSaatleri({ dk, onDegis, etiket }: { dk: number[]; onDegis: (dk: number[]) => void; etiket: string }) {
  const [acik, setAcik] = useState(() => GUN_KISA.map((_, i) => dk[i]! > 0));
  const yaz = (i: number, y: number) => onDegis(dk.map((x, j) => (j === i ? y : x)));
  return (
    <div className={s.gunSaat} role="group" aria-label={etiket}>
      {GUN_KISA.map((ad, i) => {
        const var_ = acik[i] || dk[i]! > 0;
        return (
          <div key={ad} className={s.gunSaatSutun}>
            <button
              type="button"
              aria-pressed={var_}
              className={var_ ? `${s.gunKutu} ${s.gunKutuSecili}` : s.gunKutu}
              onClick={() => {
                setAcik((l) => l.map((x, j) => (j === i ? !var_ : x)));
                if (var_ && dk[i]) yaz(i, 0);
              }}
            >
              {ad}
            </button>
            {var_ && (
              <input
                key={dk[i]}
                className={`${s.giris} ${s.gunSaatGiris}`}
                inputMode="decimal"
                autoFocus={!dk[i]}
                defaultValue={dk[i] ? saatYaz(dk[i]!) : ""}
                placeholder="sa"
                aria-label={`${GUN_ADLARI[i]}: saat`}
                onBlur={(e) => {
                  const y = saatOku(e.target.value);
                  if (y !== dk[i]) yaz(i, y);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const BOS_GUNLER = [0, 0, 0, 0, 0, 0, 0];

/** An hours field that saves on blur or Enter. With `bosOlabilir`, emptying it saves 0. */
function SaatAlani({
  dk,
  onKaydet,
  etiket,
  className,
  bosOlabilir,
  placeholder,
}: {
  dk: number;
  onKaydet: (dk: number) => void;
  etiket: string;
  className?: string;
  bosOlabilir?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      key={dk}
      className={[s.giris, s.dar, className].filter(Boolean).join(" ")}
      inputMode="decimal"
      defaultValue={saatYaz(dk)}
      placeholder={placeholder}
      aria-label={etiket}
      onBlur={(e) => {
        const y = saatOku(e.target.value);
        if (y && y !== dk) onKaydet(y);
        else if (bosOlabilir && !e.target.value.trim() && dk) onKaydet(0);
        else e.target.value = saatYaz(dk);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

interface YeniAlt {
  anahtar: number;
  ad: string;
  saat: string;
  sonTarih: string;
}

function YeniPlan({
  renk,
  bugun,
  onOlustur,
  onVazgec,
}: {
  renk: string;
  bugun: string;
  onOlustur: (p: CalismaPlani, oto: boolean) => void;
  onVazgec: () => void;
}) {
  const [ad, setAd] = useState("");
  const [tur, setTur] = useState<PlanTuru>("ders");
  const [toplam, setToplam] = useState("");
  const [baslangic, setBaslangic] = useState("");
  const [sonTarih, setSonTarih] = useState("");
  const [haftalik, setHaftalik] = useState("");
  const [gunler, setGunler] = useState<number[]>([]);
  const [gunGun, setGunGun] = useState(false);
  const [gunDk, setGunDk] = useState<number[]>(BOS_GUNLER);
  const [altlar, setAltlar] = useState<YeniAlt[]>([]);
  const [oto, setOto] = useState(true);

  const toplamDk = saatOku(toplam);
  const altDk = altlar.reduce((t, a) => t + saatOku(a.saat), 0);
  const tasiyor = altDk > toplamDk;
  const gecerli = Boolean(ad.trim() && toplamDk && !tasiyor && altlar.every((a) => a.ad.trim() && saatOku(a.saat)));
  const taslak = (): CalismaPlani => ({
    id: "taslak",
    ad: ad.trim(),
    tur,
    renk,
    hedefDk: toplamDk,
    ...(baslangic && baslangic > bugun ? { baslangic } : {}),
    ...(sonTarih ? { sonTarih } : {}),
    haftalikDk: gunGun ? 0 : saatOku(haftalik),
    gunler: gunGun ? [] : gunler,
    ...(gunGun && gunDk.some((x) => x > 0) ? { gunDk } : {}),
    altlar: altlar.map((a) => ({ id: `alt-${a.anahtar}`, ad: a.ad.trim(), hedefDk: saatOku(a.saat), ...(a.sonTarih ? { sonTarih: a.sonTarih } : {}) })),
  });
  // Weekly hours, or else a deadline to work the pace out from.
  const otoOlur = haftalikHedef(taslak()) > 0 || Boolean(sonTarih) || altlar.some((a) => a.sonTarih);
  const gunlukOnizleme = !toplamDk
    ? 0
    : haftalikHedef(taslak())
      ? Math.round(haftalikHedef(taslak()) / calismaGunleri(taslak()).length)
      : (gerekenGunluk(planEkle(BOS_CP, taslak()), taslak(), bugun) ?? 0);

  const olustur = () => {
    if (!gecerli) return;
    const p = taslak();
    onOlustur({ ...p, id: yeniId("plan"), altlar: p.altlar.map((a) => ({ ...a, id: yeniId("alt") })) }, oto && otoOlur);
  };
  const altGuncelleYeni = (anahtar: number, patch: Partial<YeniAlt>) => setAltlar((l) => l.map((a) => (a.anahtar === anahtar ? { ...a, ...patch } : a)));

  return (
    <Kart dolgulu={false} baslik="Yeni plan">
      <div className={s.form}>
        <Giris value={ad} autoFocus placeholder="Ad: Software Requirements Engineering" aria-label="Planın adı" onChange={(e) => setAd(e.target.value)} />
        <div className={s.turSecim} role="radiogroup" aria-label="Plan türü">
          {PLAN_TURLERI.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tur === t.id} className={tur === t.id ? `${s.tur} ${s.turSecili}` : s.tur} onClick={() => setTur(t.id)}>
              {t.ad}
            </button>
          ))}
        </div>
        <div className={s.satir}>
          <span className={s.soluk}>Toplam</span>
          <input className={`${s.giris} ${s.dar}`} inputMode="decimal" value={toplam} placeholder="25" aria-label="Toplam saat" onChange={(e) => setToplam(e.target.value)} />
          <span className={s.soluk}>saat · son tarih</span>
          <input type="date" className={s.giris} value={sonTarih} aria-label="Son tarih" onChange={(e) => setSonTarih(e.target.value)} />
        </div>
        <div className={s.satir}>
          <span className={s.soluk}>Başlangıç</span>
          <input type="date" className={s.giris} value={baslangic || bugun} min={bugun} aria-label="Başlangıç tarihi" onChange={(e) => setBaslangic(e.target.value)} />
          <span className={s.soluk}>{baslangic && baslangic > bugun ? "bu günden önce çalışma planlanmaz" : "bugünden başlar"}</span>
        </div>

        <div className={s.bolumAd}>Alt planlar</div>
        {altlar.map((a) => (
          <div key={a.anahtar} className={s.satir}>
            <input className={`${s.giris} ${s.genis}`} value={a.ad} aria-label="Alt planın adı" onChange={(e) => altGuncelleYeni(a.anahtar, { ad: e.target.value })} />
            <input className={`${s.giris} ${s.dar}`} inputMode="decimal" value={a.saat} placeholder="10" aria-label={`${a.ad || "Alt plan"}: saat`} onChange={(e) => altGuncelleYeni(a.anahtar, { saat: e.target.value })} />
            <span className={s.soluk}>sa</span>
            <input type="date" className={s.giris} value={a.sonTarih} aria-label={`${a.ad || "Alt plan"}: son tarih`} onChange={(e) => altGuncelleYeni(a.anahtar, { sonTarih: e.target.value })} />
            <button type="button" className={s.ikon} aria-label="Alt planı çıkar" onClick={() => setAltlar((l) => l.filter((x) => x.anahtar !== a.anahtar))}>
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={s.metinDugme}
          onClick={() => setAltlar((l) => [...l, { anahtar: Date.now() + l.length, ad: l.length === 0 ? "Vize" : l.length === 1 ? "Final" : "", saat: "", sonTarih: "" }])}
        >
          <Plus size={12} /> Alt plan (vize, final, ödev…)
        </button>
        {toplamDk > 0 && altlar.length > 0 && (
          <span className={tasiyor ? s.uyari : s.soluk}>
            {tasiyor ? `Alt planlar ${saatMetni(altDk)} — toplam en az bu kadar olmalı.` : `${saatMetni(toplamDk - altDk)} ekstra çalışma olarak planın kendisine kalır.`}
          </span>
        )}

        <div className={s.bolumAd}>Çalışma düzeni</div>
        <label className={s.onay}>
          <input type="checkbox" checked={gunGun} onChange={(e) => setGunGun(e.target.checked)} />
          Her güne ayrı saat (Pzt 1 sa, Cmt 2 sa…)
        </label>
        {gunGun ? (
          <>
            <GunSaatleri dk={gunDk} onDegis={setGunDk} etiket="Günlere göre saat" />
            <span className={s.soluk}>
              {gunDk.some((x) => x > 0) ? `Haftada ${saatMetni(haftalikHedef(taslak()))}; hedef tamamlanana kadar her hafta böyle.` : "Bir gün seç, altına saatini yaz."}
            </span>
          </>
        ) : (
          <>
            <div className={s.satir}>
              <span className={s.soluk}>Haftada</span>
              <input className={`${s.giris} ${s.dar}`} inputMode="decimal" value={haftalik} placeholder="oto" aria-label="Haftada kaç saat" onChange={(e) => setHaftalik(e.target.value)} />
              <span className={s.soluk}>saat · boş bırakırsan son tarihe göre hesaplanır</span>
            </div>
            <GunSecimi gunler={gunler} onDegis={setGunler} etiket="Çalışma günleri" />
            <span className={s.soluk}>{gunler.length ? "Yalnızca seçili günlerde çalışılır." : "Gün seçmezsen her gün çalışılır."}</span>
          </>
        )}
        <label className={s.onay}>
          <input type="checkbox" checked={oto && otoOlur} disabled={!otoOlur} onChange={(e) => setOto(e.target.checked)} />
          Takvime otomatik planla
          {otoOlur && gunlukOnizleme > 0 && (
            <span className={s.soluk}>
              {" "}
              (günde ~{saatMetni(gunlukOnizleme)}
              {haftalikHedef(taslak()) ? "" : ", son tarihe göre"}, en yakın son tarih önce)
            </span>
          )}
        </label>
        {!otoOlur && toplamDk > 0 && <span className={s.soluk}>Otomatik planlama için bir son tarih ya da haftalık saat gir.</span>}
      </div>
      <div className={s.altSerit}>
        <Dugme tur="sade" onClick={onVazgec}>
          Vazgeç
        </Dugme>
        <Dugme tur="dolu" ikon={<Plus size={14} />} disabled={!gecerli} onClick={olustur}>
          Oluştur
        </Dugme>
      </div>
    </Kart>
  );
}

function durumMetni(x: ParcaDurumu): { metin: string; sinif: string } {
  if (x.hedefDk > 0 && x.yapilanDk >= x.hedefDk) return { metin: "bitti", sinif: s.iyi! };
  if (x.yetisir) return { metin: "planı yetiyor", sinif: s.iyi! };
  if (x.gecti) return { metin: "son tarihi geçti", sinif: s.hata! };
  const eksik = x.hedefDk - x.zamanindaDk;
  return { metin: `${saatMetni(eksik)} eksik planlı`, sinif: s.uyari! };
}

function PlanKarti({
  plan,
  veri,
  bugun,
  secili,
  onSec,
  degistir,
  onOtoPlanla,
  onSil,
}: {
  plan: CalismaPlani;
  veri: CpDosyasi;
  bugun: string;
  secili: Hedef | null;
  onSec: (h: Hedef | null) => void;
  degistir: Degistir;
  onOtoPlanla: () => void;
  onSil: () => void;
}) {
  const [altAcik, setAltAcik] = useState(false);
  const durum = planDurumu(veri, plan, bugun);
  const yuzde = (x: number) => `${plan.hedefDk ? Math.min(100, (x / plan.hedefDk) * 100) : 0}%`;
  const guncelle = (f: (p: CalismaPlani) => CalismaPlani) => void degistir((d) => planGuncelle(d, plan.id, f));
  const seciliMi = (altId?: string) => secili?.planId === plan.id && secili.altId === altId;
  const sec = (altId?: string) => onSec(seciliMi(altId) ? null : { planId: plan.id, ...(altId ? { altId } : {}) });
  const dur = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <Kart dolgulu={false}>
      <div className={s.planBas}>
        <span className={s.renk} style={{ background: plan.renk }} />
        <DuzenMetni className={s.planAd} deger={plan.ad} etiket="Planın adı" onKaydet={(ad) => ad && guncelle((p) => ({ ...p, ad }))} />
        <select className={s.turSec} value={plan.tur} aria-label="Plan türü" onChange={(e) => guncelle((p) => ({ ...p, tur: e.target.value as PlanTuru }))}>
          {PLAN_TURLERI.map((t) => (
            <option key={t.id} value={t.id}>
              {t.ad}
            </option>
          ))}
        </select>
        <button type="button" className={`${s.ikon} ${s.tehlike}`} aria-label={`${plan.ad} planını sil`} title="Planı sil" onClick={onSil}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className={s.planGovde}>
        <div className={s.satir}>
          <span className={s.soluk}>Toplam</span>
          <SaatAlani dk={plan.hedefDk} etiket="Toplam saat" onKaydet={(hedefDk) => guncelle((p) => ({ ...p, hedefDk }))} />
          <span className={s.soluk}>sa · son tarih</span>
          <input
            type="date"
            className={s.giris}
            value={plan.sonTarih ?? ""}
            aria-label="Planın son tarihi"
            onChange={(e) =>
              guncelle((p) => {
                const { sonTarih: _, ...y } = p;
                return e.target.value ? { ...y, sonTarih: e.target.value } : y;
              })
            }
          />
          {plan.sonTarih && <span className={s.soluk}>{kalanGun(plan.sonTarih, bugun)} gün</span>}
        </div>
        <div className={s.satir}>
          <span className={s.soluk}>Başlangıç</span>
          <input
            type="date"
            className={s.giris}
            value={plan.baslangic ?? ""}
            aria-label="Planın başlangıç tarihi"
            title="Bu günden önce çalışma planlanmaz; boşsa bugünden başlar."
            onChange={(e) =>
              guncelle((p) => {
                const { baslangic: _, ...y } = p;
                return e.target.value ? { ...y, baslangic: e.target.value } : y;
              })
            }
          />
          {!plan.baslangic && <span className={s.soluk}>boş: bugünden</span>}
        </div>
        <span className={s.cubuk}>
          <span className={s.cubukPlanli} style={{ width: yuzde(durum.planliDk) }} />
          <span className={s.cubukYapilan} style={{ width: yuzde(durum.yapilanDk) }} />
        </span>
        <span className={s.durum}>
          <span>{saatMetni(durum.yapilanDk)} yapıldı</span>
          <span>{saatMetni(durum.planliDk)} planlı</span>
          {durum.eksikDk > 0 ? <span className={s.uyari}>{saatMetni(durum.eksikDk)} planlanmadı</span> : <span className={s.iyi}>tamamı planlı</span>}
        </span>
        {altlarTasiyor(plan) && <span className={s.uyari}>Alt planların toplamı planın toplamını aşıyor.</span>}
      </div>

      <div className={s.parcalar}>
        {durum.parcalar.map((x) => {
          const alt = x.altId ? plan.altlar.find((a) => a.id === x.altId) : null;
          const d = durumMetni(x);
          return (
            <div
              key={x.altId ?? "ana"}
              className={seciliMi(x.altId) ? `${s.parca} ${s.parcaSecili}` : s.parca}
              role="button"
              tabIndex={0}
              aria-pressed={seciliMi(x.altId)}
              aria-label={`${x.ad}: planlamak için seç`}
              // A click on a field in the row selects it too, but never unselects it.
              onClick={(e) =>
                (e.target as HTMLElement).closest("input, select")
                  ? onSec({ planId: plan.id, ...(x.altId ? { altId: x.altId } : {}) })
                  : sec(x.altId)
              }
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), sec(x.altId))}
            >
              <div className={s.parcaBas}>
                {alt ? (
                  <span className={s.parcaAdKutu}>
                    <DuzenMetni className={s.parcaAd} deger={alt.ad} etiket="Alt planın adı" onKaydet={(ad) => ad && void degistir((v) => altGuncelle(v, plan.id, alt.id, { ad }))} />
                  </span>
                ) : (
                  <span className={`${s.parcaAd} ${s.parcaAna}`}>{plan.altlar.length ? x.ad : "Genel çalışma"}</span>
                )}
                {alt ? (
                  <span className={s.satir} onKeyDown={dur}>
                    <SaatAlani dk={alt.hedefDk} etiket={`${alt.ad}: saat`} className={s.cokDar} onKaydet={(hedefDk) => void degistir((v) => altGuncelle(v, plan.id, alt.id, { hedefDk }))} />
                    <input
                      type="date"
                      className={`${s.giris} ${s.tarihKucuk}`}
                      value={alt.sonTarih ?? ""}
                      aria-label={`${alt.ad}: son tarih`}
                      onChange={(e) => void degistir((v) => altGuncelle(v, plan.id, alt.id, { sonTarih: e.target.value || undefined }))}
                    />
                    <button
                      type="button"
                      className={`${s.ikon} ${s.tehlike}`}
                      aria-label={`${alt.ad} alt planını sil`}
                      title="Alt planı sil (yapılmış oturumları planın kendisine geçer)"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (seciliMi(alt.id)) onSec(null);
                        const eski = veri;
                        silVeBildir({
                          metin: `"${alt.ad}" alt planı silindi.`,
                          sil: () => degistir((v) => altSil(v, plan.id, alt.id)),
                          // Back with its sessions; edits made meanwhile stay.
                          geriKoy: () =>
                            degistir((v) => {
                              const takvim = { ...v.takvim };
                              for (const [gun, l] of Object.entries(eski.takvim)) {
                                const geri = l.filter((o) => o.planId === plan.id && o.altId === alt.id);
                                if (!geri.length) continue;
                                const ids = new Set(geri.map((o) => o.id));
                                takvim[gun] = [...(takvim[gun] ?? []).filter((o) => !ids.has(o.id)), ...geri];
                              }
                              return planGuncelle({ ...v, takvim }, plan.id, (p) => ({ ...p, altlar: [...p.altlar.filter((a) => a.id !== alt.id), alt] }));
                            }),
                        });
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ) : (
                  <span className={s.soluk}>{saatMetni(x.hedefDk)}</span>
                )}
              </div>
              <span className={s.parcaDurum}>
                {saatMetni(x.yapilanDk)} yapıldı · {saatMetni(x.planliDk)} planlı · <span className={d.sinif}>{d.metin}</span>
              </span>
            </div>
          );
        })}
        {altAcik ? (
          <YeniAltSatiri
            onEkle={(a) => {
              void degistir((v) => altEkle(v, plan.id, a));
              setAltAcik(false);
            }}
            onVazgec={() => setAltAcik(false)}
          />
        ) : (
          <button type="button" className={`${s.metinDugme} ${s.altEkleDugme}`} onClick={() => setAltAcik(true)}>
            <Plus size={12} /> Alt plan
          </button>
        )}
      </div>

      <div className={s.duzenSatiri}>
        {plan.gunDk ? (
          <GunSaatleri
            dk={plan.gunDk}
            etiket={`${plan.ad}: günlere göre saat`}
            onDegis={(gunDk) =>
              guncelle((p) => {
                const { gunDk: _, ...y } = p;
                return gunDk.some((x) => x > 0) ? { ...y, gunDk } : y;
              })
            }
          />
        ) : (
          <div className={s.satir}>
            <span className={s.soluk}>Haftada</span>
            <SaatAlani
              dk={plan.haftalikDk}
              etiket="Haftada kaç saat"
              placeholder="oto"
              bosOlabilir
              onKaydet={(haftalikDk) => guncelle((p) => ({ ...p, haftalikDk }))}
            />
            <span className={s.soluk}>sa</span>
            <GunSecimi gunler={plan.gunler} onDegis={(gunler) => guncelle((p) => ({ ...p, gunler }))} etiket={`${plan.ad}: çalışma günleri`} />
          </div>
        )}
        <button
          type="button"
          className={s.metinDugme}
          onClick={() =>
            guncelle((p) => {
              if (p.gunDk) {
                const { gunDk: _, ...y } = p;
                return { ...y, haftalikDk: haftalikHedef(p), gunler: calismaGunleri(p) };
              }
              // Starts from the current weekly hours, shared over the working days.
              const gunDk = BOS_GUNLER.map((_, g) => (calismaGunleri(p).includes(g) ? (gunPayi(p, g) ?? 0) : 0));
              return gunDk.some((x) => x > 0) ? { ...p, gunDk } : { ...p, gunDk: BOS_GUNLER.map((_, g) => (g === 0 ? 60 : 0)) };
            })
          }
        >
          {plan.gunDk ? "Haftalık toplam saate dön" : "Her güne ayrı saat"}
        </button>
        <TempoNotu plan={plan} veri={veri} bugun={bugun} />
        <Dugme
          tur="cizgili"
          ikon={<Sparkles size={14} />}
          disabled={!haftalikHedef(plan) && gerekenGunluk(veri, plan, bugun) === null}
          onClick={onOtoPlanla}
          title="Kalanı çalışma günlerine yay; en yakın son tarih önce. Elle konan ve yapılmış oturumlar kalır."
        >
          Otomatik planla
        </Dugme>
      </div>
    </Kart>
  );
}

/**
 * The pace the deadlines ask for: with no weekly hours it is what the
 * automatic planning will use; with them, a warning when they are too few.
 */
function TempoNotu({ plan, veri, bugun }: { plan: CalismaPlani; veri: CpDosyasi; bugun: string }) {
  const gereken = gerekenGunluk(veri, plan, bugun);
  const gunSayisi = calismaGunleri(plan).length;
  const gunler = plan.gunler.length || plan.gunDk ? "çalışma gününde" : "her gün";
  const haftalik = haftalikHedef(plan);
  if (!haftalik) {
    if (gereken === null) return <span className={s.soluk}>Otomatik planlama için bir son tarih ya da haftalık saat gir.</span>;
    if (!gereken) return null;
    return (
      <span className={s.tempo}>
        Son tarihe yetişmek için {gunler} ~<b>{saatMetni(gereken)}</b> (haftada ~{saatMetni(gereken * gunSayisi)}).
      </span>
    );
  }
  if (gereken && gereken * gunSayisi > haftalik) {
    return (
      <span className={s.uyari}>
        Haftada {saatMetni(haftalik)} ile son tarihe yetişmez; en az ~{saatMetni(gereken * gunSayisi)} gerekiyor.
        {plan.gunDk ? "" : " Boş bırakırsan Argos hesaplar."}
      </span>
    );
  }
  return null;
}

function YeniAltSatiri({ onEkle, onVazgec }: { onEkle: (a: AltPlan) => void; onVazgec: () => void }) {
  const [ad, setAd] = useState("");
  const [saat, setSaat] = useState("");
  const [sonTarih, setSonTarih] = useState("");
  const dk = saatOku(saat);
  const ekle = () => ad.trim() && dk && onEkle({ id: yeniId("alt"), ad: ad.trim(), hedefDk: dk, ...(sonTarih ? { sonTarih } : {}) });
  return (
    <div className={`${s.satir} ${s.yeniAlt}`}>
      <input className={`${s.giris} ${s.genis}`} autoFocus value={ad} placeholder="Vize" aria-label="Yeni alt planın adı" onChange={(e) => setAd(e.target.value)} />
      <input className={`${s.giris} ${s.cokDar}`} inputMode="decimal" value={saat} placeholder="10" aria-label="Yeni alt planın saati" onChange={(e) => setSaat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ekle()} />
      <span className={s.soluk}>sa</span>
      <input type="date" className={`${s.giris} ${s.tarihKucuk}`} value={sonTarih} aria-label="Yeni alt planın son tarihi" onChange={(e) => setSonTarih(e.target.value)} />
      <button type="button" className={s.ikon} aria-label="Alt planı ekle" disabled={!ad.trim() || !dk} onClick={ekle}>
        <Check size={14} />
      </button>
      <button type="button" className={s.ikon} aria-label="Vazgeç" onClick={onVazgec}>
        <X size={13} />
      </button>
    </div>
  );
}

/* --- sessions ------------------------------------------------------------------------ */

function oturumAdi(d: CpDosyasi, o: Oturum): { plan: CalismaPlani; ad: string } | null {
  const p = planBul(d, o.planId);
  if (!p) return null;
  const a = o.altId ? p.altlar.find((x) => x.id === o.altId) : null;
  return { plan: p, ad: a ? `${p.ad} · ${a.ad}` : p.ad };
}

function OturumListesi({ gun, veri, degistir }: { gun: string; veri: CpDosyasi; degistir: Degistir }) {
  return (
    <>
      {(veri.takvim[gun] ?? []).map((o) => {
        const b = oturumAdi(veri, o);
        if (!b) return null;
        return (
          <div key={o.id} className={s.panelSatir}>
            <input type="checkbox" checked={Boolean(o.yapildi)} aria-label={`${b.ad} ${saatMetni(o.planlananDk ?? o.dk)}: yapıldı`} onChange={(e) => void degistir((d) => oturumIsaretle(d, gun, o.id, e.target.checked))} />
            <span className={s.renk} style={{ background: b.plan.renk }} />
            <span className={s.panelAd}>
              {saatMetni(o.planlananDk ?? o.dk)} · {b.ad}
            </span>
            <input
              key={`${o.dk}-${o.yapildi}`}
              className={`${s.giris} ${s.gunSaatGiris}`}
              inputMode="decimal"
              defaultValue={o.yapildi ? saatYaz(o.dk) : ""}
              placeholder="yapılan"
              title="Ne kadarı yapıldı (saat). Kalanı sonraki otomatik planlamada ileri dağıtılır."
              aria-label={`${b.ad}: yapılan saat`}
              onBlur={(e) => {
                const y = e.target.value.trim() ? saatOku(e.target.value) : 0;
                if (y !== (o.yapildi ? o.dk : 0)) void degistir((d) => oturumKismen(d, gun, o.id, y));
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            {o.planlananDk && <span className={s.soluk}>/{saatMetni(o.planlananDk)}</span>}
            {o.oto && <Sparkles size={11} className={s.soluk} aria-label="otomatik" />}
            <button type="button" className={s.ikon} aria-label={`${b.ad} oturumunu kaldır`} onClick={() => void degistir((d) => oturumSil(d, gun, o.id))}>
              <X size={13} />
            </button>
          </div>
        );
      })}
    </>
  );
}

function OturumEkle({ gun, veri, secili, degistir, odak }: { gun: string; veri: CpDosyasi; secili: Hedef | null; degistir: Degistir; odak?: boolean }) {
  const ilk = secili && planBul(veri, secili.planId) ? secili : veri.planlar[0] ? { planId: veri.planlar[0].id } : null;
  const [hedef, setHedef] = useState<Hedef | null>(ilk);
  const plan = hedef ? planBul(veri, hedef.planId) : null;
  const pay = (plan && (plan.gunDk || plan.gunler.length) && gunPayi(plan, haftaninGunu(gun))) || 60;
  const [saat, setSaat] = useState(saatYaz(pay));
  const dk = saatOku(saat);
  if (veri.planlar.length === 0) return <p className={s.soluk}>Önce soldan bir plan oluştur.</p>;
  const deger = hedef ? `${hedef.planId}|${hedef.altId ?? ""}` : "";
  const ekle = () => hedef && dk && void degistir((d) => oturumEkle(d, gun, { id: yeniId("o"), planId: hedef.planId, ...(hedef.altId ? { altId: hedef.altId } : {}), dk }));
  return (
    <div className={s.panelEkle}>
      <select
        className={s.giris}
        value={deger}
        aria-label="Plan"
        onChange={(e) => {
          const [planId, altId] = e.target.value.split("|");
          setHedef({ planId: planId!, ...(altId ? { altId } : {}) });
        }}
      >
        {veri.planlar.map((p) => [
          <option key={p.id} value={`${p.id}|`}>
            {p.ad}
            {p.altlar.length ? ` · ${ANA_PAY_ADI.toLocaleLowerCase("tr")}` : ""}
          </option>,
          ...p.altlar.map((a) => (
            <option key={a.id} value={`${p.id}|${a.id}`}>
              {p.ad} · {a.ad}
            </option>
          )),
        ])}
      </select>
      <div className={s.satir}>
        <input className={`${s.giris} ${s.dar}`} inputMode="decimal" autoFocus={odak} value={saat} aria-label="Saat" onChange={(e) => setSaat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ekle()} />
        <span className={s.soluk}>saat</span>
        <Dugme tur="dolu" ikon={<Plus size={14} />} disabled={!dk || !hedef} onClick={ekle} style={{ marginLeft: "auto" }}>
          Planla
        </Dugme>
      </div>
    </div>
  );
}

/* --- calendar views ---------------------------------------------------------------- */

interface GorunumOrtak {
  veri: CpDosyasi;
  bugun: string;
  sonTarihler: Map<string, { id: string; renk: string; ad: string; ipucu: string }[]>;
  gorevler: Map<string, { id: string; icerik: string }[]>;
  gunuAc: (gun: string) => (e: MouseEvent<HTMLElement>) => void;
}

function GunIcerigi({ gun, veri, sonTarihler, gorevler, enCok }: Pick<GorunumOrtak, "veri" | "sonTarihler" | "gorevler"> & { gun: string; enCok: number }): ReactNode {
  const g = gorevler.get(gun) ?? [];
  return (
    <>
      {(sonTarihler.get(gun) ?? []).map((x) => (
        <span key={x.id} className={s.sonTarih} style={{ color: x.renk }} title={x.ipucu}>
          <Flag size={10} /> <span className={s.cipMetin}>{x.ad}</span>
        </span>
      ))}
      {(veri.takvim[gun] ?? []).map((o) => {
        const b = oturumAdi(veri, o);
        if (!b) return null;
        return (
          <span key={o.id} className={o.yapildi ? `${s.cip} ${s.cipYapildi}` : s.cip} style={{ borderLeftColor: b.plan.renk }} title={`${b.ad} · ${o.planlananDk ? `${saatMetni(o.dk)}/${saatMetni(o.planlananDk)} yapıldı` : saatMetni(o.dk)}`}>
            {o.yapildi && <Check size={10} />}
            {/* The colour tells the plan; the chip names the sub-plan when there is one. */}
            <span className={s.cipMetin}>
              {saatMetni(o.dk)} · {(o.altId && b.plan.altlar.find((a) => a.id === o.altId)?.ad) || b.plan.ad}
            </span>
          </span>
        );
      })}
      {g.slice(0, enCok).map((t) => (
        <span key={t.id} className={s.gorev} title={t.icerik}>
          {t.icerik}
        </span>
      ))}
      {g.length > enCok && <span className={s.gorev}>+{g.length - enCok} görev</span>}
    </>
  );
}

function AyGorunumu({ bas, son, ay, ...o }: GorunumOrtak & { bas: string; son: string; ay: string }) {
  const haftalar: string[][] = [];
  for (let h = bas; h <= son; h = gunEkle(h, 7)) haftalar.push(Array.from({ length: 7 }, (_, i) => gunEkle(h, i)));
  return (
    <div className={s.izgara} role="grid" aria-label="Ay">
      {GUN_KISA.map((g) => (
        <span key={g} className={s.izgaraBaslik}>
          {g}
        </span>
      ))}
      <span className={`${s.izgaraBaslik} ${s.haftaBaslik}`}>Hafta</span>
      {haftalar.map((hafta) => {
        const e = eforu(o.veri, hafta[0]!);
        return [
          ...hafta.map((gun) => (
            <div
              key={gun}
              className={[s.gun, gun.slice(0, 7) !== ay.slice(0, 7) && s.gunDisi, gun === o.bugun && s.bugun, gun < o.bugun && s.gecmis].filter(Boolean).join(" ")}
              role="gridcell"
              aria-label={`${kisaTarih(gun)} ${GUN_KISA[haftaninGunu(gun)]}`}
              onClick={o.gunuAc(gun)}
            >
              <span className={s.gunNo}>{gunAl(gun)}</span>
              <GunIcerigi gun={gun} veri={o.veri} sonTarihler={o.sonTarihler} gorevler={o.gorevler} enCok={3} />
            </div>
          )),
          <div key={`h-${hafta[0]}`} className={s.haftaToplam} aria-label={`Hafta toplamı ${saatMetni(e.planliDk)}`}>
            {e.planliDk > 0 ? (
              <>
                <span className={s.haftaPlanli}>{saatMetni(e.planliDk)}</span>
                <span className={s.soluk}>{saatMetni(e.yapilanDk)} yapıldı</span>
              </>
            ) : (
              <span className={s.soluk}>—</span>
            )}
          </div>,
        ];
      })}
    </div>
  );
}

function HaftaGorunumu({ bas, ...o }: GorunumOrtak & { bas: string }) {
  const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(bas, i));
  const e = eforu(o.veri, bas);
  return (
    <>
      <div className={s.haftaOzet}>
        Hafta toplamı <b>{saatMetni(e.planliDk)}</b> · {saatMetni(e.yapilanDk)} yapıldı
        {e.planlar.map((x) => (
          <span key={x.plan.id} className={s.haftaPlan}>
            <span className={s.renk} style={{ background: x.plan.renk }} />
            {x.plan.ad} {saatMetni(x.planliDk)}
          </span>
        ))}
      </div>
      <div className={s.hafta} role="grid" aria-label="Hafta">
        {gunler.map((gun) => {
          const dk = eforu(o.veri, gun, 1).planliDk;
          return (
            <div
              key={gun}
              className={[s.haftaGun, gun === o.bugun && s.bugun, gun < o.bugun && s.gecmis].filter(Boolean).join(" ")}
              role="gridcell"
              aria-label={`${kisaTarih(gun)} ${GUN_KISA[haftaninGunu(gun)]}`}
              onClick={o.gunuAc(gun)}
            >
              <div className={s.haftaGunBas}>
                <span>
                  {GUN_KISA[haftaninGunu(gun)]} <span className={s.gunNo}>{gunAl(gun)}</span>
                </span>
                {dk > 0 && <span className={s.soluk}>{saatMetni(dk)}</span>}
              </div>
              <GunIcerigi gun={gun} veri={o.veri} sonTarihler={o.sonTarihler} gorevler={o.gorevler} enCok={6} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function GunGorunumu({ gun, secili, degistir, ...o }: GorunumOrtak & { gun: string; secili: Hedef | null; degistir: Degistir }) {
  const gunDk = eforu(o.veri, gun, 1);
  const hafta = eforu(o.veri, haftaBasi(gun));
  const gorevler = o.gorevler.get(gun) ?? [];
  const sonlar = o.sonTarihler.get(gun) ?? [];
  return (
    <div className={s.gunGorunum}>
      <div className={s.haftaOzet}>
        Gün <b>{saatMetni(gunDk.planliDk)}</b> · {saatMetni(gunDk.yapilanDk)} yapıldı · hafta {saatMetni(hafta.planliDk)}
      </div>
      {sonlar.map((x) => (
        <span key={x.id} className={s.sonTarih} style={{ color: x.renk }}>
          <Flag size={11} /> {x.ipucu}
        </span>
      ))}
      <div className={s.bolumAd}>Çalışma</div>
      {(o.veri.takvim[gun] ?? []).length === 0 && <p className={s.soluk}>Bu güne çalışma konmamış.</p>}
      <OturumListesi gun={gun} veri={o.veri} degistir={degistir} />
      <OturumEkle key={gun} gun={gun} veri={o.veri} secili={secili} degistir={degistir} />
      <div className={s.bolumAd}>Yapılacaklar</div>
      {gorevler.length === 0 ? (
        <p className={s.soluk}>Bu gün için görev yok.</p>
      ) : (
        gorevler.map((t) => (
          <span key={t.id} className={s.gorev}>
            {t.icerik}
          </span>
        ))
      )}
    </div>
  );
}

/* --- Hafta screen ------------------------------------------------------------------ */

/** The week's planned and done effort per plan, on the Hafta screen; hidden until a plan exists. */
export function PlanHaftaKarti({ bas }: { bas: string }) {
  const dosya = useDosya<CpDosyasi>(CP_YOLU);
  const veri = useMemo(() => normalizeCp(dosya.veri), [dosya.veri]);
  const e = useMemo(() => eforu(veri, bas), [veri, bas]);
  if (dosya.yukleniyor || veri.planlar.length === 0) return null;
  return (
    <Kart
      dolgulu={false}
      baslik="Planlar"
      not={e.planliDk ? `${saatMetni(e.planliDk)} planlı · ${saatMetni(e.yapilanDk)} yapıldı` : "bu hafta plan yok"}
      git={{ yol: "/asistan/planlar", metin: "Planla" }}
    >
      {e.planlar.map(({ plan, planliDk, yapilanDk }) => (
        <div key={plan.id} className={s.haftaDers}>
          <span className={s.renk} style={{ background: plan.renk }} />
          <span className={s.panelAd}>{plan.ad}</span>
          <span className={s.soluk}>{saatMetni(yapilanDk)} /</span>
          <b>{saatMetni(planliDk)}</b>
        </div>
      ))}
    </Kart>
  );
}

