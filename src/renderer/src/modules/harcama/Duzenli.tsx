import { useState } from "react";
import { Check, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { paraCoz, paraGiris, paraMetni } from "@ortak/para";
import { duzenlemeyeUyarla, sonrakiTekrar, tekSeferlik } from "@ortak/duzenli";
import { ODEME_ADLARI, TUR_ADLARI, type Duzenli as Kural, type Hesap, type Kategori, type Odeme } from "@ortak/harcama";
import { bugunIso } from "@ortak/plan";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { useHarcama } from "./kanca";
import { hesapSirasi, kategoriAdi, kategoriSirasi, kisaTarih, yeniId } from "./tipler";
import s from "./harcama.module.css";

const YENI = (kategoriId: string, hesapId: string | null): Kural => ({
  id: yeniId(),
  ad: "",
  kategoriId,
  tur: "gider",
  kurus: 0,
  ayinGunu: 1,
  karsiTaraf: "",
  odeme: "havale",
  hesapId,
  baslangic: bugunIso(),
  bitis: null,
  durdu: false,
});

export function Duzenli() {
  const defter = useHarcama(true);
  const [duzenlenen, setDuzenlenen] = useState<Kural | null>(null);

  const { tanimlar, islemler, bugun } = defter;
  const simge = tanimlar.ayarlar.simge;
  const kategoriler = tanimlar.kategoriler.slice().sort(kategoriSirasi);
  const hesaplar = tanimlar.hesaplar.filter((h) => !h.arsiv).sort(hesapSirasi);

  const yaz = (duzenliler: Kural[]) => void defter.tanimlariYaz({ ...tanimlar, duzenliler });

  const kaydet = (kural: Kural) => {
    const ad = kural.ad.trim();
    const kategori = tanimlar.kategoriler.find((k) => k.id === kural.kategoriId);
    if (!ad || !kategori || kural.kurus <= 0) return;
    // Tür kategoriden kopyalanır; kural sonradan yön değiştirse geçmiş bozulmasın.
    const tam: Kural = { ...kural, ad, tur: kategori.tur };
    const varOlan = tanimlar.duzenliler.find((d) => d.id === kural.id);
    // Günü ya da başlangıcı değişen kural geçmişi yeniden üretmesin.
    yaz(
      varOlan
        ? tanimlar.duzenliler.map((d) => (d.id === kural.id ? duzenlemeyeUyarla(varOlan, tam, islemler, bugun) : d))
        : [...tanimlar.duzenliler, tam],
    );
    setDuzenlenen(null);
  };

  const durdur = (kural: Kural, durdu: boolean) =>
    yaz(
      tanimlar.duzenliler.map((d) =>
        d.id === kural.id ? duzenlemeyeUyarla(d, { ...d, durdu }, islemler, bugun) : d,
      ),
    );

  const sil = (kural: Kural) => {
    const uretilen = islemler.filter((i) => i.duzenliId === kural.id).length;
    // Bağı koparılan işlemler hatırlanır: geri alma onları kurala yeniden bağlar.
    let baglilar: string[] = [];
    silVeBildir({
      metin:
        uretilen > 0
          ? `"${kural.ad}" kuralı silindi. Ürettiği ${uretilen} işlem defterde kaldı.`
          : `"${kural.ad}" kuralı silindi.`,
      // Önce kural gider: kural yoksa üretim de yok. Bağ koparma düşerse
      // işlemler kurala bağlı kalır — zararsız, hata şeritte görünür.
      sil: async () => {
        const ok = await defter.tanimlariDegistir((t) => ({
          ...t,
          duzenliler: t.duzenliler.filter((d) => d.id !== kural.id),
        }));
        if (!ok) return false;
        baglilar = (await defter.duzenliBaginiKaldir(kural.id)) ?? [];
        return true;
      },
      // Önce işlemler bağlanır, kural en son döner. Tersi sırada bağlama yarım
      // kalırsa kural geri gelmiş olur ve bağsız kalan aylar için bir sonraki
      // açılışta yinelenen kayıt üretirdi.
      geriKoy: async () => {
        if (baglilar.length > 0 && !(await defter.duzenliBaginiGeriKoy(kural.id, baglilar))) return false;
        return defter.tanimlariDegistir((t) =>
          t.duzenliler.some((d) => d.id === kural.id) ? t : { ...t, duzenliler: [...t.duzenliler, kural] },
        );
      },
    });
  };

  if (defter.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Düzenli" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const sirali = tanimlar.duzenliler
    .slice()
    .sort((a, b) =>
      a.durdu !== b.durdu ? (a.durdu ? 1 : -1) : a.ayinGunu !== b.ayinGunu ? a.ayinGunu - b.ayinGunu : a.ad.localeCompare(b.ad, "tr"),
    );

  return (
    <>
      <EkranBasi
        baslik="Düzenli"
        altyazi="Her ay tekrar eden kalemler. Vadesi gelen kayıt gerçek işlem olarak yazılır."
        sag={
          !duzenlenen && (
            <Dugme
              tur="dolu"
              ikon={<Plus size={15} />}
              onClick={() =>
                setDuzenlenen(YENI(kategoriler.find((k) => k.tur === "gider" && !k.arsiv)?.id ?? "", hesaplar[0]?.id ?? null))
              }
            >
              Kural ekle
            </Dugme>
          )
        }
      />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}

      <div className={s.duzen}>
        {duzenlenen && (
          <Kart>
            <KuralFormu
              key={duzenlenen.id}
              baslangic={duzenlenen}
              kategoriler={kategoriler}
              hesaplar={hesaplar}
              onKaydet={kaydet}
              onIptal={() => setDuzenlenen(null)}
            />
          </Kart>
        )}

        <Kart dolgulu={false}>
          {sirali.length === 0 ? (
            <BosDurum
              baslik="Kural yok"
              metin="Kira, abonelik ya da maaş gibi her ay tekrar eden kalemleri buraya yazınca defter kendi kendine dolar."
            />
          ) : (
            <div className={s.satirlar}>
              {sirali.map((k) => {
                const kategori = tanimlar.kategoriler.find((c) => c.id === k.kategoriId);
                const hesap = tanimlar.hesaplar.find((h) => h.id === k.hesapId);
                const sonraki = sonrakiTekrar(k, bugun);
                const uretilen = islemler.filter((i) => i.duzenliId === k.id).length;
                return (
                  <Satir
                    key={k.id}
                    sol={<span className={s.nokta} style={{ background: kategori?.renk ?? "#8b93a3" }} />}
                    baslik={
                      <>
                        {k.ad} {k.durdu && <Etiket tur="uyari">durduruldu</Etiket>}
                        {tekSeferlik(k) && <Etiket>tek seferlik</Etiket>}
                      </>
                    }
                    alt={
                      <>
                        her ayın {k.ayinGunu}. günü · {kategori?.ad ?? "kategorisiz"}
                        {hesap ? ` · ${hesap.ad}` : " · hesapsız"} · {uretilen} işlem üretti
                        {sonraki ? ` · sıradaki ${kisaTarih(sonraki)}` : " · bitti"}
                      </>
                    }
                    sag={
                      <div className={s.satirEylem}>
                        <span className={`${s.tutar} ${k.tur === "gelir" ? s.gelir : s.gider}`}>
                          {paraMetni(k.kurus, simge)}
                        </span>
                        <Dugme
                          tur="sade"
                          ikon={k.durdu ? <Play size={15} /> : <Pause size={15} />}
                          aria-label={k.durdu ? "Sürdür" : "Durdur"}
                          onClick={() => durdur(k, !k.durdu)}
                        />
                        <Dugme tur="sade" ikon={<Pencil size={15} />} aria-label="Düzenle" onClick={() => setDuzenlenen(k)} />
                        <Dugme tur="sade" ikon={<Trash2 size={15} />} aria-label="Sil" onClick={() => sil(k)} />
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

function KuralFormu({
  baslangic,
  kategoriler,
  hesaplar,
  onKaydet,
  onIptal,
}: {
  baslangic: Kural;
  kategoriler: Kategori[];
  hesaplar: Hesap[];
  onKaydet: (kural: Kural) => void;
  onIptal: () => void;
}) {
  const [ad, setAd] = useState(baslangic.ad);
  const [kategoriId, setKategoriId] = useState(baslangic.kategoriId);
  const [tutar, setTutar] = useState(baslangic.kurus === 0 ? "" : paraGiris(baslangic.kurus));
  const [ayinGunu, setAyinGunu] = useState(String(baslangic.ayinGunu));
  const [karsiTaraf, setKarsiTaraf] = useState(baslangic.karsiTaraf);
  const [odeme, setOdeme] = useState<Odeme>(baslangic.odeme);
  const [hesapId, setHesapId] = useState(baslangic.hesapId ?? "");
  const [bas, setBas] = useState(baslangic.baslangic);
  const [bitis, setBitis] = useState(baslangic.bitis ?? "");
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = () => {
    const kurus = paraCoz(tutar);
    if (kurus === null || kurus <= 0) return setHata("Tutar okunamadı.");
    if (!ad.trim()) return setHata("Ad boş olamaz.");
    if (!kategoriId) return setHata("Kategori seçilmedi.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bas)) return setHata("Başlangıç tarihi geçersiz.");
    onKaydet({
      ...baslangic,
      ad,
      kategoriId,
      kurus: Math.abs(kurus),
      ayinGunu: Math.min(31, Math.max(1, Number(ayinGunu) || 1)),
      karsiTaraf: karsiTaraf.trim(),
      odeme,
      hesapId: hesapId || null,
      baslangic: bas,
      bitis: bitis || null,
    });
  };

  return (
    <div className={s.duzen}>
      <div className={s.form}>
        <label className={s.alan}>
          <span className={s.etiket}>Ad</span>
          <input className={s.metin} value={ad} autoFocus onChange={(e) => setAd(e.target.value)} />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Kategori</span>
          <select className={s.secim} value={kategoriId} onChange={(e) => setKategoriId(e.target.value)}>
            {kategoriler
              .filter((k) => !k.arsiv || k.id === kategoriId)
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {kategoriAdi(k)} · {TUR_ADLARI[k.tur].toLocaleLowerCase("tr")}
                </option>
              ))}
          </select>
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Tutar</span>
          <input
            className={`${s.metin} ${s.sayiAlani}`}
            value={tutar}
            inputMode="decimal"
            placeholder="0,00"
            onChange={(e) => setTutar(e.target.value)}
          />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Ayın günü</span>
          <input
            className={`${s.metin} ${s.sayiAlani}`}
            type="number"
            min={1}
            max={31}
            value={ayinGunu}
            onChange={(e) => setAyinGunu(e.target.value)}
          />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Hesap</span>
          <select className={s.secim} value={hesapId} onChange={(e) => setHesapId(e.target.value)}>
            <option value="">— hesapsız —</option>
            {hesaplar.map((h) => (
              <option key={h.id} value={h.id}>
                {h.simge ? `${h.simge} ${h.ad}` : h.ad}
              </option>
            ))}
          </select>
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Ödeme</span>
          <select className={s.secim} value={odeme} onChange={(e) => setOdeme(e.target.value as Odeme)}>
            {(Object.keys(ODEME_ADLARI) as Odeme[]).map((o) => (
              <option key={o} value={o}>
                {ODEME_ADLARI[o]}
              </option>
            ))}
          </select>
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Başlangıç</span>
          <input className={s.metin} type="date" value={bas} onChange={(e) => setBas(e.target.value)} />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Bitiş · boşsa açık uçlu</span>
          <input className={s.metin} type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
        </label>
        <div className={`${s.alan} ${s.genis}`}>
          <span className={s.etiket}>Karşı taraf</span>
          <Giris value={karsiTaraf} onChange={(e) => setKarsiTaraf(e.target.value)} />
        </div>
      </div>

      {hata && <p className={s.uyari}>{hata}</p>}
      <p className={s.soluk}>
        Ayın 31'i seçilirse kural her ayın son gününe düşer — Şubat'ta 28'ine, Nisan'da 30'una.
      </p>

      <div className={s.eylemler}>
        <Dugme tur="dolu" ikon={<Check size={15} />} onClick={kaydet}>
          Kaydet
        </Dugme>
        <Dugme tur="sade" ikon={<X size={15} />} onClick={onIptal}>
          Vazgeç
        </Dugme>
      </div>
    </div>
  );
}
