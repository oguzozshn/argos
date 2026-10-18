import { useState } from "react";
import { Check, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { abonelikToplami, duzenlemeyeUyarla, sonrakiTekrar } from "@ortak/duzenli";
import { type Duzenli as Kural, type Hesap, type Kategori } from "@ortak/harcama";
import { ayAl, gunAl, gunEkle } from "@ortak/gun";
import { paraCoz, paraGiris, paraMetni } from "@ortak/para";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { useHarcama } from "./kanca";
import { hesapSirasi, kategoriAdi, kategoriSirasi, kisaTarih, yeniId } from "./tipler";
import s from "./harcama.module.css";

/**
 * Subscriptions (issue #43): streaming, software, anything paid every month
 * or year, apart from Düzenli's rent and instalments. Each is a recurring
 * rule marked `abonelik`, so the same engine writes the payment into the
 * ledger on its day; this screen adds the next payment date and the totals.
 */

/** A category whose name says subscription, else the first expense category. */
const varsayilanKategori = (kategoriler: Kategori[]): string =>
  (
    kategoriler.find((k) => !k.arsiv && k.tur === "gider" && /abonel/i.test(k.ad.toLocaleLowerCase("tr"))) ??
    kategoriler.find((k) => !k.arsiv && k.tur === "gider")
  )?.id ?? "";

const yeni = (kategoriId: string, hesapId: string | null, bugun: string): Kural => ({
  id: yeniId(),
  ad: "",
  kategoriId,
  tur: "gider",
  kurus: 0,
  ayinGunu: gunAl(bugun),
  karsiTaraf: "",
  odeme: "kart",
  hesapId,
  baslangic: bugun,
  bitis: null,
  durdu: false,
  abonelik: true,
  periyot: "aylik",
});

export function Abonelikler() {
  const defter = useHarcama(true);
  const [duzenlenen, setDuzenlenen] = useState<Kural | null>(null);

  const { tanimlar, islemler, bugun } = defter;
  const simge = tanimlar.ayarlar.simge;
  const kategoriler = tanimlar.kategoriler.slice().sort(kategoriSirasi);
  const hesaplar = tanimlar.hesaplar.filter((h) => !h.arsiv).sort(hesapSirasi);

  const yaz = (duzenliler: Kural[]) => void defter.tanimlariYaz({ ...tanimlar, duzenliler });

  const kaydet = (kural: Kural) => {
    const kategori = tanimlar.kategoriler.find((k) => k.id === kural.kategoriId);
    if (!kural.ad.trim() || !kategori || kural.kurus <= 0) return;
    const tam: Kural = { ...kural, ad: kural.ad.trim(), tur: kategori.tur, abonelik: true };
    const varOlan = tanimlar.duzenliler.find((d) => d.id === kural.id);
    // A changed payment day must not write the past again (see duzenlemeyeUyarla).
    yaz(
      varOlan
        ? tanimlar.duzenliler.map((d) => (d.id === kural.id ? duzenlemeyeUyarla(varOlan, tam, islemler, bugun) : d))
        : [...tanimlar.duzenliler, tam],
    );
    setDuzenlenen(null);
  };

  const durdur = (kural: Kural, durdu: boolean) =>
    yaz(tanimlar.duzenliler.map((d) => (d.id === kural.id ? duzenlemeyeUyarla(d, { ...d, durdu }, islemler, bugun) : d)));

  const sil = (kural: Kural) => {
    const uretilen = islemler.filter((i) => i.duzenliId === kural.id).length;
    let baglilar: string[] = [];
    silVeBildir({
      metin:
        uretilen > 0
          ? `"${kural.ad}" aboneliği silindi. Defterdeki ${uretilen} ödemesi kaldı.`
          : `"${kural.ad}" aboneliği silindi.`,
      // Same order as Düzenli: the rule goes first, then its ledger links; undo reverses it.
      sil: async () => {
        const ok = await defter.tanimlariDegistir((t) => ({ ...t, duzenliler: t.duzenliler.filter((d) => d.id !== kural.id) }));
        if (!ok) return false;
        baglilar = (await defter.duzenliBaginiKaldir(kural.id)) ?? [];
        return true;
      },
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
        <EkranBasi baslik="Abonelikler" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const abonelikler = tanimlar.duzenliler.filter((d) => d.abonelik);
  const toplam = abonelikToplami(abonelikler, bugun);
  // Next payment first; paused and ended ones at the end.
  // Today's payment already in the ledger: the next one is the one ahead.
  const odenmis = new Set(islemler.filter((i) => i.duzenliId).map((i) => `${i.duzenliId}|${i.tarih}`));
  const sonrakiOdeme = (k: Kural): string | null => {
    const ilk = sonrakiTekrar(k, bugun);
    return ilk === bugun && odenmis.has(`${k.id}|${bugun}`) ? sonrakiTekrar(k, gunEkle(bugun, 1)) : ilk;
  };
  const sirali = abonelikler
    .map((k) => ({ k, sonraki: sonrakiOdeme(k) }))
    .sort((a, b) => (a.sonraki ?? "9").localeCompare(b.sonraki ?? "9") || a.k.ad.localeCompare(b.k.ad, "tr"));

  return (
    <>
      <EkranBasi
        baslik="Abonelikler"
        altyazi="Her ay ya da her yıl ödenenler. Ödeme günü gelince Harcama'ya kendiliğinden yazılır."
        sag={
          !duzenlenen && (
            <Dugme
              tur="dolu"
              ikon={<Plus size={15} />}
              onClick={() => setDuzenlenen(yeni(varsayilanKategori(kategoriler), hesaplar[0]?.id ?? null, bugun))}
            >
              Abonelik ekle
            </Dugme>
          )
        }
      />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}

      <div className={s.duzen}>
        {toplam.adet > 0 && (
          <Kart>
            <div className={s.abonelikToplam}>
              <div>
                <span className={s.etiket}>Aylık toplam</span>
                <strong className={s.abonelikTutar}>{paraMetni(toplam.aylik, simge)}</strong>
              </div>
              <div>
                <span className={s.etiket}>Yıllık toplam</span>
                <strong className={s.abonelikTutar}>{paraMetni(toplam.yillik, simge)}</strong>
              </div>
              <div>
                <span className={s.etiket}>Süren abonelik</span>
                <strong className={s.abonelikTutar}>{toplam.adet}</strong>
              </div>
            </div>
          </Kart>
        )}

        {duzenlenen && (
          <Kart>
            <AbonelikFormu
              key={duzenlenen.id}
              baslangic={duzenlenen}
              bugun={bugun}
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
              baslik="Abonelik yok"
              metin="Netflix, Spotify, Claude Code gibi her ay ya da her yıl ödediklerini ekle; ödeme günü Harcama'ya kendiliğinden yazılır."
            />
          ) : (
            <div className={s.satirlar}>
              {sirali.map(({ k, sonraki }) => {
                const kategori = tanimlar.kategoriler.find((c) => c.id === k.kategoriId);
                const hesap = tanimlar.hesaplar.find((h) => h.id === k.hesapId);
                const yillik = k.periyot === "yillik";
                return (
                  <Satir
                    key={k.id}
                    sol={<span className={s.nokta} style={{ background: kategori?.renk ?? "#8b93a3" }} />}
                    baslik={
                      <>
                        {k.ad} {k.durdu && <Etiket tur="uyari">durduruldu</Etiket>}
                        {!k.durdu && !sonraki && <Etiket>bitti</Etiket>}
                      </>
                    }
                    alt={
                      <>
                        {sonraki ? `sonraki ödeme ${kisaTarih(sonraki)}` : "ödeme yok"} · {kategori?.ad ?? "kategorisiz"}
                        {hesap ? ` · ${hesap.ad}` : ""}
                        {yillik ? ` · ayda ${paraMetni(Math.round(k.kurus / 12), simge)}` : ""}
                      </>
                    }
                    sag={
                      <div className={s.satirEylem}>
                        <span className={`${s.tutar} ${s.gider}`}>
                          {paraMetni(k.kurus, simge)}
                          <span className={s.soluk}> / {yillik ? "yıl" : "ay"}</span>
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

function AbonelikFormu({
  baslangic,
  bugun,
  kategoriler,
  hesaplar,
  onKaydet,
  onIptal,
}: {
  baslangic: Kural;
  bugun: string;
  kategoriler: Kategori[];
  hesaplar: Hesap[];
  onKaydet: (kural: Kural) => void;
  onIptal: () => void;
}) {
  const [ad, setAd] = useState(baslangic.ad);
  const [tutar, setTutar] = useState(baslangic.kurus === 0 ? "" : paraGiris(baslangic.kurus));
  const [periyot, setPeriyot] = useState<"aylik" | "yillik">(baslangic.periyot ?? "aylik");
  // The next payment is what people know; the rule's day (and month) come from it.
  const [sonraki, setSonraki] = useState(sonrakiTekrar({ ...baslangic, durdu: false }, bugun) ?? baslangic.baslangic);
  const [kategoriId, setKategoriId] = useState(baslangic.kategoriId);
  const [hesapId, setHesapId] = useState(baslangic.hesapId ?? "");
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = () => {
    const kurus = paraCoz(tutar);
    if (!ad.trim()) return setHata("Ad boş olamaz.");
    if (kurus === null || kurus <= 0) return setHata("Ücret okunamadı.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sonraki)) return setHata("Sonraki ödeme tarihi geçersiz.");
    if (!kategoriId) return setHata("Kategori seçilmedi.");
    const yeniMi = baslangic.kurus === 0 && !baslangic.ad;
    onKaydet({
      ...baslangic,
      ad,
      kurus: Math.abs(kurus),
      periyot,
      ayinGunu: gunAl(sonraki),
      ...(periyot === "yillik" ? { ay: ayAl(sonraki) } : { ay: undefined }),
      kategoriId,
      hesapId: hesapId || null,
      odeme: hesapId ? baslangic.odeme : "kart",
      // A new subscription starts on its first payment: nothing is written for the months before.
      baslangic: yeniMi || sonraki < baslangic.baslangic ? sonraki : baslangic.baslangic,
    });
  };

  return (
    <div className={s.duzen}>
      <div className={s.form}>
        <label className={s.alan}>
          <span className={s.etiket}>Ad</span>
          <input className={s.metin} value={ad} autoFocus placeholder="Netflix" onChange={(e) => setAd(e.target.value)} />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Ücret</span>
          <input
            className={`${s.metin} ${s.sayiAlani}`}
            value={tutar}
            inputMode="decimal"
            placeholder="0,00"
            onChange={(e) => setTutar(e.target.value)}
          />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Dönem</span>
          <select className={s.secim} value={periyot} onChange={(e) => setPeriyot(e.target.value as "aylik" | "yillik")}>
            <option value="aylik">Aylık</option>
            <option value="yillik">Yıllık</option>
          </select>
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Sonraki ödeme</span>
          <input className={s.metin} type="date" value={sonraki} onChange={(e) => setSonraki(e.target.value)} />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Kategori</span>
          <select className={s.secim} value={kategoriId} onChange={(e) => setKategoriId(e.target.value)}>
            {kategoriler
              .filter((k) => (!k.arsiv && k.tur === "gider") || k.id === kategoriId)
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {kategoriAdi(k)}
                </option>
              ))}
          </select>
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
      </div>

      {hata && <p className={s.uyari}>{hata}</p>}
      <p className={s.soluk}>
        {periyot === "yillik" ? "Her yıl" : "Her ay"} bu günde Harcama'ya {tutar || "…"} yazılır; ilki{" "}
        {/^\d{4}-\d{2}-\d{2}$/.test(sonraki) ? kisaTarih(sonraki) : "seçilen gün"}.
        {periyot === "aylik" && gunAl(sonraki) > 28 ? " Kısa aylarda ayın son gününe düşer." : ""}
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
