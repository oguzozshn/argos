import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AY_ADLARI } from "@ortak/gun";
import {
  TARIH_DESENI,
  hedefSirasi,
  kalanMetni,
  normalizeHedefler,
  yeniHedefId,
  type HedefDosyasi,
  type HedefKaydi,
} from "@ortak/hedef-duzen";
import { hedefOzet, roadmapOzet } from "@ortak/ozet";
import { bugunIso } from "@ortak/plan";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { useGoalPrograms } from "@/ui/ProgramDays";
import { silVeBildir } from "@/ui/toast";
import { useDosya } from "@/veri/kanca";
import { usePlanVerisi } from "@/veri/plan";
import { DuzenMetni } from "./DuzenMetni";
import s from "./duzen.module.css";

/**
 * Hedefler (issue #56): the long goals the plan serves ("Yurt dışında
 * yüksek lisans"). Roadmaps and habits link to a goal with `hedefId`; the
 * goal shows them with what is left. Same `hedefler.json` app.py reads.
 */

/** "2026-10-18" → "18 Eki 2026", "2028-09" → "Eyl 2028". */
const tarihMetni = (t: string): string => {
  const [y, a, g] = t.split("-");
  return [g && Number(g), a && AY_ADLARI[Number(a) - 1], y].filter(Boolean).join(" ");
};

interface BagliRoadmap {
  slug: string;
  alan: string;
  adimBiten: number;
  adimToplam: number;
  kalanSaat: number;
}
type HedefOzeti = HedefKaydi & { roadmapler: BagliRoadmap[]; aliskanliklar: string[] };

export function Hedefler() {
  const dosya = useDosya<HedefDosyasi>("hedefler.json");
  const { haftalar, kurallar, roadmapler, bugun, yukleniyor } = usePlanVerisi();
  const programlar = useGoalPrograms();
  const [ad, setAd] = useState("");
  const [tarih, setTarih] = useState("");

  const veri = useMemo(() => normalizeHedefler(dosya.veri), [dosya.veri]);
  // Linked roadmaps and habits, from the same summary the old app shows.
  const bagli = useMemo(() => {
    const ozet = hedefOzet(veri, roadmapOzet(haftalar, kurallar, roadmapler, bugun), kurallar);
    return new Map((ozet.hedefler as HedefOzeti[]).map((h) => [h.id, h]));
  }, [veri, haftalar, kurallar, roadmapler, bugun]);

  const degistir = (f: (h: HedefKaydi[]) => HedefKaydi[]) =>
    dosya.degistir((d) => {
      const n = normalizeHedefler(d);
      return { ...n, hedefler: f(n.hedefler) };
    });
  const guncelle = (id: string, patch: Partial<HedefKaydi>) =>
    void degistir((l) => l.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  const tarihGecerli = !tarih.trim() || TARIH_DESENI.test(tarih.trim());
  const ekle = () => {
    if (!ad.trim() || !tarihGecerli) return;
    const h: HedefKaydi = { id: yeniHedefId(new Date()), ad: ad.trim(), not: "", eklendi: bugunIso() };
    if (tarih.trim()) h.hedefTarih = tarih.trim();
    void degistir((l) => [...l, h]);
    setAd("");
    setTarih("");
  };

  const sil = (h: HedefKaydi) => {
    const yer = veri.hedefler.findIndex((x) => x.id === h.id);
    silVeBildir({
      metin: `"${h.ad}" hedefi silindi.`,
      sil: () => degistir((l) => l.filter((x) => x.id !== h.id)),
      geriKoy: () =>
        degistir((l) => {
          const liste = l.filter((x) => x.id !== h.id);
          liste.splice(Math.min(yer, liste.length), 0, h);
          return liste;
        }),
    });
  };

  if (dosya.yukleniyor || yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Hedefler" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const sirali = [...veri.hedefler].sort(hedefSirasi);
  const acik = sirali.filter((h) => !h.bitti);
  const biten = sirali.filter((h) => h.bitti);

  const kart = (h: HedefKaydi) => {
    const b = bagli.get(h.id);
    const kalan = h.bitti ? null : kalanMetni(h.hedefTarih, bugun);
    const prog = programlar.get(h.id) ?? [];
    const bagYok = prog.length === 0 && (!b || (b.roadmapler.length === 0 && b.aliskanliklar.length === 0));
    return (
      <Kart key={h.id} dolgulu={false} className={h.bitti ? s.hedefBitti : undefined}>
        <div className={s.govde}>
          <DuzenMetni
            className={s.baslikMetni}
            deger={h.ad}
            etiket="Hedefin adı"
            onKaydet={(yeni) => yeni && guncelle(h.id, { ad: yeni })}
          />
          <div className={s.satir}>
            {h.bitti ? (
              <Etiket tur="iyi">ulaşıldı · {tarihMetni(h.bitti)}</Etiket>
            ) : (
              kalan && <Etiket tur={kalan === "süresi geçti" ? "hata" : "vurgu"}>{kalan}</Etiket>
            )}
            <span className={s.soluk}>hedef tarih</span>
            <input
              key={h.hedefTarih ?? ""}
              className={`${s.kucukGiris} ${s.orta}`}
              defaultValue={h.hedefTarih ?? ""}
              placeholder="2028-09"
              aria-label="Hedef tarih"
              title="YYYY, YYYY-AA ya da YYYY-AA-GG"
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t === (h.hedefTarih ?? "")) return;
                if (t && !TARIH_DESENI.test(t)) {
                  e.target.value = h.hedefTarih ?? "";
                  return;
                }
                guncelle(h.id, { hedefTarih: t || undefined });
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </div>
          <DuzenMetni
            cokSatir
            deger={h.not ?? ""}
            etiket="Not"
            placeholder="Not: neden, hangi karara bağlı…"
            onKaydet={(yeni) => guncelle(h.id, { not: yeni })}
          />

          {!bagYok && (
            <div className={s.bolum}>
              <span className={s.bolumAd}>Bağlı</span>
              {prog.map((p) => (
                <div key={p.id} className={s.bagliSatir}>
                  <Link to={`/programs/?p=${encodeURIComponent(p.id)}`} className={s.bag}>
                    {p.name}
                  </Link>
                  <span className={s.cubukYuva}>
                    <span className={s.cubuk} style={{ display: "block", width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                  </span>
                  <span className={s.soluk}>
                    {p.done}/{p.total} · {p.ended ? "bitti" : p.week > 0 ? `${p.week}. hafta / ${p.weeks}` : "başlamadı"}
                  </span>
                </div>
              ))}
              {(b?.roadmapler ?? []).map((r) => (
                <div key={r.slug} className={s.bagliSatir}>
                  <Link to="/asistan/roadmap" className={s.bag}>
                    {r.alan}
                  </Link>
                  <span className={s.cubukYuva}>
                    <span
                      className={s.cubuk}
                      style={{ display: "block", width: `${r.adimToplam ? (r.adimBiten / r.adimToplam) * 100 : 0}%` }}
                    />
                  </span>
                  <span className={s.soluk}>
                    {r.adimBiten}/{r.adimToplam} adım · {r.kalanSaat} sa kaldı
                  </span>
                </div>
              ))}
              {b && b.aliskanliklar.length > 0 && (
                <div className={s.satir}>
                  {b.aliskanliklar.map((a) => (
                    <Etiket key={a}>{a}</Etiket>
                  ))}
                </div>
              )}
            </div>
          )}
          {bagYok && !h.bitti && (
            <span className={s.soluk}>Bağlı yol haritası ya da program yok. Yol haritaları ya da Programlar ekranında bu hedefe bağlayabilirsin.</span>
          )}
        </div>
        <div className={s.altSerit}>
          {h.bitti ? (
            <Dugme tur="sade" ikon={<RotateCcw size={14} />} onClick={() => guncelle(h.id, { bitti: null })}>
              Yeniden aç
            </Dugme>
          ) : (
            <Dugme tur="sade" ikon={<Check size={14} />} onClick={() => guncelle(h.id, { bitti: bugunIso() })}>
              Ulaşıldı
            </Dugme>
          )}
          <Dugme tur="sade" ikon={<Trash2 size={14} />} onClick={() => sil(h)}>
            Sil
          </Dugme>
        </div>
      </Kart>
    );
  };

  return (
    <>
      <EkranBasi
        baslik="Hedefler"
        altyazi="Planın hizmet ettiği uzun hedefler. Yol haritaları ve alışkanlıklar bir hedefe bağlanır."
      />

      <div className={s.ust}>
        <Giris
          value={ad}
          placeholder="Yeni hedef: Yurt dışında yüksek lisans"
          aria-label="Yeni hedefin adı"
          onChange={(e) => setAd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ekle()}
        />
        <input
          className={`${s.kucukGiris} ${s.orta}`}
          style={{ height: "auto", alignSelf: "stretch" }}
          value={tarih}
          placeholder="tarih: 2028-09"
          title="YYYY, YYYY-AA ya da YYYY-AA-GG"
          aria-label="Yeni hedefin tarihi"
          aria-invalid={!tarihGecerli}
          onChange={(e) => setTarih(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ekle()}
        />
        <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={ekle} disabled={!ad.trim() || !tarihGecerli}>
          Ekle
        </Dugme>
      </div>
      {dosya.hata && <p className={s.soluk}>{dosya.hata}</p>}

      {sirali.length === 0 ? (
        <Kart>
          <BosDurum baslik="Henüz hedef yok" metin="Yukarıdan bir hedef ekle; tarih yıl, ay ya da gün olabilir." />
        </Kart>
      ) : (
        <div className={s.izgara}>{acik.map(kart)}</div>
      )}

      {biten.length > 0 && (
        <>
          <h2 className={s.bolumAd} style={{ margin: "28px 0 12px" }}>
            Ulaşılanlar
          </h2>
          <div className={s.izgara}>{biten.map(kart)}</div>
        </>
      )}
    </>
  );
}
