import { BookOpen, Check, ChevronLeft, ChevronRight, Clock, Flag, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { AY_ADLARI, AY_TAM, GUN_KISA, ayBasi, gunAl, gunEkle, haftaninGunu } from "@ortak/gun";
import {
  BOS_YL,
  DERS_RENKLERI,
  VARSAYILAN_SAYFA_DK,
  YL_YOLU,
  araHedefEkle,
  araHedefSil,
  dersSil,
  eforDk,
  haftaBasi,
  haftaEforu,
  hedefBul,
  hedefDurumu,
  hedefSil,
  miktarMetni,
  normalizeYl,
  planEkle,
  planIsaretle,
  planSil,
  type AraHedef,
  type Ders,
  type HedefTuru,
  type YlDosyasi,
  type YlHedef,
} from "@ortak/yuksek-lisans";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { Popover } from "@/ui/Popover";
import { silVeBildir } from "@/ui/toast";
import { useBugun, useDosya } from "@/veri/kanca";
import { saatMetni } from "@/veri/plan";
import { useTodoistAralik } from "@/veri/todoist";
import { DuzenMetni } from "./DuzenMetni";
import s from "./yl.module.css";

/**
 * Yüksek Lisans (issue #57): courses with goals — hours by a date, or a
 * book's pages by a date — and a calendar to spread them over study days.
 * The calendar also shows the Yapılacaklar tasks of each day, so a study
 * day is planned around what else is on it, and every week row ends with
 * its effort total (book pages counted with their minutes per page).
 */

let sayac = 0;
const yeniId = (on: string) => `${on}-${Date.now().toString(36)}-${(sayac++).toString(36)}`;

const kisaTarih = (iso: string): string => `${gunAl(iso)} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]}`;

/** Hours typed as "1,5" or "1.5" → minutes; pages as whole numbers. */
function miktarOku(tur: HedefTuru, metin: string): number {
  const n = Number(metin.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return tur === "saat" ? Math.round(n * 60) : Math.round(n);
}

const birim = (tur: HedefTuru) => (tur === "saat" ? "saat" : "sayfa");

/** The month grid: Monday of the first week to Sunday of the last. */
function ayGunleri(ay: string): string[][] {
  const ilk = ayBasi(ay);
  const sonGun = gunEkle(ayBasi(gunEkle(ilk, 31)), -1);
  const haftalar: string[][] = [];
  for (let bas = haftaBasi(ilk); bas <= sonGun; bas = gunEkle(bas, 7)) {
    haftalar.push(Array.from({ length: 7 }, (_, i) => gunEkle(bas, i)));
  }
  return haftalar;
}

export function YuksekLisans() {
  const dosya = useDosya<YlDosyasi>(YL_YOLU);
  const bugun = useBugun();
  const veri = useMemo(() => normalizeYl(dosya.veri), [dosya.veri]);
  const degistir = (f: (d: YlDosyasi) => YlDosyasi) => dosya.degistir((d) => f(normalizeYl(d ?? BOS_YL)));

  const [ay, setAy] = useState(() => ayBasi(bugun));
  const [secili, setSecili] = useState<string | null>(null);
  const [gunAcik, setGunAcik] = useState<{ gun: string; x: number; y: number } | null>(null);

  const haftalar = useMemo(() => ayGunleri(ay), [ay]);
  const bas = haftalar[0]![0]!;
  const son = haftalar.at(-1)![6]!;
  const td = useTodoistAralik(bas, son);
  const buHafta = useMemo(() => haftaEforu(veri, haftaBasi(bugun)), [veri, bugun]);

  const dersler = veri.dersler.filter((x) => !x.arsiv);
  const tumHedefler = dersler.flatMap((ders) => ders.hedefler.map((hedef) => ({ ders, hedef })));
  // Deadlines and checkpoints (vize) on the calendar.
  const sonTarihler = useMemo(() => {
    type Isaret = { id: string; ders: Ders; ad: string; ipucu: string };
    const m = new Map<string, Isaret[]>();
    const ekle = (gun: string, x: Isaret) => (m.get(gun) ?? m.set(gun, []).get(gun)!).push(x);
    for (const { ders, hedef } of tumHedefler) {
      ekle(hedef.sonTarih, { id: hedef.id, ders, ad: hedef.ad, ipucu: `Son tarih: ${hedef.ad}` });
      for (const a of hedef.araHedefler ?? [])
        ekle(a.tarih, { id: a.id, ders, ad: a.ad, ipucu: `${a.ad}: ${hedef.ad} · ${miktarMetni(hedef.tur, a.miktar)}` });
    }
    return m;
  }, [tumHedefler]);

  if (dosya.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Yüksek Lisans" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const dersEkle = (ad: string) =>
    void degistir((d) => ({
      ...d,
      dersler: [...d.dersler, { id: yeniId("ders"), ad, renk: DERS_RENKLERI[d.dersler.length % DERS_RENKLERI.length]!, hedefler: [] }],
    }));

  const dersiSil = (ders: Ders) =>
    silVeBildir({
      metin: `"${ders.ad}" dersi silindi${ders.hedefler.length ? `, ${ders.hedefler.length} hedefiyle` : ""}.`,
      sil: () => degistir((d) => dersSil(d, ders.id)),
      // Back as it was: the course, its goals and their days.
      geriKoy: () => degistir((d) => normalizeYl({ ...d, dersler: [...d.dersler, ders], plan: mergePlan(d, veri, ders) })),
    });

  return (
    <>
      <EkranBasi
        baslik="Yüksek Lisans"
        altyazi={`Bu hafta ${saatMetni(buHafta.planliDk)} planlı · ${saatMetni(buHafta.yapilanDk)} yapıldı`}
      />
      {dosya.hata && <p className={s.soluk}>{dosya.hata}</p>}

      <div className={s.duzen}>
        <div className={s.sol}>
          <YeniDers onEkle={dersEkle} />
          {dersler.length === 0 && (
            <Kart>
              <BosDurum baslik="Henüz ders yok" metin="Bir ders aç, ona saat ya da kitap hedefi koy, sonra takvimde günlere dağıt." />
            </Kart>
          )}
          {dersler.map((ders) => (
            <DersKarti
              key={ders.id}
              ders={ders}
              veri={veri}
              bugun={bugun}
              secili={secili}
              onSec={setSecili}
              degistir={degistir}
              onSil={() => dersiSil(ders)}
            />
          ))}
        </div>

        <Kart dolgulu={false} className={s.takvimKart}>
          <div className={s.takvimBas}>
            <h2 className={s.takvimBaslik}>
              {AY_TAM[Number(ay.slice(5, 7)) - 1]} {ay.slice(0, 4)}
            </h2>
            {secili && hedefBul(veri, secili) ? (
              <span className={s.seciliHedef}>
                Planlanan: <b>{hedefBul(veri, secili)!.hedef.ad}</b> — bir güne tıkla
              </span>
            ) : (
              <span className={s.soluk}>Planlamak için soldan bir hedef seç ya da bir güne tıkla.</span>
            )}
            <div className={s.gez}>
              <Dugme tur="sade" ikon={<ChevronLeft size={16} />} aria-label="Önceki ay" onClick={() => setAy(ayBasi(gunEkle(ay, -1)))} />
              {ay !== ayBasi(bugun) && (
                <Dugme tur="sade" onClick={() => setAy(ayBasi(bugun))}>
                  Bugün
                </Dugme>
              )}
              <Dugme tur="sade" ikon={<ChevronRight size={16} />} aria-label="Sonraki ay" onClick={() => setAy(ayBasi(gunEkle(ay, 32)))} />
            </div>
          </div>

          <div className={s.izgara} role="grid" aria-label="Çalışma planı">
            {GUN_KISA.map((g) => (
              <span key={g} className={s.izgaraBaslik}>
                {g}
              </span>
            ))}
            <span className={`${s.izgaraBaslik} ${s.haftaBaslik}`}>Hafta</span>
            {haftalar.map((hafta) => {
              const efor = haftaEforu(veri, hafta[0]!);
              return [
                ...hafta.map((gun) => {
                  const plan = veri.plan[gun] ?? [];
                  const gorevler = td.gunlere.get(gun) ?? [];
                  const cls = [s.gun, gun.slice(0, 7) !== ay.slice(0, 7) && s.gunDisi, gun === bugun && s.bugun, gun < bugun && s.gecmis]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div
                      key={gun}
                      className={cls}
                      role="gridcell"
                      aria-label={`${kisaTarih(gun)} ${GUN_KISA[haftaninGunu(gun)]}`}
                      onClick={(e: MouseEvent<HTMLDivElement>) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setGunAcik({ gun, x: r.left, y: r.bottom + 4 });
                      }}
                    >
                      <span className={s.gunNo}>{gunAl(gun)}</span>
                      {(sonTarihler.get(gun) ?? []).map(({ id, ders, ad, ipucu }) => (
                        <span key={id} className={s.sonTarih} style={{ color: ders.renk }} title={ipucu}>
                          <Flag size={10} /> <span className={s.cipMetin}>{ad}</span>
                        </span>
                      ))}
                      {plan.map((o) => {
                        const b = hedefBul(veri, o.hedefId);
                        if (!b) return null;
                        return (
                          <span
                            key={o.id}
                            className={o.yapildi ? `${s.cip} ${s.cipYapildi}` : s.cip}
                            style={{ borderLeftColor: b.ders.renk }}
                            title={`${b.ders.ad} · ${b.hedef.ad} · ${miktarMetni(b.hedef.tur, o.miktar)}`}
                          >
                            {o.yapildi && <Check size={10} />}
                            <span className={s.cipMetin}>
                              {miktarMetni(b.hedef.tur, o.miktar)} · {b.hedef.ad}
                            </span>
                          </span>
                        );
                      })}
                      {gorevler.slice(0, 3).map((g) => (
                        <span key={g.id} className={s.gorev} title={g.icerik}>
                          {g.icerik}
                        </span>
                      ))}
                      {gorevler.length > 3 && <span className={s.gorev}>+{gorevler.length - 3} görev</span>}
                    </div>
                  );
                }),
                <div key={`h-${hafta[0]}`} className={s.haftaToplam} aria-label={`Hafta toplamı ${saatMetni(efor.planliDk)}`}>
                  {efor.planliDk > 0 ? (
                    <>
                      <span className={s.haftaPlanli}>{saatMetni(efor.planliDk)}</span>
                      <span className={s.soluk}>{saatMetni(efor.yapilanDk)} yapıldı</span>
                    </>
                  ) : (
                    <span className={s.soluk}>—</span>
                  )}
                </div>,
              ];
            })}
          </div>
        </Kart>
      </div>

      {gunAcik && (
        <GunPaneli
          gun={gunAcik.gun}
          x={gunAcik.x}
          y={gunAcik.y}
          veri={veri}
          bugun={bugun}
          seciliHedef={secili}
          hedefler={tumHedefler}
          gorevSayisi={td.gunlere.get(gunAcik.gun)?.length ?? 0}
          degistir={degistir}
          onKapat={() => setGunAcik(null)}
        />
      )}
    </>
  );
}

/** The days of a deleted course's goals, put back for undo. */
function mergePlan(d: YlDosyasi, eski: YlDosyasi, ders: Ders): YlDosyasi["plan"] {
  const hedefler = new Set(ders.hedefler.map((h) => h.id));
  const plan = { ...d.plan };
  for (const [gun, l] of Object.entries(eski.plan)) {
    const geri = l.filter((o) => hedefler.has(o.hedefId));
    if (geri.length) plan[gun] = [...(plan[gun] ?? []).filter((o) => !hedefler.has(o.hedefId)), ...geri];
  }
  return plan;
}

/* --- left column ----------------------------------------------------------------- */

function YeniDers({ onEkle }: { onEkle: (ad: string) => void }) {
  const [ad, setAd] = useState("");
  const ekle = () => {
    if (!ad.trim()) return;
    onEkle(ad.trim());
    setAd("");
  };
  return (
    <div className={s.yeniDers}>
      <Giris value={ad} placeholder="Yeni ders: Requirements Engineering" aria-label="Yeni dersin adı" onChange={(e) => setAd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ekle()} />
      <Dugme tur="dolu" ikon={<Plus size={15} />} disabled={!ad.trim()} onClick={ekle}>
        Ders
      </Dugme>
    </div>
  );
}

function DersKarti({
  ders,
  veri,
  bugun,
  secili,
  onSec,
  degistir,
  onSil,
}: {
  ders: Ders;
  veri: YlDosyasi;
  bugun: string;
  secili: string | null;
  onSec: (id: string | null) => void;
  degistir: (f: (d: YlDosyasi) => YlDosyasi) => Promise<boolean>;
  onSil: () => void;
}) {
  const [ekleAcik, setEkleAcik] = useState(ders.hedefler.length === 0);
  const dersGuncelle = (f: (x: Ders) => Ders) =>
    void degistir((d) => ({ ...d, dersler: d.dersler.map((x) => (x.id === ders.id ? f(x) : x)) }));

  return (
    <Kart dolgulu={false}>
      <div className={s.dersBas}>
        <span className={s.renk} style={{ background: ders.renk }} />
        <DuzenMetni className={s.dersAd} deger={ders.ad} etiket="Dersin adı" onKaydet={(ad) => ad && dersGuncelle((x) => ({ ...x, ad }))} />
        <button type="button" className={s.ikon} aria-label={`${ders.ad} dersini sil`} title="Dersi sil" onClick={onSil}>
          <Trash2 size={14} />
        </button>
      </div>
      {ders.hedefler.map((h) => {
        const durum = hedefDurumu(veri, h, bugun);
        const yuzde = (x: number) => `${h.miktar ? Math.min(100, (x / h.miktar) * 100) : 0}%`;
        const sec = secili === h.id;
        return (
          <div
            key={h.id}
            className={sec ? `${s.hedef} ${s.hedefSecili}` : s.hedef}
            role="button"
            tabIndex={0}
            aria-pressed={sec}
            aria-label={`${h.ad}: planlamak için seç`}
            onClick={() => onSec(sec ? null : h.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSec(sec ? null : h.id))}
          >
            <div className={s.hedefBas}>
              {h.tur === "saat" ? <Clock size={14} /> : <BookOpen size={14} />}
              <span className={s.hedefAd}>{h.ad}</span>
              <button
                type="button"
                className={s.ikon}
                aria-label={`${h.ad} hedefini sil`}
                title="Hedefi ve planlanan günlerini sil"
                onClick={(e) => {
                  e.stopPropagation();
                  if (sec) onSec(null);
                  const eski = veri;
                  silVeBildir({
                    metin: `"${h.ad}" hedefi silindi.`,
                    sil: () => degistir((d) => hedefSil(d, ders.id, h.id)),
                    geriKoy: () =>
                      degistir((d) =>
                        normalizeYl({
                          ...d,
                          dersler: d.dersler.map((x) => (x.id === ders.id ? { ...x, hedefler: [...x.hedefler, h] } : x)),
                          plan: mergePlan(d, eski, { ...ders, hedefler: [h] }),
                        }),
                      ),
                  });
                }}
              >
                <X size={13} />
              </button>
            </div>
            <span className={s.soluk}>
              {miktarMetni(h.tur, h.miktar)} · son tarih {kisaTarih(h.sonTarih)}
              {durum.kalanGun ? ` · ${durum.kalanGun} gün` : " · süresi geçti"}
            </span>
            <span className={s.cubuk}>
              <span className={s.cubukPlanli} style={{ width: yuzde(durum.planli) }} />
              <span className={s.cubukYapilan} style={{ width: yuzde(durum.yapilan) }} />
              {durum.araHedefler.map((a) => (
                <span key={a.id} className={s.cubukIsaret} style={{ left: yuzde(a.miktar) }} title={`${a.ad}: ${miktarMetni(h.tur, a.miktar)}`} />
              ))}
            </span>
            <span className={s.durum}>
              <span>{miktarMetni(h.tur, durum.yapilan)} yapıldı</span>
              <span>{miktarMetni(h.tur, durum.planli)} planlı</span>
              {durum.plansiz > 0 ? (
                <span className={s.uyari}>{miktarMetni(h.tur, durum.plansiz)} planlanmadı</span>
              ) : (
                <span className={s.iyi}>tamamı planlı</span>
              )}
            </span>
            {durum.yapilan < h.miktar && durum.kalanGun > 0 && (
              <span className={s.soluk}>
                {durum.siradakiAra ? `${durum.siradakiAra.ad} için` : "Bitirmek için"} günde ~{miktarMetni(h.tur, durum.gunluk)}
                {h.tur === "sayfa" ? ` (≈ ${saatMetni(eforDk(h, durum.gunluk))})` : ""}
              </span>
            )}
            <AraHedefler
              hedef={h}
              durum={durum.araHedefler}
              onEkle={(a) => void degistir((d) => araHedefEkle(d, h.id, a))}
              onSil={(id) => void degistir((d) => araHedefSil(d, h.id, id))}
            />
          </div>
        );
      })}
      {ekleAcik ? (
        <YeniHedef
          bugun={bugun}
          onEkle={(h) => {
            dersGuncelle((x) => ({ ...x, hedefler: [...x.hedefler, h] }));
            onSec(h.id);
            setEkleAcik(false);
          }}
          onVazgec={ders.hedefler.length ? () => setEkleAcik(false) : undefined}
        />
      ) : (
        <button type="button" className={s.hedefEkleDugme} onClick={() => setEkleAcik(true)}>
          <Plus size={14} /> Hedef ekle
        </button>
      )}
    </Kart>
  );
}

function YeniHedef({ bugun, onEkle, onVazgec }: { bugun: string; onEkle: (h: YlHedef) => void; onVazgec?: () => void }) {
  const [tur, setTur] = useState<HedefTuru>("saat");
  const [ad, setAd] = useState("");
  const [miktar, setMiktar] = useState("");
  const [sonTarih, setSonTarih] = useState(gunEkle(bugun, 30));
  const [sayfaDk, setSayfaDk] = useState(String(VARSAYILAN_SAYFA_DK));
  const n = miktarOku(tur, miktar);
  const gecerli = n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(sonTarih) && (tur === "saat" || ad.trim());
  const ekle = () => {
    if (!gecerli) return;
    onEkle({
      id: yeniId("hedef"),
      tur,
      ad: ad.trim() || "Çalışma",
      miktar: n,
      sonTarih,
      ...(tur === "sayfa" ? { sayfaDk: Number(sayfaDk.replace(",", ".")) || VARSAYILAN_SAYFA_DK } : {}),
    });
  };
  return (
    <div className={s.yeniHedef}>
      <div className={s.turSecim} role="radiogroup" aria-label="Hedef türü">
        {(
          [
            ["saat", "Saat", <Clock key="c" size={13} />],
            ["sayfa", "Kitap", <BookOpen key="b" size={13} />],
          ] as const
        ).map(([t, etiket, ikon]) => (
          <button key={t} type="button" role="radio" aria-checked={tur === t} className={tur === t ? `${s.tur} ${s.turSecili}` : s.tur} onClick={() => setTur(t)}>
            {ikon} {etiket}
          </button>
        ))}
      </div>
      <input
        className={s.giris}
        value={ad}
        placeholder={tur === "saat" ? "Ad (isteğe bağlı): Çalışma" : "Kitabın adı"}
        aria-label={tur === "saat" ? "Hedefin adı" : "Kitabın adı"}
        onChange={(e) => setAd(e.target.value)}
      />
      <div className={s.satir}>
        <input
          className={`${s.giris} ${s.dar}`}
          inputMode="decimal"
          value={miktar}
          placeholder={tur === "saat" ? "20" : "700"}
          aria-label={tur === "saat" ? "Kaç saat" : "Kaç sayfa"}
          onChange={(e) => setMiktar(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ekle()}
        />
        <span className={s.soluk}>{birim(tur)} · son tarih</span>
        <input type="date" className={s.giris} value={sonTarih} aria-label="Son tarih" onChange={(e) => setSonTarih(e.target.value)} />
      </div>
      {tur === "sayfa" && (
        <div className={s.satir}>
          <span className={s.soluk}>Bir sayfa ~</span>
          <input className={`${s.giris} ${s.cokDar}`} inputMode="decimal" value={sayfaDk} aria-label="Sayfa başına dakika" onChange={(e) => setSayfaDk(e.target.value)} />
          <span className={s.soluk}>dk (haftalık efor için)</span>
        </div>
      )}
      <div className={s.satir}>
        {onVazgec && (
          <Dugme tur="sade" onClick={onVazgec}>
            Vazgeç
          </Dugme>
        )}
        <Dugme tur="dolu" ikon={<Plus size={14} />} disabled={!gecerli} onClick={ekle} style={{ marginLeft: "auto" }}>
          Hedefi ekle
        </Dugme>
      </div>
    </div>
  );
}

/* --- a day's plan ---------------------------------------------------------------- */

function GunPaneli({
  gun,
  x,
  y,
  veri,
  bugun,
  seciliHedef,
  hedefler,
  gorevSayisi,
  degistir,
  onKapat,
}: {
  gun: string;
  x: number;
  y: number;
  veri: YlDosyasi;
  bugun: string;
  seciliHedef: string | null;
  hedefler: { ders: Ders; hedef: YlHedef }[];
  gorevSayisi: number;
  degistir: (f: (d: YlDosyasi) => YlDosyasi) => Promise<boolean>;
  onKapat: () => void;
}) {
  const [hedefId, setHedefId] = useState(seciliHedef && hedefler.some((h) => h.hedef.id === seciliHedef) ? seciliHedef : (hedefler[0]?.hedef.id ?? ""));
  const secilen = hedefler.find((h) => h.hedef.id === hedefId) ?? null;
  // A day's share as the starting amount: what is left, spread to the deadline.
  const oneri = secilen ? hedefDurumu(veri, secilen.hedef, bugun).gunluk : 0;
  const [miktar, setMiktar] = useState(() =>
    secilen && oneri ? (secilen.hedef.tur === "saat" ? String(Math.round((oneri / 60) * 4) / 4 || 0.25) : String(oneri)) : "",
  );
  const plan = veri.plan[gun] ?? [];
  const efor = haftaEforu(veri, haftaBasi(gun));
  const n = secilen ? miktarOku(secilen.hedef.tur, miktar) : 0;

  const ekle = () => {
    if (!secilen || !n) return;
    void degistir((d) => planEkle(d, gun, { id: yeniId("p"), hedefId: secilen.hedef.id, miktar: n }));
  };

  return (
    <Popover x={x} y={y} onClose={onKapat} label={`${kisaTarih(gun)} planı`} className={s.panel}>
      <div className={s.panelBas}>
        <b>
          {kisaTarih(gun)} {GUN_KISA[haftaninGunu(gun)]}
        </b>
        <span className={s.soluk}>
          {gorevSayisi ? `${gorevSayisi} görev · ` : ""}hafta {saatMetni(efor.planliDk)}
        </span>
      </div>
      {plan.map((o) => {
        const b = hedefBul(veri, o.hedefId);
        if (!b) return null;
        return (
          <div key={o.id} className={s.panelSatir}>
            <input
              type="checkbox"
              checked={Boolean(o.yapildi)}
              aria-label={`${b.hedef.ad} ${miktarMetni(b.hedef.tur, o.miktar)}: yapıldı`}
              onChange={(e) => void degistir((d) => planIsaretle(d, gun, o.id, e.target.checked))}
            />
            <span className={s.renk} style={{ background: b.ders.renk }} />
            <span className={s.panelAd}>
              {miktarMetni(b.hedef.tur, o.miktar)} · {b.hedef.ad}
            </span>
            <button type="button" className={s.ikon} aria-label={`${b.hedef.ad} planını kaldır`} onClick={() => void degistir((d) => planSil(d, gun, o.id))}>
              <X size={13} />
            </button>
          </div>
        );
      })}
      {hedefler.length === 0 ? (
        <p className={s.soluk}>Önce soldan bir ders açıp hedef ekle.</p>
      ) : (
        <div className={s.panelEkle}>
          <select
            className={s.giris}
            value={hedefId}
            aria-label="Hedef"
            onChange={(e) => {
              setHedefId(e.target.value);
              setMiktar("");
            }}
          >
            {hedefler.map(({ ders, hedef }) => (
              <option key={hedef.id} value={hedef.id}>
                {ders.ad} · {hedef.ad}
              </option>
            ))}
          </select>
          <div className={s.satir}>
            <input
              className={`${s.giris} ${s.dar}`}
              inputMode="decimal"
              autoFocus
              value={miktar}
              aria-label={secilen?.hedef.tur === "sayfa" ? "Sayfa" : "Saat"}
              onChange={(e) => setMiktar(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ekle()}
            />
            <span className={s.soluk}>{secilen ? birim(secilen.hedef.tur) : ""}</span>
            <Dugme tur="dolu" ikon={<Plus size={14} />} disabled={!n} onClick={ekle} style={{ marginLeft: "auto" }}>
              Planla
            </Dugme>
          </div>
        </div>
      )}
    </Popover>
  );
}

/* --- Hafta screen ------------------------------------------------------------------ */

/**
 * The week's study effort on the Hafta screen (issue #57): planned and
 * done per course. Nothing shows until a course exists.
 */
export function YlHaftaKarti({ bas }: { bas: string }) {
  const dosya = useDosya<YlDosyasi>(YL_YOLU);
  const veri = useMemo(() => normalizeYl(dosya.veri), [dosya.veri]);
  const efor = useMemo(() => haftaEforu(veri, bas), [veri, bas]);
  if (dosya.yukleniyor || veri.dersler.length === 0) return null;
  return (
    <Kart
      dolgulu={false}
      baslik="Yüksek lisans"
      not={efor.planliDk ? `${saatMetni(efor.planliDk)} planlı · ${saatMetni(efor.yapilanDk)} yapıldı` : "bu hafta plan yok"}
      git={{ yol: "/asistan/yuksek-lisans", metin: "Planla" }}
    >
      {efor.dersler.map(({ ders, planliDk, yapilanDk }) => (
        <div key={ders.id} className={s.haftaDers}>
          <span className={s.renk} style={{ background: ders.renk }} />
          <span className={s.panelAd}>{ders.ad}</span>
          <span className={s.soluk}>{saatMetni(yapilanDk)} /</span>
          <b>{saatMetni(planliDk)}</b>
        </div>
      ))}
    </Kart>
  );
}

/* --- checkpoints (vize) ---------------------------------------------------------- */

/**
 * A goal's checkpoints: "Vize · 5 Kas · 10 sa", each saying whether the
 * calendar has enough planned by then. Optional: a goal shows only the
 * small "+ Ara hedef" link until one is added.
 */
function AraHedefler({
  hedef,
  durum,
  onEkle,
  onSil,
}: {
  hedef: YlHedef;
  durum: ReturnType<typeof hedefDurumu>["araHedefler"];
  onEkle: (a: AraHedef) => void;
  onSil: (id: string) => void;
}) {
  const [acik, setAcik] = useState(false);
  const [ad, setAd] = useState("Vize");
  const [tarih, setTarih] = useState("");
  const [miktar, setMiktar] = useState("");
  const n = miktarOku(hedef.tur, miktar);
  const gecerli = Boolean(ad.trim() && /^\d{4}-\d{2}-\d{2}$/.test(tarih) && n > 0);
  const ekle = () => {
    if (!gecerli) return;
    onEkle({ id: yeniId("ara"), ad: ad.trim(), tarih, miktar: n });
    setAcik(false);
    setTarih("");
    setMiktar("");
  };
  return (
    // Clicks here must not select or unselect the goal around it.
    <div className={s.aralar} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {durum.map((a) => (
        <div key={a.id} className={s.ara}>
          <Flag size={11} />
          <span className={s.araAd}>{a.ad}</span>
          <span className={s.soluk}>
            {kisaTarih(a.tarih)} · {miktarMetni(hedef.tur, a.miktar)}
          </span>
          {a.ulasildi ? (
            <span className={s.iyi}>ulaşıldı</span>
          ) : a.yetisir ? (
            <span className={s.iyi}>planı yetiyor</span>
          ) : (
            <span className={a.gecti ? s.hata : s.uyari}>
              {a.gecti ? "kaçtı" : `${miktarMetni(hedef.tur, a.miktar - a.planli)} eksik planlı`}
            </span>
          )}
          <button type="button" className={s.ikon} aria-label={`${a.ad} ara hedefini sil`} onClick={() => onSil(a.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
      {acik ? (
        <div className={s.satir}>
          <input className={`${s.giris} ${s.orta}`} value={ad} aria-label="Ara hedefin adı" onChange={(e) => setAd(e.target.value)} />
          <input type="date" className={s.giris} value={tarih} aria-label="Ara hedefin tarihi" onChange={(e) => setTarih(e.target.value)} />
          <input
            className={`${s.giris} ${s.dar}`}
            inputMode="decimal"
            value={miktar}
            placeholder={hedef.tur === "saat" ? "10" : "300"}
            aria-label={hedef.tur === "saat" ? "O tarihe kadar kaç saat" : "O tarihe kadar kaçıncı sayfa"}
            onChange={(e) => setMiktar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ekle()}
          />
          <span className={s.soluk}>{birim(hedef.tur)}</span>
          <button type="button" className={s.ikon} aria-label="Ara hedefi ekle" disabled={!gecerli} onClick={ekle}>
            <Plus size={14} />
          </button>
          <button type="button" className={s.ikon} aria-label="Vazgeç" onClick={() => setAcik(false)}>
            <X size={13} />
          </button>
        </div>
      ) : (
        <button type="button" className={s.araEkle} onClick={() => setAcik(true)}>
          <Plus size={12} /> Ara hedef (vize, ödev…)
        </button>
      )}
    </div>
  );
}
