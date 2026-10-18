import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { normalizeHedefler, type HedefDosyasi } from "@ortak/hedef-duzen";
import { roadmapOzet } from "@ortak/ozet";
import {
  adimEkle,
  adimGuncelle,
  adimSil,
  adimTasi,
  asamaEkle,
  asamaGuncelle,
  asamaSil,
  asamaTasi,
  roadmapSlug,
  suAnYap,
  yeniRoadmap,
  type DuzenRoadmap,
} from "@ortak/roadmap-duzen";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { bildir, silVeBildir } from "@/ui/toast";
import { kopru, useDosya } from "@/veri/kanca";
import { usePlanVerisi } from "@/veri/plan";
import { DuzenMetni } from "./DuzenMetni";
import s from "./asistan.module.css";
import d from "./duzen.module.css";

/**
 * Yol haritaları. Tahminler `@ortak/ozet`'ten geliyor, yani eski
 * uygulamayla aynı sayılar (parite testi).
 *
 * Issue #56: a new roadmap can be started here, and each one edited in
 * place — goal, the goal it serves, stages with their steps, and which
 * stage is current. Every change is written to `roadmap/<slug>.json`
 * right away; fields this screen does not show are kept.
 */
const tarihYaz = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, a, g] = iso.split("-");
  return `${Number(g)}.${a}.${y}`;
};

const rmYolu = (slug: string) => `roadmap/${slug}.json`;

export function YolHaritalari() {
  const { haftalar, kurallar, roadmapler, bugun, yukleniyor, tazele } = usePlanVerisi();
  const hedefDosyasi = useDosya<HedefDosyasi>("hedefler.json");
  const hedefler = useMemo(() => normalizeHedefler(hedefDosyasi.veri).hedefler.filter((h) => !h.bitti), [hedefDosyasi.veri]);
  const liste = useMemo(
    () => roadmapOzet(haftalar, kurallar, roadmapler, bugun),
    [haftalar, kurallar, roadmapler, bugun],
  );
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);
  // "?yeni=Gitar" from Yetenekler opens the new roadmap form for that area.
  const [params, setParams] = useSearchParams();
  const [yeniAcik, setYeniAcik] = useState(() => params.has("yeni"));

  const olustur = async (alan: string, hedef: string, hedefId: string) => {
    const k = kopru();
    if (!k) return;
    const slug = roadmapSlug(alan, roadmapler.map((r) => r.slug));
    const rm: DuzenRoadmap = { ...yeniRoadmap(alan, hedef, slug), ...(hedefId ? { hedefId } : {}) };
    const r = await k.veri.yaz(rmYolu(slug), rm, null);
    if (!r.ok) {
      bildir({ metin: "Yol haritası yazılamadı.", tur: "hata" });
      return;
    }
    await tazele();
    setYeniAcik(false);
    setParams({}, { replace: true });
    setDuzenlenen(slug);
  };

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Yol haritaları" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  return (
    <>
      <EkranBasi
        baslik="Yol haritaları"
        altyazi="Tahminler ölçülen hızdan; ölçüm iki haftaya varmadıysa plandan."
        sag={
          !yeniAcik && (
            <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={() => setYeniAcik(true)}>
              Yeni yol haritası
            </Dugme>
          )
        }
      />

      {yeniAcik && (
        <YeniHarita
          alanlar={kurallar.alanlar ?? []}
          dolu={roadmapler.map((r) => r.alan)}
          ilkAlan={params.get("yeni") ?? ""}
          hedefler={hedefler}
          onOlustur={olustur}
          onVazgec={() => {
            setYeniAcik(false);
            setParams({}, { replace: true });
          }}
        />
      )}

      {liste.length === 0 && !yeniAcik && (
        <Kart>
          <BosDurum baslik="Yol haritası yok" metin="Bir yetenek için aşamalı bir yol haritası başlat." />
        </Kart>
      )}

      {liste.map((r) =>
        duzenlenen === r.slug ? (
          <HaritaDuzenleyici key={r.slug} slug={r.slug} hedefler={hedefler} onKapat={() => setDuzenlenen(null)} onSilindi={() => void tazele()} />
        ) : (
          <Kart
            key={r.slug}
            dolgulu={false}
            baslik={r.alan}
            not={`${r.adimBiten}/${r.adimToplam} adım`}
            className={s.rmKart}
            bas={
              <Dugme tur="sade" ikon={<Pencil size={14} />} onClick={() => setDuzenlenen(r.slug)}>
                Düzenle
              </Dugme>
            }
          >
            <div className={s.rmGovde}>
              <p className={s.rmHedef}>{r.hedef}</p>

              <div className={s.ilerlemeYuva}>
                <div
                  className={s.ilerleme}
                  style={{ width: `${r.adimToplam ? (r.adimBiten / r.adimToplam) * 100 : 0}%` }}
                />
              </div>

              <div className={s.rmSatir}>
                <Etiket tur="vurgu">
                  Aşama {Math.min(r.suAnAsama + 1, r.asamaSayisi)}/{r.asamaSayisi} ·{" "}
                  {r.suAnAsamaAd}
                </Etiket>
                <Etiket>{r.kalanSaat} saat kaldı</Etiket>
                {r.hizKaynagi && (
                  <Etiket tur={r.hizKaynagi === "olculen" ? "iyi" : "uyari"}>
                    {r.hizKaynagi === "olculen" ? "ölçülen" : "plan"} · haftada {r.haftalikDk} dk
                  </Etiket>
                )}
              </div>
            </div>

            {r.siradakiAdim && (
              <Satir
                baslik={r.siradakiAdim}
                alt="sıradaki adım"
                sag={
                  r.tahminiBitis ? (
                    <Etiket>
                      ~{r.tahminiHafta} hafta · {tarihYaz(r.tahminiBitis)}
                    </Etiket>
                  ) : null
                }
              />
            )}
          </Kart>
        ),
      )}
    </>
  );
}

/* --- new roadmap ------------------------------------------------------------------ */

function YeniHarita({
  alanlar,
  dolu,
  ilkAlan,
  hedefler,
  onOlustur,
  onVazgec,
}: {
  alanlar: string[];
  /** Areas that already have a roadmap: suggested last. */
  dolu: string[];
  ilkAlan: string;
  hedefler: { id: string; ad: string }[];
  onOlustur: (alan: string, hedef: string, hedefId: string) => Promise<void>;
  onVazgec: () => void;
}) {
  const [alan, setAlan] = useState(ilkAlan);
  const [hedef, setHedef] = useState("");
  const [hedefId, setHedefId] = useState("");
  const [yaziliyor, setYaziliyor] = useState(false);
  const oneriler = [...alanlar.filter((a) => !dolu.includes(a)), ...alanlar.filter((a) => dolu.includes(a))];
  const gonder = async () => {
    if (!alan.trim() || yaziliyor) return;
    setYaziliyor(true);
    await onOlustur(alan.trim(), hedef.trim(), hedefId);
    setYaziliyor(false);
  };

  return (
    <Kart dolgulu={false} baslik="Yeni yol haritası" className={s.rmKart}>
      <div className={d.govde}>
        <div className={d.satir}>
          <input
            className={`${d.kucukGiris} ${d.genisGiris}`}
            style={{ height: 36 }}
            list="rm-alanlar"
            value={alan}
            autoFocus={!ilkAlan}
            placeholder="Yetenek: Almanca"
            aria-label="Yetenek"
            onChange={(e) => setAlan(e.target.value)}
          />
          <datalist id="rm-alanlar">
            {oneriler.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <select className={d.secim} style={{ height: 36 }} value={hedefId} aria-label="Bağlı hedef" onChange={(e) => setHedefId(e.target.value)}>
            <option value="">hedefe bağlama</option>
            {hedefler.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ad}
              </option>
            ))}
          </select>
        </div>
        <Giris
          value={hedef}
          autoFocus={Boolean(ilkAlan)}
          placeholder="Hedef: bu haritanın sonunda ne yapıyor olacaksın?"
          aria-label="Haritanın hedefi"
          onChange={(e) => setHedef(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void gonder()}
        />
        <span className={d.soluk}>İlk aşama seviye tespiti olarak açılır; aşamaları ve adımları sonra eklersin.</span>
      </div>
      <div className={d.altSerit}>
        <Dugme tur="sade" onClick={onVazgec}>
          Vazgeç
        </Dugme>
        <Dugme tur="dolu" ikon={<Plus size={15} />} disabled={!alan.trim() || yaziliyor} onClick={() => void gonder()}>
          Oluştur
        </Dugme>
      </div>
    </Kart>
  );
}

/* --- editor ---------------------------------------------------------------------- */

function HaritaDuzenleyici({
  slug,
  hedefler,
  onKapat,
  onSilindi,
}: {
  slug: string;
  hedefler: { id: string; ad: string }[];
  onKapat: () => void;
  onSilindi: () => void;
}) {
  const yol = rmYolu(slug);
  const dosya = useDosya<DuzenRoadmap>(yol);
  const [yeniAsama, setYeniAsama] = useState("");
  const rm = dosya.veri;
  const degistir = (f: (r: DuzenRoadmap) => DuzenRoadmap) => void dosya.degistir((r) => (r ? f(r) : r!));

  if (dosya.yukleniyor || !rm) {
    return (
      <Kart className={s.rmKart}>
        <Yuklenirken />
      </Kart>
    );
  }

  const su = rm.suAnAsama ?? 0;
  const sil = () => {
    const k = kopru();
    if (!k) return;
    onKapat();
    silVeBildir({
      metin: `"${rm.alan}" yol haritası silindi.`,
      sil: async () => {
        const r = await k.veri.sil(yol);
        onSilindi();
        return r.ok;
      },
      geriKoy: async () => {
        const r = await k.veri.yaz(yol, rm, null);
        onSilindi();
        return r.ok;
      },
    });
  };

  return (
    <Kart dolgulu={false} className={s.rmKart}>
      <div className={d.govde}>
        <DuzenMetni
          className={d.baslikMetni}
          deger={rm.alan}
          etiket="Yetenek"
          onKaydet={(alan) => alan && degistir((r) => ({ ...r, alan }))}
        />
        <div className={d.bolum}>
          <span className={d.bolumAd}>Hedef</span>
          <DuzenMetni
            cokSatir
            deger={rm.hedef ?? ""}
            etiket="Hedef"
            placeholder="Bu haritanın sonunda ne yapıyor olacaksın?"
            onKaydet={(hedef) => degistir((r) => ({ ...r, hedef }))}
          />
        </div>
        <div className={d.bolum}>
          <span className={d.bolumAd}>Başlangıç</span>
          <DuzenMetni
            cokSatir
            deger={rm.baslangic ?? ""}
            etiket="Başlangıç"
            placeholder="Şu an neredesin, elinde ne var?"
            onKaydet={(baslangic) => degistir((r) => ({ ...r, baslangic }))}
          />
        </div>
        <div className={d.satir}>
          <span className={d.soluk}>Bağlı hedef</span>
          <select
            className={d.secim}
            value={rm.hedefId ?? ""}
            aria-label="Bağlı hedef"
            onChange={(e) => degistir((r) => ({ ...r, hedefId: e.target.value || null }))}
          >
            <option value="">yok</option>
            {hedefler.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ad}
              </option>
            ))}
            {rm.hedefId && !hedefler.some((h) => h.id === rm.hedefId) && <option value={rm.hedefId}>(kapalı ya da silinmiş hedef)</option>}
          </select>
        </div>

        <span className={d.bolumAd}>Aşamalar</span>
        {rm.asamalar.map((a, i) => (
          <div key={i} className={i === su ? `${d.asama} ${d.asamaSuAn}` : d.asama}>
            <div className={d.asamaBas}>
              <span className={d.asamaNo}>{i}</span>
              <DuzenMetni
                deger={a.ad}
                etiket={`Aşama ${i} adı`}
                onKaydet={(ad) => ad && degistir((r) => asamaGuncelle(r, i, { ad }))}
              />
              <button
                type="button"
                className={i === su ? `${d.suAnDugme} ${d.suAnSecili}` : d.suAnDugme}
                aria-pressed={i === su}
                title="Şu an çalışılan aşama"
                onClick={() => degistir((r) => suAnYap(r, i))}
              >
                şu an
              </button>
              <input
                key={`${i}-${a.tahminiSaat ?? 0}`}
                type="number"
                min={0}
                step={1}
                className={`${d.kucukGiris} ${d.dar}`}
                defaultValue={a.tahminiSaat ?? 0}
                aria-label={`Aşama ${i} tahmini saat`}
                title="Tahmini saat"
                onBlur={(e) => {
                  const saat = Math.max(0, Number(e.target.value) || 0);
                  if (saat !== (a.tahminiSaat ?? 0)) degistir((r) => asamaGuncelle(r, i, { tahminiSaat: saat }));
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              <span className={d.soluk}>sa</span>
              <button type="button" className={d.ikonDugme} disabled={i === 0} aria-label="Aşamayı yukarı taşı" onClick={() => degistir((r) => asamaTasi(r, i, -1))}>
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className={d.ikonDugme}
                disabled={i === rm.asamalar.length - 1}
                aria-label="Aşamayı aşağı taşı"
                onClick={() => degistir((r) => asamaTasi(r, i, 1))}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className={`${d.ikonDugme} ${d.tehlike}`}
                disabled={rm.asamalar.length === 1}
                aria-label="Aşamayı sil"
                title={a.adimlar.length ? `Aşamayı ${a.adimlar.length} adımıyla sil` : "Aşamayı sil"}
                onClick={() => degistir((r) => asamaSil(r, i))}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {a.adimlar.map((x, j) => (
              <div key={j} className={x.yapildi ? `${d.adim} ${d.adimYapildi}` : d.adim}>
                <input
                  type="checkbox"
                  checked={Boolean(x.yapildi)}
                  aria-label={`${x.metin}: yapıldı`}
                  onChange={(e) => degistir((r) => adimGuncelle(r, i, j, { yapildi: e.target.checked }))}
                />
                <DuzenMetni
                  deger={x.metin}
                  etiket={`Adım: ${x.metin}`}
                  onKaydet={(metin) => degistir((r) => (metin ? adimGuncelle(r, i, j, { metin }) : adimSil(r, i, j)))}
                />
                <button type="button" className={d.ikonDugme} disabled={j === 0} aria-label="Adımı yukarı taşı" onClick={() => degistir((r) => adimTasi(r, i, j, -1))}>
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className={d.ikonDugme}
                  disabled={j === a.adimlar.length - 1}
                  aria-label="Adımı aşağı taşı"
                  onClick={() => degistir((r) => adimTasi(r, i, j, 1))}
                >
                  <ArrowDown size={13} />
                </button>
                <button type="button" className={`${d.ikonDugme} ${d.tehlike}`} aria-label="Adımı sil" onClick={() => degistir((r) => adimSil(r, i, j))}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <div className={d.adimEkle}>
              <AdimEkle onEkle={(metin) => degistir((r) => adimEkle(r, i, metin))} />
            </div>
            <div className={d.adimEkle}>
              <DuzenMetni
                deger={a.bittiSayilir ?? ""}
                etiket={`Aşama ${i}: bitti sayılır`}
                placeholder="Bitti sayılır: …"
                className={d.soluk}
                onKaydet={(bittiSayilir) => degistir((r) => asamaGuncelle(r, i, { bittiSayilir }))}
              />
            </div>
          </div>
        ))}
        <div className={d.satir}>
          <input
            className={`${d.kucukGiris} ${d.genisGiris}`}
            value={yeniAsama}
            placeholder="Yeni aşama"
            aria-label="Yeni aşamanın adı"
            onChange={(e) => setYeniAsama(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && yeniAsama.trim()) {
                degistir((r) => asamaEkle(r, yeniAsama));
                setYeniAsama("");
              }
            }}
          />
          <Dugme
            tur="cizgili"
            ikon={<Plus size={14} />}
            disabled={!yeniAsama.trim()}
            onClick={() => {
              degistir((r) => asamaEkle(r, yeniAsama));
              setYeniAsama("");
            }}
          >
            Aşama ekle
          </Dugme>
        </div>
        {dosya.hata && <span className={d.soluk}>{dosya.hata}</span>}
      </div>
      <div className={d.altSerit}>
        <Dugme tur="sade" ikon={<Trash2 size={14} />} onClick={sil}>
          Yol haritasını sil
        </Dugme>
        <Dugme tur="dolu" onClick={onKapat}>
          Bitti
        </Dugme>
      </div>
    </Kart>
  );
}

function AdimEkle({ onEkle }: { onEkle: (metin: string) => void }) {
  const [metin, setMetin] = useState("");
  const ekle = () => {
    if (!metin.trim()) return;
    onEkle(metin);
    setMetin("");
  };
  return (
    <div className={d.satir}>
      <input
        className={`${d.kucukGiris} ${d.genisGiris}`}
        value={metin}
        placeholder="Yeni adım"
        aria-label="Yeni adım"
        onChange={(e) => setMetin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ekle()}
      />
      <button type="button" className={d.ikonDugme} aria-label="Adım ekle" disabled={!metin.trim()} onClick={ekle}>
        <Plus size={14} />
      </button>
    </div>
  );
}
