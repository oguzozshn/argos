import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AY_ADLARI, gunAl, gunFarki } from "@ortak/gun";
import {
  BOS_PLANLAR,
  PLAN_YOLU,
  altEkle,
  bittiMi,
  dugumGuncelle,
  dugumSil,
  geriKoy,
  ilerleme,
  isaretle,
  konum,
  normalizePlanlar,
  planEkle,
  siradaki,
  tasi,
  type PlanDosyasi,
  type PlanDugumu,
} from "@ortak/planlar";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { useBugun, useDosya } from "@/veri/kanca";
import { DuzenMetni } from "./DuzenMetni";
import s from "./planlar.module.css";

/**
 * Planlar (issue #69): plans of things to do, split into sub-plans as deep
 * as needed. The plans are listed on the left; the open one shows as an
 * outline on the right, where a step is ticked, given a date, moved or
 * split into its own sub-plans. A branch is done when all its steps are.
 */

let sayac = 0;
const yeniId = () => `pl-${Date.now().toString(36)}-${(sayac++).toString(36)}`;
const yeniDugum = (ad: string): PlanDugumu => ({ id: yeniId(), ad: ad.trim(), altlar: [] });

const kisaTarih = (iso: string): string => `${gunAl(iso)} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`;

type Degistir = (f: (d: PlanDosyasi) => PlanDosyasi) => Promise<boolean>;

export function Planlar() {
  const dosya = useDosya<PlanDosyasi>(PLAN_YOLU);
  const bugun = useBugun();
  const veri = useMemo(() => normalizePlanlar(dosya.veri), [dosya.veri]);
  const degistir: Degistir = (f) => dosya.degistir((d) => f(normalizePlanlar(d ?? BOS_PLANLAR)));
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [yeni, setYeni] = useState("");

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

  const secili = veri.planlar.find((p) => p.id === seciliId) ?? veri.planlar[0] ?? null;

  const ekle = () => {
    if (!yeni.trim()) return;
    const p = yeniDugum(yeni);
    void degistir((d) => planEkle(d, p));
    setSeciliId(p.id);
    setYeni("");
  };

  /** Deletes a plan or a sub-plan with everything under it; undo puts it back in its place. */
  const sil = (n: PlanDugumu) => {
    const yer = konum(veri, n.id);
    if (!yer) return;
    const alt = ilerleme(n).toplam;
    silVeBildir({
      metin: `"${n.ad}" silindi${n.altlar.length ? ` (${alt} adımıyla)` : ""}.`,
      sil: () => degistir((d) => dugumSil(d, n.id)),
      geriKoy: () => degistir((d) => geriKoy(d, n, yer)),
    });
  };

  return (
    <>
      <EkranBasi baslik="Planlar" altyazi="Yapacağın işler; her biri alt planlara bölünebilir." />
      {dosya.hata && <p className={s.soluk}>{dosya.hata}</p>}

      <div className={s.duzen}>
        <div className={s.sol}>
          <div className={s.yeni}>
            <Giris
              value={yeni}
              placeholder="Yeni plan: Ev taşıma"
              aria-label="Yeni planın adı"
              onChange={(e) => setYeni(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ekle()}
            />
            <Dugme tur="dolu" ikon={<Plus size={15} />} disabled={!yeni.trim()} onClick={ekle}>
              Plan
            </Dugme>
          </div>
          <nav className={s.liste} aria-label="Planlar">
            {veri.planlar.map((p) => {
              const x = ilerleme(p);
              const bitti = p.altlar.length > 0 && bittiMi(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={[s.listeSatir, p.id === secili?.id && s.listeSecili, bitti && s.listeBitti].filter(Boolean).join(" ")}
                  aria-current={p.id === secili?.id}
                  onClick={() => setSeciliId(p.id)}
                >
                  <span className={s.listeAd}>{p.ad}</span>
                  {p.altlar.length > 0 && (
                    <span className={s.soluk}>
                      {x.biten}/{x.toplam}
                    </span>
                  )}
                  <span className={s.ince}>
                    <span style={{ width: `${p.altlar.length ? (x.biten / x.toplam) * 100 : 0}%` }} />
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {secili ? (
          <PlanDetayi key={secili.id} plan={secili} bugun={bugun} degistir={degistir} onSil={sil} />
        ) : (
          <Kart>
            <BosDurum baslik="Henüz plan yok" metin="Soldan bir plan aç; altına adımlar ve alt planlar eklersin." />
          </Kart>
        )}
      </div>
    </>
  );
}

function PlanDetayi({
  plan,
  bugun,
  degistir,
  onSil,
}: {
  plan: PlanDugumu;
  bugun: string;
  degistir: Degistir;
  onSil: (n: PlanDugumu) => void;
}) {
  const x = ilerleme(plan);
  const sonraki = plan.altlar.length ? siradaki(plan) : null;
  return (
    <Kart dolgulu={false}>
      <div className={s.bas}>
        <DuzenMetni
          className={s.baslik}
          deger={plan.ad}
          etiket="Planın adı"
          onKaydet={(ad) => ad && void degistir((d) => dugumGuncelle(d, plan.id, { ad }))}
        />
        <TarihAlani n={plan} bugun={bugun} degistir={degistir} />
        <button type="button" className={`${s.ikon} ${s.tehlike}`} aria-label="Planı sil" title="Planı sil" onClick={() => onSil(plan)}>
          <Trash2 size={15} />
        </button>
      </div>
      <div className={s.ozet}>
        <span className={s.cubuk}>
          <span style={{ width: `${plan.altlar.length ? (x.biten / x.toplam) * 100 : 0}%` }} />
        </span>
        <span className={s.soluk}>
          {plan.altlar.length ? `${x.biten}/${x.toplam} adım` : "henüz adım yok"}
          {sonraki && ` · sıradaki: ${sonraki.ad}`}
        </span>
      </div>
      <div className={s.not}>
        <DuzenMetni
          cokSatir
          deger={plan.not ?? ""}
          etiket="Planın notu"
          placeholder="Not: neden, ne zamana, neye dikkat…"
          onKaydet={(not) => void degistir((d) => dugumGuncelle(d, plan.id, { not }))}
        />
      </div>

      <div className={s.agac} role="tree" aria-label={plan.ad}>
        {plan.altlar.map((a, i) => (
          <Dal key={a.id} n={a} derinlik={0} ilk={i === 0} son={i === plan.altlar.length - 1} bugun={bugun} degistir={degistir} onSil={onSil} />
        ))}
        <YeniSatir derinlik={0} yer="Yeni adım ya da alt plan" onEkle={(ad) => void degistir((d) => altEkle(d, plan.id, yeniDugum(ad)))} />
      </div>
    </Kart>
  );
}

function Dal({
  n,
  derinlik,
  ilk,
  son,
  bugun,
  degistir,
  onSil,
}: {
  n: PlanDugumu;
  derinlik: number;
  ilk: boolean;
  son: boolean;
  bugun: string;
  degistir: Degistir;
  onSil: (n: PlanDugumu) => void;
}) {
  const [altAcik, setAltAcik] = useState(false);
  const dal = n.altlar.length > 0;
  const x = ilerleme(n);
  const bitti = bittiMi(n);
  const acik = dal && !n.kapali;

  return (
    <div role="treeitem" aria-expanded={dal ? acik : undefined} aria-label={n.ad}>
      <div className={bitti ? `${s.satir} ${s.satirBitti}` : s.satir} style={{ paddingLeft: 12 + derinlik * 24 }}>
        {dal ? (
          <button
            type="button"
            className={s.katla}
            aria-label={acik ? `${n.ad}: kapat` : `${n.ad}: aç`}
            onClick={() => void degistir((d) => dugumGuncelle(d, n.id, { kapali: acik || undefined }))}
          >
            {acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className={s.katla} />
        )}
        <input
          type="checkbox"
          checked={bitti}
          aria-label={`${n.ad}: bitti`}
          onChange={(e) => void degistir((d) => isaretle(d, n.id, e.target.checked))}
        />
        <DuzenMetni
          className={dal ? `${s.ad} ${s.adDal}` : s.ad}
          deger={n.ad}
          etiket={`Adım: ${n.ad}`}
          onKaydet={(ad) => ad && void degistir((d) => dugumGuncelle(d, n.id, { ad }))}
        />
        {dal && (
          <span className={s.soluk}>
            {x.biten}/{x.toplam}
          </span>
        )}
        <TarihAlani n={n} bugun={bugun} degistir={degistir} />
        <span className={s.eylemler}>
          <button type="button" className={s.ikon} aria-label={`${n.ad}: alt plan ekle`} title="Alt plan ekle" onClick={() => setAltAcik(true)}>
            <Plus size={14} />
          </button>
          <button type="button" className={s.ikon} disabled={ilk} aria-label={`${n.ad}: yukarı taşı`} onClick={() => void degistir((d) => tasi(d, n.id, -1))}>
            <ArrowUp size={13} />
          </button>
          <button type="button" className={s.ikon} disabled={son} aria-label={`${n.ad}: aşağı taşı`} onClick={() => void degistir((d) => tasi(d, n.id, 1))}>
            <ArrowDown size={13} />
          </button>
          <button type="button" className={`${s.ikon} ${s.tehlike}`} aria-label={`${n.ad}: sil`} onClick={() => onSil(n)}>
            <X size={14} />
          </button>
        </span>
      </div>
      {acik &&
        n.altlar.map((a, i) => (
          <Dal key={a.id} n={a} derinlik={derinlik + 1} ilk={i === 0} son={i === n.altlar.length - 1} bugun={bugun} degistir={degistir} onSil={onSil} />
        ))}
      {altAcik && (
        <YeniSatir
          derinlik={derinlik + 1}
          yer={`${n.ad} altına`}
          odak
          onEkle={(ad) => void degistir((d) => altEkle(d, n.id, yeniDugum(ad)))}
          onKapat={() => setAltAcik(false)}
        />
      )}
    </div>
  );
}

function YeniSatir({
  derinlik,
  yer,
  odak,
  onEkle,
  onKapat,
}: {
  derinlik: number;
  yer: string;
  odak?: boolean;
  onEkle: (ad: string) => void;
  onKapat?: () => void;
}) {
  const [ad, setAd] = useState("");
  return (
    <div className={s.yeniSatir} style={{ paddingLeft: 12 + derinlik * 24 + 22 }}>
      <Plus size={14} className={s.soluk} />
      <input
        className={s.yeniGiris}
        value={ad}
        autoFocus={odak}
        placeholder={yer}
        aria-label={yer}
        onChange={(e) => setAd(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ad.trim()) {
            onEkle(ad);
            setAd("");
          }
          if (e.key === "Escape") onKapat?.();
        }}
        onBlur={() => !ad.trim() && onKapat?.()}
      />
    </div>
  );
}

/** A small date field; red when the date passed and the step is still open. */
function TarihAlani({ n, bugun, degistir }: { n: PlanDugumu; bugun: string; degistir: Degistir }) {
  const gecti = Boolean(n.tarih && n.tarih < bugun && !bittiMi(n));
  const fark = n.tarih ? gunFarki(n.tarih, bugun) : null;
  return (
    <input
      type="date"
      className={[s.tarih, !n.tarih && s.tarihBos, gecti && s.tarihGecti].filter(Boolean).join(" ")}
      value={n.tarih ?? ""}
      aria-label={`${n.ad}: tarih`}
      title={n.tarih ? `${kisaTarih(n.tarih)}${fark !== null && fark >= 0 ? ` · ${fark ? `${fark} gün sonra` : "bugün"}` : " · geçti"}` : "Tarih ver"}
      onChange={(e) => void degistir((d) => dugumGuncelle(d, n.id, { tarih: e.target.value || undefined }))}
    />
  );
}
