import { useMemo, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Trash2, Upload, Wand2 } from "lucide-react";
import {
  BOS_ESLEM,
  BOS_TABLO,
  EN_FAZLA_BAYT,
  eslemTam,
  hucre,
  metinCoz,
  metinIcerir,
  sutunTahmini,
  tabloOku,
  type EkstreTablosu,
  type SutunEslemi,
} from "@ortak/ekstre";
import { xlsxTablosu } from "@ortak/ekstre-xlsx";
import {
  gecerli,
  hazir,
  islemeCevir,
  onizlemeKur,
  onizlemeOzeti,
  satirTuru,
  satirTutari,
  tersGorunuyor,
  yazilabilir,
  type Kural,
  type Parti,
  type Satir,
} from "@ortak/ekstre-aktar";
import { paraMetni } from "@ortak/para";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Satir as SatirBilesen, Yuklenirken } from "@/ui/bilesenler";
import { useHarcama } from "./kanca";
import { useEkstre } from "./ekstre-kanca";
import { hesapSirasi, kategoriAdi, kategoriSirasi, kisaTarih, yeniId } from "./tipler";
import s from "./harcama.module.css";

/** Tek seferde çizilen en fazla satır. Bin satırlık bir ekstre tarayıcıyı dizmemeli. */
const EN_FAZLA_SATIR = 300;

const XLSX_DESENI = /\.(xlsx|xlsm)$/i;

export function Ekstre() {
  const defter = useHarcama(true);
  const ekstre = useEkstre(defter.tanimlar.kategoriler, defter.yuklendi);

  const [hesapSecimi, setHesapSecimi] = useState("");
  const [dosyaAdi, setDosyaAdi] = useState<string | null>(null);
  const [tablo, setTablo] = useState<EkstreTablosu>(BOS_TABLO);
  const [eslem, setEslem] = useState<SutunEslemi>(BOS_ESLEM);
  const [satirlar, setSatirlar] = useState<Satir[] | null>(null);
  const [sadeceSorunlu, setSadeceSorunlu] = useState(false);
  const [kurallarAcik, setKurallarAcik] = useState(false);
  const [onayBekleyen, setOnayBekleyen] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const { tanimlar, islemler } = defter;
  const simge = tanimlar.ayarlar.simge;
  const hesaplar = useMemo(
    () => tanimlar.hesaplar.filter((h) => !h.arsiv).sort(hesapSirasi),
    [tanimlar.hesaplar],
  );
  const kategoriler = useMemo(() => tanimlar.kategoriler.slice().sort(kategoriSirasi), [tanimlar.kategoriler]);

  const hesap = hesaplar.find((h) => h.id === hesapSecimi) ?? hesaplar[0];
  const ozet = satirlar ? onizlemeOzeti(satirlar) : null;

  /** Mükerrer yakalama hesap bazında: aynı satır başka bir hesaba meşru biçimde girebilir. */
  const izlerSec = (hesapId: string | undefined) =>
    new Set(islemler.filter((i) => i.hesapId === hesapId && i.ekstreIzi).map((i) => i.ekstreIzi as string));

  /**
   * Hesap parametre olarak geliyor: hesap değiştirildiği anda state henüz
   * eskisini gösteriyor, önizleme eski hesabın izleriyle kurulurdu.
   */
  const onizlemeKur_ = async (
    kaynak: EkstreTablosu,
    kullanilan: SutunEslemi,
    isaretiTahminEt = false,
    hedef = hesap,
  ): Promise<void> => {
    const mevcutIzler = izlerSec(hedef?.id);
    if (!eslemTam(kullanilan)) {
      setSatirlar(null);
      return;
    }

    let etkin = kullanilan;
    let yeni = await onizlemeKur(kaynak, etkin, mevcutIzler, ekstre.kurallar, tanimlar.kategoriler);

    // Kart ekstresi harcamaları artı yazar; sezilen işaret öneriliyor, zorlanmıyor.
    if (isaretiTahminEt && hedef && tersGorunuyor(yeni, hedef.tur)) {
      etkin = { ...etkin, tersCevir: true };
      setEslem(etkin);
      yeni = await onizlemeKur(kaynak, etkin, mevcutIzler, ekstre.kurallar, tanimlar.kategoriler);
    }

    setSatirlar(yeni);
  };

  const dosyaSecildi = async (olay: ChangeEvent<HTMLInputElement>) => {
    const dosya = olay.target.files?.[0];
    olay.target.value = "";
    if (!dosya) return;

    setHata(null);
    setMesaj(null);
    setSatirlar(null);

    if (dosya.size > EN_FAZLA_BAYT) {
      setHata(
        `Dosya çok büyük (${Math.round(dosya.size / 1024 / 1024)} MB). En fazla ${EN_FAZLA_BAYT / 1024 / 1024} MB.`,
      );
      return;
    }

    let okunan: EkstreTablosu;
    try {
      const bayt = new Uint8Array(await dosya.arrayBuffer());
      okunan = XLSX_DESENI.test(dosya.name) ? await xlsxTablosu(bayt) : tabloOku(metinCoz(bayt));
    } catch (e) {
      // Yanlış dosya türü ya da bozuk bir çalışma kitabı ekranı götürmemeli.
      setHata(`Dosya okunamadı: ${e instanceof Error ? e.message : String(e)}`);
      setTablo(BOS_TABLO);
      setDosyaAdi(null);
      return;
    }

    setDosyaAdi(dosya.name);
    setTablo(okunan);

    if (okunan.satirlar.length === 0) {
      setEslem(BOS_ESLEM);
      setHata("Dosyada tablo bulunamadı. Bankadan CSV ya da Excel biçiminde indirmeyi deneyin.");
      return;
    }

    const tahmin = sutunTahmini(okunan.sutunlar);
    setEslem(tahmin);
    await onizlemeKur_(okunan, tahmin, true);
  };

  const sutunSec = async (degisiklik: Partial<SutunEslemi>) => {
    let yeni = { ...eslem, ...degisiklik };
    // İki tutar biçimi birbirini dışlar; biri seçilince diğeri temizleniyor ki
    // yarım kalmış bir eşleme sessizce yanlış sütunu okumasın.
    if (degisiklik.tutar !== undefined && degisiklik.tutar >= 0) yeni = { ...yeni, borc: -1, alacak: -1 };
    if ((degisiklik.borc !== undefined && degisiklik.borc >= 0) || (degisiklik.alacak !== undefined && degisiklik.alacak >= 0)) {
      yeni = { ...yeni, tutar: -1 };
    }
    setEslem(yeni);
    await onizlemeKur_(tablo, yeni);
  };

  const hesapDegisti = async (id: string) => {
    setHesapSecimi(id);
    const yeniHesap = hesaplar.find((h) => h.id === id) ?? hesaplar[0];
    if (tablo.satirlar.length > 0) await onizlemeKur_(tablo, eslem, false, yeniHesap);
  };

  const satirGuncelle = (sira: number, degisiklik: Partial<Satir>) =>
    setSatirlar((mevcut) => mevcut?.map((x) => (x.sira === sira ? { ...x, ...degisiklik } : x)) ?? null);

  const kuralYap = async (satir: Satir) => {
    let kural: Kural | null;
    try {
      kural = await ekstre.kuralKaydet(satir.aciklama, satir.kategoriId, satir.transfer);
    } catch (e) {
      setHata(`Kural kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!kural) {
      setHata("Kural oluşturulamadı: açıklama çok kısa.");
      return;
    }

    // Kategorisi hâlâ boş olan benzer satırlara da uygulanıyor. Sayaç
    // güncelleyicinin dışında: React onu geç ya da iki kez çalıştırabilir.
    const k = kural;
    const eslesir = (x: Satir) => yazilabilir(x) && x.kategoriId === "" && metinIcerir(x.aciklama, k.icerir);
    const uygulanan = satirlar?.filter(eslesir).length ?? 0;
    setSatirlar(
      (mevcut) =>
        mevcut?.map((x) => (eslesir(x) ? { ...x, kategoriId: k.kategoriId, transfer: k.transfer, kuralId: k.id } : x)) ??
        null,
    );

    setHata(null);
    setMesaj(uygulanan > 0 ? `Kural kaydedildi ve ${uygulanan} satıra daha uygulandı.` : "Kural kaydedildi.");
  };

  const aktar = async () => {
    if (!satirlar || !hesap || mesgul) return;
    setMesgul(true);
    try {
      const zaman = new Date().toISOString();
      const partiId = yeniId();
      const o = onizlemeOzeti(satirlar);

      const parti: Parti = {
        id: partiId,
        hesapId: hesap.id,
        dosya: dosyaAdi ?? "ekstre",
        zaman,
        aktarilan: o.hazir,
        atlanan: satirlar.length - o.hazir,
        ilk: satirlar.filter(hazir).map((x) => x.tarih).sort()[0] ?? null,
        son: satirlar.filter(hazir).map((x) => x.tarih).sort().pop() ?? null,
      };

      // Parti önce yazılıyor: işlemler yazılırken bir şey ters giderse geri
      // alınacak kayıt zaten duruyor olsun.
      // Parti yazılamadıysa işlemler de yazılmaz: geri alma kaydı olmayan bir
      // aktarma tek tıkla geri alınamaz.
      const partiYazildi = await ekstre.aktarmayiKaydet(
        parti,
        satirlar.filter((x) => yazilabilir(x) && x.kuralId).map((x) => x.kuralId as string),
      );
      if (!partiYazildi) {
        setHata("İçe aktarma başlamadı: aktarma kaydı yazılamadı. Hiçbir işlem eklenmedi.");
        return;
      }
      const eklendi = await defter.islemlerEkle(islemeCevir(satirlar, hesap.id, partiId, zaman));
      if (!eklendi) {
        // Önizleme silinmiyor: kullanıcı ne olduğunu görebilsin. Yazılan kısım
        // partiye bağlı, aktarma listesinden geri alınabilir.
        setHata("İşlemlerin bir kısmı yazılamadı. Yazılanlar aktarma listesinden geri alınabilir.");
        return;
      }

      setMesaj(`${o.hazir} işlem içe aktarıldı, ${satirlar.length - o.hazir} satır atlandı.`);
      sifirla();
    } catch (e) {
      setHata(`İçe aktarma başarısız: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMesgul(false);
    }
  };

  const geriAl = async (parti: Parti) => {
    setOnayBekleyen(null);
    setMesaj(null);
    const silinen = await defter.partiGeriAl(parti.id);
    if (silinen === null) {
      // Parti kaydı duruyor: kalan işlemler yeniden denenerek geri alınabilir.
      setHata("Geri alma tamamlanamadı. Tekrar deneyin.");
      return;
    }
    if (!(await ekstre.partiSil(parti.id))) {
      setHata(`${silinen} işlem silindi ama aktarma kaydı listeden kaldırılamadı.`);
      return;
    }
    setHata(null);
    setMesaj(`${silinen} işlem silindi.`);
  };

  const sifirla = () => {
    setSatirlar(null);
    setTablo(BOS_TABLO);
    setEslem(BOS_ESLEM);
    setDosyaAdi(null);
    setSadeceSorunlu(false);
  };

  if (defter.yukleniyor || ekstre.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="İçe aktar" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const gorunen = !satirlar
    ? []
    : sadeceSorunlu
      ? satirlar.filter((x) => !gecerli(x) || (x.kategoriId === "" && !x.zatenVar))
      : satirlar.slice(0, EN_FAZLA_SATIR);

  return (
    <>
      <EkranBasi
        baslik="İçe aktar"
        altyazi="Bankanın verdiği CSV ya da Excel dosyasını yükle. Sen onaylamadan hiçbir şey kaydedilmez, her içe aktarma tek tıkla geri alınır."
      />

      {hata && <p className={s.uyari}>{hata}</p>}
      {/* Dosya düzeyindeki hatalar (çakışma, kilit) da görünsün. */}
      {(defter.hata || ekstre.hata) && <p className={s.uyari}>{defter.hata ?? ekstre.hata}</p>}
      {mesaj && <p className={s.bilgi}>{mesaj}</p>}

      <div className={s.duzen}>
        {hesaplar.length === 0 ? (
          <Kart>
            <BosDurum
              baslik="Önce bir hesap gerekli"
              metin="Ekstre bir hesaba aktarılır; bakiyesi ve mükerrer kaydı o hesap üzerinden izleniyor."
              eylem={<Link to="/harcama/hesaplar">Hesaplar →</Link>}
            />
          </Kart>
        ) : (
          <Kart baslik="1 · Dosya">
            <div className={s.form}>
              <label className={s.alan}>
                <span className={s.etiket}>Hesap</span>
                <select className={s.secim} value={hesap?.id ?? ""} onChange={(e) => void hesapDegisti(e.target.value)}>
                  {hesaplar.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.simge ? `${h.simge} ${h.ad}` : h.ad}
                    </option>
                  ))}
                </select>
              </label>

              <div className={s.alan}>
                <span className={s.etiket}>Ekstre dosyası (.csv, .txt, .xlsx)</span>
                {/* Yerel düğme metni işletim sisteminin dilinden gelirdi; kendi
                    etiketimizi koyup girişi gizliyoruz. */}
                <label className={s.dosyaSec}>
                  <input
                    className={s.gizliGiris}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xlsm"
                    onChange={(e) => void dosyaSecildi(e)}
                  />
                  <span className={s.dosyaDugme}>Dosya seç</span>
                  <span className={s.soluk}>{dosyaAdi ?? "dosya seçilmedi"}</span>
                </label>
              </div>
            </div>

            {dosyaAdi && tablo.satirlar.length > 0 && (
              <p className={s.soluk}>
                {tablo.sutunlar.length} sütun, {tablo.satirlar.length} satır okundu.
              </p>
            )}
          </Kart>
        )}

        {tablo.satirlar.length > 0 && (
          <Kart baslik="2 · Sütun eşlemesi">
            <div className={s.form}>
              <SutunSecici ad="Tarih" deger={eslem.tarih} sutunlar={tablo.sutunlar} zorunlu onSec={(v) => void sutunSec({ tarih: v })} />
              <SutunSecici ad="Açıklama" deger={eslem.aciklama} sutunlar={tablo.sutunlar} onSec={(v) => void sutunSec({ aciklama: v })} />
              <SutunSecici ad="Tutar (tek sütun)" deger={eslem.tutar} sutunlar={tablo.sutunlar} onSec={(v) => void sutunSec({ tutar: v })} />
              <SutunSecici ad="Borç (çıkan)" deger={eslem.borc} sutunlar={tablo.sutunlar} onSec={(v) => void sutunSec({ borc: v })} />
              <SutunSecici ad="Alacak (giren)" deger={eslem.alacak} sutunlar={tablo.sutunlar} onSec={(v) => void sutunSec({ alacak: v })} />
            </div>

            <label className={s.kutu}>
              <input
                type="checkbox"
                checked={eslem.tersCevir}
                onChange={(e) => void sutunSec({ tersCevir: e.target.checked })}
              />
              Tutarın işaretini ters çevir
              <span className={s.soluk}> — kredi kartı ekstrelerinde harcamalar çoğunlukla artı yazılır.</span>
            </label>

            {!eslemTam(eslem) && (
              <p className={s.uyari}>
                En az tarih ve bir tutar sütunu seçilmeli — ya tek “Tutar” ya da Borç/Alacak.
              </p>
            )}

            <details>
              <summary className={s.ozet}>Dosyanın ilk satırlarını göster</summary>
              <div className={s.kaydir}>
                <table className={s.tablo}>
                  <thead>
                    <tr>
                      {tablo.sutunlar.map((c, i) => (
                        <th key={i}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tablo.satirlar.slice(0, 5).map((satir, i) => (
                      <tr key={i}>
                        {tablo.sutunlar.map((_, j) => (
                          <td key={j} className={s.orta}>
                            {hucre(satir, j)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Kart>
        )}

        {satirlar && ozet && (
          <Kart
            baslik="3 · Önizleme"
            not={
              <label className={s.kutu}>
                <input type="checkbox" checked={sadeceSorunlu} onChange={(e) => setSadeceSorunlu(e.target.checked)} />
                Sadece kategorisiz ve hatalı satırlar
              </label>
            }
          >
            <div className={s.dosemeler}>
              <Doseme baslik="Aktarılacak" deger={String(ozet.hazir)} alt={`${ozet.gecerli} geçerli satırdan`} />
              <Doseme baslik="Gider" deger={paraMetni(ozet.giderToplam, simge)} alt="transferler hariç" renk={s.gider} />
              <Doseme
                baslik="Gelir"
                deger={paraMetni(ozet.gelirToplam, simge)}
                alt={ozet.ilk && ozet.son ? `${kisaTarih(ozet.ilk)} – ${kisaTarih(ozet.son)}` : "—"}
                renk={s.gelir}
              />
              <Doseme
                baslik="Atlanacak"
                deger={String(satirlar.length - ozet.hazir)}
                alt={`${ozet.mukerrer} mükerrer · ${ozet.hatali} hatalı · ${ozet.kategorisiz} kategorisiz · ${ozet.disarida} elle çıkarıldı`}
              />
            </div>

            {ozet.kategorisiz > 0 && (
              <p className={s.bilgi}>
                Kategorisi seçilmemiş satırlar aktarılmaz. Bir satıra kategori verip <strong>Kural yap</strong> dersen,
                aynı açıklamayı taşıyan gelecek ekstreler otomatik eşleşir.
              </p>
            )}

            <div className={s.kaydir}>
              <table className={s.tablo}>
                <thead>
                  <tr>
                    <th />
                    <th>Tarih</th>
                    <th className={s.buyu}>Açıklama</th>
                    <th className={s.sag}>Tutar</th>
                    <th>Kategori</th>
                    <th>Transfer</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map((satir) => {
                    const duzenlenebilir = gecerli(satir) && !satir.zatenVar;
                    const tur = satirTuru(satir);
                    return (
                      <tr key={satir.sira} className={duzenlenebilir && satir.dahil ? undefined : s.sonuk}>
                        <td>
                          {duzenlenebilir && (
                            <input
                              type="checkbox"
                              checked={satir.dahil}
                              aria-label="Bu satırı aktar"
                              onChange={(e) => satirGuncelle(satir.sira, { dahil: e.target.checked })}
                            />
                          )}
                        </td>
                        <td className={s.tarihSutun}>{gecerli(satir) ? kisaTarih(satir.tarih) : satir.hamTarih}</td>
                        <td className={s.buyu}>
                          {gecerli(satir) ? satir.aciklama : satir.hamAciklama || "—"}
                          {satir.hata && <div className={`${s.soluk} ${s.gider}`}>{satir.hata}</div>}
                          {satir.zatenVar && <div className={s.soluk}>daha önce aktarılmış</div>}
                        </td>
                        <td className={`${s.sag} ${s.tutar} ${tur === "gelir" ? s.gelir : s.gider}`}>
                          {gecerli(satir) ? (
                            `${tur === "gelir" ? "+" : "−"}${paraMetni(satirTutari(satir), simge)}`
                          ) : (
                            <span className={s.soluk}>{satir.hamTutar}</span>
                          )}
                        </td>
                        <td>
                          {duzenlenebilir && (
                            <select
                              className={s.secim}
                              value={satir.kategoriId}
                              onChange={(e) =>
                                // Öneri artık kuraldan gelmiyor, kurala yazılmamalı.
                                satirGuncelle(satir.sira, { kategoriId: e.target.value, kuralId: null })
                              }
                            >
                              <option value="">— seçin —</option>
                              {kategoriler
                                .filter((k) => k.tur === tur && !k.arsiv)
                                .map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {kategoriAdi(k)}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                        <td>
                          {duzenlenebilir && (
                            <input
                              type="checkbox"
                              checked={satir.transfer}
                              aria-label="Transfer"
                              onChange={(e) => satirGuncelle(satir.sira, { transfer: e.target.checked })}
                            />
                          )}
                        </td>
                        <td className={s.sag}>
                          {duzenlenebilir && satir.kategoriId !== "" && (
                            <Dugme tur="sade" ikon={<Wand2 size={15} />} onClick={() => void kuralYap(satir)}>
                              Kural yap
                            </Dugme>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {gorunen.length < satirlar.length && (
              <p className={s.soluk}>
                {satirlar.length} satırın {gorunen.length} tanesi gösteriliyor.
              </p>
            )}

            <div className={s.eylemler}>
              <Dugme tur="dolu" ikon={<Upload size={15} />} disabled={ozet.hazir === 0 || mesgul} onClick={() => void aktar()}>
                {ozet.hazir} satırı içe aktar
              </Dugme>
              <Dugme tur="sade" onClick={sifirla}>
                Vazgeç
              </Dugme>
            </div>
          </Kart>
        )}

        {ekstre.partiler.length > 0 && (
          <Kart dolgulu={false} baslik="Geçmiş içe aktarmalar">
            <div className={s.satirlar}>
              {ekstre.partiler.map((parti) => {
                const h = tanimlar.hesaplar.find((x) => x.id === parti.hesapId);
                return (
                  <SatirBilesen
                    key={parti.id}
                    baslik={parti.dosya}
                    alt={
                      <>
                        {parti.zaman.slice(0, 10)} · {h?.ad ?? "—"} · {parti.aktarilan} işlem
                        {parti.ilk && parti.son ? ` · ${kisaTarih(parti.ilk)} – ${kisaTarih(parti.son)}` : ""}
                      </>
                    }
                    sag={
                      onayBekleyen === parti.id ? (
                        <div className={s.satirEylem}>
                          <Dugme tur="tehlike" onClick={() => void geriAl(parti)}>
                            Evet, sil
                          </Dugme>
                          <Dugme tur="sade" onClick={() => setOnayBekleyen(null)}>
                            Vazgeç
                          </Dugme>
                        </div>
                      ) : (
                        <Dugme tur="sade" onClick={() => setOnayBekleyen(parti.id)}>
                          Geri al
                        </Dugme>
                      )
                    }
                  />
                );
              })}
            </div>
          </Kart>
        )}

        <Kart
          dolgulu={false}
          bas={
            <button className={s.ozetDugme} onClick={() => setKurallarAcik(!kurallarAcik)}>
              {kurallarAcik ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              Kurallar
              <span className={s.soluk}>{ekstre.kurallar.length} desen</span>
            </button>
          }
        >
          {kurallarAcik && (
            <div className={s.satirlar}>
              {[...ekstre.kurallar]
                .sort((a, b) => (b.kullanim - a.kullanim) || a.icerir.localeCompare(b.icerir, "tr"))
                .map((kural) => {
                  const kategori = tanimlar.kategoriler.find((k) => k.id === kural.kategoriId);
                  return (
                    <SatirBilesen
                      key={kural.id}
                      sol={<span className={s.nokta} style={{ background: kategori?.renk ?? "#8b93a3" }} />}
                      baslik={kural.icerir}
                      alt={
                        <>
                          {kategori?.ad ?? "silinmiş kategori"} · {kural.kullanim} kez uygulandı
                        </>
                      }
                      sag={
                        <div className={s.satirEylem}>
                          {kural.transfer && <Etiket>transfer</Etiket>}
                          <Dugme
                            tur="sade"
                            ikon={<Trash2 size={15} />}
                            aria-label="Kuralı sil"
                            onClick={() => void ekstre.kuralSil(kural.id)}
                          />
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

function SutunSecici({
  ad,
  deger,
  sutunlar,
  zorunlu = false,
  onSec,
}: {
  ad: string;
  deger: number;
  sutunlar: string[];
  zorunlu?: boolean;
  onSec: (deger: number) => void;
}) {
  return (
    <label className={s.alan}>
      <span className={s.etiket}>{ad}</span>
      <select className={s.secim} value={deger} onChange={(e) => onSec(Number(e.target.value))}>
        {!zorunlu && <option value={-1}>— yok —</option>}
        {sutunlar.map((c, i) => (
          <option key={i} value={i}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}

function Doseme({ baslik, deger, alt, renk }: { baslik: string; deger: string; alt: string; renk?: string }) {
  return (
    <div className={s.doseme}>
      <span className={s.dosemeBaslik}>{baslik}</span>
      <span className={`${s.dosemeDeger} ${renk ?? ""}`}>{deger}</span>
      <span className={s.soluk}>{alt}</span>
    </div>
  );
}
