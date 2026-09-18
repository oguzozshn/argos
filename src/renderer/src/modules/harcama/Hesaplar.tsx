import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { paraCoz, paraGiris, paraMetni } from "@ortak/para";
import { HESAP_TURU_ADLARI, hesapBakiyeleri, type Hesap, type HesapTuru } from "@ortak/harcama";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { useHarcama } from "./kanca";
import { hesapSirasi, kisaTarih, yeniId } from "./tipler";
import s from "./harcama.module.css";

const YENI_HESAP = (sira: number): Hesap => ({
  id: yeniId(),
  ad: "",
  tur: "banka",
  renk: "#5b8def",
  simge: "",
  acilisKurus: 0,
  referans: "",
  arsiv: false,
  sira,
});

export function Hesaplar() {
  const defter = useHarcama(true);
  const [duzenlenen, setDuzenlenen] = useState<Hesap | null>(null);
  const [arsivGoster, setArsivGoster] = useState(false);

  const { tanimlar, islemler } = defter;
  const simge = tanimlar.ayarlar.simge;

  const sirali = useMemo(() => tanimlar.hesaplar.slice().sort(hesapSirasi), [tanimlar.hesaplar]);
  const bakiyeler = useMemo(
    () => hesapBakiyeleri(sirali.filter((h) => arsivGoster || !h.arsiv), islemler),
    [sirali, islemler, arsivGoster],
  );

  const varlik = bakiyeler.filter((b) => b.bakiye > 0).reduce((a, b) => a + b.bakiye, 0);
  const borc = bakiyeler.filter((b) => b.bakiye < 0).reduce((a, b) => a - b.bakiye, 0);

  const yaz = (hesaplar: Hesap[]) => void defter.tanimlariYaz({ ...tanimlar, hesaplar });

  const kaydet = (hesap: Hesap) => {
    const ad = hesap.ad.trim();
    if (!ad) return;
    // Ad tekil: iki hesabı ayırt edemeyen bir liste bakiyeyi de ayırt ettirmez.
    if (tanimlar.hesaplar.some((h) => h.id !== hesap.id && h.ad.trim() === ad)) return;
    const varOlan = tanimlar.hesaplar.some((h) => h.id === hesap.id);
    yaz(varOlan ? tanimlar.hesaplar.map((h) => (h.id === hesap.id ? { ...hesap, ad } : h)) : [...tanimlar.hesaplar, { ...hesap, ad }]);
    setDuzenlenen(null);
  };

  const tasi = (id: string, yon: number) => {
    const liste = sirali.slice();
    const yer = liste.findIndex((h) => h.id === id);
    const hedef = yer + yon;
    if (yer < 0 || hedef < 0 || hedef >= liste.length) return;
    [liste[yer], liste[hedef]] = [liste[hedef]!, liste[yer]!];
    // Bütün liste yeniden numaralanıyor: arşivleme ve silme sonrası sıralar
    // boşluklu ya da eşit olabiliyor, iki değeri takas etmek onu kurtarmaz.
    yaz(liste.map((h, i) => ({ ...h, sira: i + 1 })));
  };

  const sil = (hesap: Hesap) => {
    if (!confirm(`"${hesap.ad}" hesabı silinecek.`)) return;
    yaz(tanimlar.hesaplar.filter((h) => h.id !== hesap.id));
  };

  const arsivle = (hesap: Hesap, arsiv: boolean) =>
    yaz(tanimlar.hesaplar.map((h) => (h.id === hesap.id ? { ...h, arsiv } : h)));

  if (defter.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Hesaplar" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  return (
    <>
      <EkranBasi
        baslik="Hesaplar"
        altyazi="Paranın durduğu yer. Bakiye, açılış bakiyesi artı hesaba yazılan her şey."
        sag={
          <div className={s.eylemler}>
            <Dugme tur="sade" onClick={() => setArsivGoster(!arsivGoster)}>
              {arsivGoster ? "Arşivi gizle" : "Arşivi göster"}
            </Dugme>
            {!duzenlenen && (
              <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={() => setDuzenlenen(YENI_HESAP(sirali.length + 1))}>
                Hesap ekle
              </Dugme>
            )}
          </div>
        }
      />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}

      <div className={s.duzen}>
        {duzenlenen && (
          <Kart>
            <HesapFormu
              key={duzenlenen.id}
              baslangic={duzenlenen}
              onKaydet={kaydet}
              onIptal={() => setDuzenlenen(null)}
            />
          </Kart>
        )}

        <div className={s.dosemeler}>
          <div className={s.doseme}>
            <span className={s.dosemeBaslik}>Varlık</span>
            <span className={`${s.dosemeDeger} ${s.gelir}`}>{paraMetni(varlik, simge)}</span>
          </div>
          <div className={s.doseme}>
            <span className={s.dosemeBaslik}>Borç</span>
            <span className={`${s.dosemeDeger} ${s.gider}`}>{paraMetni(borc, simge)}</span>
          </div>
          <div className={s.doseme}>
            <span className={s.dosemeBaslik}>Net</span>
            <span className={s.dosemeDeger}>{paraMetni(varlik - borc, simge)}</span>
          </div>
        </div>

        <Kart dolgulu={false}>
          {bakiyeler.length === 0 ? (
            <BosDurum
              baslik="Hesap yok"
              metin="Nakit, banka ya da kredi kartı ekleyince bakiyeler burada toplanır."
              eylem={
                <Dugme ikon={<Plus size={15} />} onClick={() => setDuzenlenen(YENI_HESAP(1))}>
                  Hesap ekle
                </Dugme>
              }
            />
          ) : (
            <div className={s.satirlar}>
              {bakiyeler.map((b) => {
                const kullanim = islemler.filter((i) => i.hesapId === b.hesap.id).length;
                return (
                  <Satir
                    key={b.hesap.id}
                    sol={<span className={s.nokta} style={{ background: b.hesap.renk }} />}
                    baslik={
                      <>
                        {b.hesap.simge ? `${b.hesap.simge} ${b.hesap.ad}` : b.hesap.ad}{" "}
                        <Etiket>{HESAP_TURU_ADLARI[b.hesap.tur]}</Etiket>
                        {b.hesap.arsiv && <Etiket tur="uyari">arşiv</Etiket>}
                      </>
                    }
                    alt={
                      <>
                        {kullanim} hareket
                        {b.sonHareket ? ` · son ${kisaTarih(b.sonHareket)}` : ""}
                        {b.hesap.referans ? ` · ${b.hesap.referans}` : ""}
                        {b.kartBorcu > 0 ? ` · borç ${paraMetni(b.kartBorcu, simge)}` : ""}
                      </>
                    }
                    sag={
                      <div className={s.satirEylem}>
                        <span className={`${s.tutar} ${b.bakiye < 0 ? s.gider : s.gelir}`}>
                          {paraMetni(b.bakiye, simge)}
                        </span>
                        <Dugme tur="sade" ikon={<ChevronUp size={15} />} aria-label="Yukarı" onClick={() => tasi(b.hesap.id, -1)} />
                        <Dugme tur="sade" ikon={<ChevronDown size={15} />} aria-label="Aşağı" onClick={() => tasi(b.hesap.id, 1)} />
                        <Dugme tur="sade" ikon={<Pencil size={15} />} aria-label="Düzenle" onClick={() => setDuzenlenen(b.hesap)} />
                        <Dugme
                          tur="sade"
                          ikon={b.hesap.arsiv ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                          aria-label={b.hesap.arsiv ? "Arşivden çıkar" : "Arşivle"}
                          onClick={() => arsivle(b.hesap, !b.hesap.arsiv)}
                        />
                        {/* Hareketi olan hesap silinmez: bakiye geçmişi sessizce bozulurdu. */}
                        {kullanim === 0 && (
                          <Dugme tur="sade" ikon={<Trash2 size={15} />} aria-label="Sil" onClick={() => sil(b.hesap)} />
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </Kart>
      </div>
    </>
  );
}

function HesapFormu({
  baslangic,
  onKaydet,
  onIptal,
}: {
  baslangic: Hesap;
  onKaydet: (hesap: Hesap) => void;
  onIptal: () => void;
}) {
  const [ad, setAd] = useState(baslangic.ad);
  const [tur, setTur] = useState<HesapTuru>(baslangic.tur);
  const [renk, setRenk] = useState(baslangic.renk);
  const [simge, setSimge] = useState(baslangic.simge);
  const [acilis, setAcilis] = useState(paraGiris(baslangic.acilisKurus));
  const [referans, setReferans] = useState(baslangic.referans);
  // Okunamayan açılış bakiyesi 0 sayılsa hesabın bütün bakiye geçmişi kayardı.
  const acilisKurus = acilis.trim() === "" ? 0 : paraCoz(acilis);

  return (
    <div className={s.duzen}>
      <div className={s.form}>
        <label className={s.alan}>
          <span className={s.etiket}>Ad</span>
          <input className={s.metin} value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Tür</span>
          <select className={s.secim} value={tur} onChange={(e) => setTur(e.target.value as HesapTuru)}>
            {(Object.keys(HESAP_TURU_ADLARI) as HesapTuru[]).map((t) => (
              <option key={t} value={t}>
                {HESAP_TURU_ADLARI[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Açılış bakiyesi</span>
          <input
            className={`${s.metin} ${s.sayiAlani}`}
            value={acilis}
            inputMode="decimal"
            onChange={(e) => setAcilis(e.target.value)}
          />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Son dört hane</span>
          <Giris value={referans} onChange={(e) => setReferans(e.target.value)} />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Simge</span>
          <Giris value={simge} maxLength={4} placeholder="💳" onChange={(e) => setSimge(e.target.value)} />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Renk</span>
          <input className={s.metin} type="color" value={renk} onChange={(e) => setRenk(e.target.value)} />
        </label>
      </div>
      <div className={s.eylemler}>
        {acilisKurus === null && <span className={s.soluk}>Açılış bakiyesi okunamadı</span>}
        <Dugme
          tur="dolu"
          ikon={<Check size={15} />}
          disabled={acilisKurus === null}
          onClick={() =>
            acilisKurus !== null &&
            onKaydet({
              ...baslangic,
              ad,
              tur,
              renk,
              simge: simge.trim(),
              acilisKurus,
              referans: referans.trim(),
            })
          }
        >
          Kaydet
        </Dugme>
        <Dugme tur="sade" ikon={<X size={15} />} onClick={onIptal}>
          Vazgeç
        </Dugme>
      </div>
    </div>
  );
}
