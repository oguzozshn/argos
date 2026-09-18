import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { donemIceren, donemIcerir, donemKaydir, donemEtiketi } from "@ortak/donem";
import { paraIsaretli, paraMetni } from "@ortak/para";
import { csvUret, donemIslemleri, ODEME_ADLARI, type Islem, type Tur } from "@ortak/harcama";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { useDonemKaydirmasi, useHarcama } from "./kanca";
import { bosIslem, hesapSirasi, karsiTaraflar, kategoriSirasi, kisaTarih } from "./tipler";
import { DonemGezinti } from "./parcalar/DonemGezinti";
import { IslemFormu } from "./parcalar/IslemFormu";
import s from "./harcama.module.css";

export function Islemler() {
  const defter = useHarcama(true);
  const [kaydirma, setKaydirma] = useDonemKaydirmasi();
  const [taslak, setTaslak] = useState<Islem | null>(null);
  const [tur, setTur] = useState<Tur | "">("");
  const [kategoriId, setKategoriId] = useState("");
  const [hesapId, setHesapId] = useState("");
  const [arama, setArama] = useState("");

  const { tanimlar, islemler, bugun } = defter;
  const simge = tanimlar.ayarlar.simge;

  const donem = useMemo(
    () => donemKaydir(donemIceren(bugun, tanimlar.ayarlar.donemBaslangicGunu), kaydirma),
    [bugun, tanimlar.ayarlar.donemBaslangicGunu, kaydirma],
  );

  const gorunen = useMemo(() => {
    const aranan = arama.trim().toLocaleLowerCase("tr");
    return donemIslemleri(islemler, donem)
      .filter((i) => (tur === "" || i.tur === tur) && (!kategoriId || i.kategoriId === kategoriId))
      .filter((i) => !hesapId || i.hesapId === hesapId)
      .filter(
        (i) =>
          !aranan ||
          i.karsiTaraf.toLocaleLowerCase("tr").includes(aranan) ||
          i.not.toLocaleLowerCase("tr").includes(aranan),
      )
      .sort((a, b) => (a.tarih === b.tarih ? (a.id < b.id ? 1 : -1) : a.tarih < b.tarih ? 1 : -1));
  }, [islemler, donem, tur, kategoriId, hesapId, arama]);

  const kategoriler = tanimlar.kategoriler.slice().sort(kategoriSirasi);
  const hesaplar = tanimlar.hesaplar.filter((h) => !h.arsiv).sort(hesapSirasi);
  const toplam = gorunen.filter((i) => !i.transfer);

  const yeniIslem = () =>
    setTaslak(
      bosIslem(
        donemIcerir(donem, bugun) ? bugun : donem.bas,
        hesaplar[0]?.id ?? null,
        kategoriler.find((k) => k.tur === "gider" && !k.arsiv)?.id ?? "",
      ),
    );

  /**
   * Blazor sürümünde bunun için ayrı bir uç nokta vardı; burada dosya doğrudan
   * tarayıcıda kuruluyor. BOM şart: Türkçe yerel ayarlı Excel dosyayı ancak
   * onunla sihirbazsız açıyor.
   */
  const disaAktar = () => {
    const icerik = "﻿" + csvUret(gorunen, tanimlar.kategoriler, tanimlar.hesaplar);
    const adres = URL.createObjectURL(new Blob([icerik], { type: "text/csv;charset=utf-8" }));
    const bag = document.createElement("a");
    bag.href = adres;
    bag.download = `harcama-${donem.bas}.csv`;
    bag.click();
    URL.revokeObjectURL(adres);
  };

  const sil = (islem: Islem) =>
    silVeBildir({
      metin: `${kisaTarih(islem.tarih)} · ${paraMetni(islem.kurus, simge)} kaydı silindi.`,
      sil: () => defter.islemSil(islem.id),
      geriKoy: () => defter.islemGeriYukle(islem),
    });

  if (defter.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="İşlemler" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  return (
    <>
      <EkranBasi
        baslik="İşlemler"
        altyazi={`${donemEtiketi(donem)} · ${gorunen.length} kayıt`}
        sag={
          <div className={s.eylemler}>
            <DonemGezinti donem={donem} kaydirma={kaydirma} onDegis={setKaydirma} />
            <Dugme ikon={<Download size={15} />} onClick={disaAktar} disabled={gorunen.length === 0}>
              CSV
            </Dugme>
            {!taslak && <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={yeniIslem}>İşlem ekle</Dugme>}
          </div>
        }
      />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}

      <div className={s.duzen}>
        {taslak && (
          <Kart>
            <IslemFormu
              key={taslak.id}
              baslangic={taslak}
              kategoriler={tanimlar.kategoriler}
              hesaplar={hesaplar}
              karsiTaraflar={karsiTaraflar(islemler)}
              onKaydet={(islem) => {
                void defter.islemKaydet(islem);
                setTaslak(null);
              }}
              onIptal={() => setTaslak(null)}
            />
          </Kart>
        )}

        <Kart
          dolgulu={false}
          bas={
            <div className={s.suzgec}>
              <select className={s.secim} value={tur} onChange={(e) => setTur(e.target.value as Tur | "")}>
                <option value="">Tümü</option>
                <option value="gider">Gider</option>
                <option value="gelir">Gelir</option>
              </select>
              <select className={s.secim} value={kategoriId} onChange={(e) => setKategoriId(e.target.value)}>
                <option value="">Bütün kategoriler</option>
                {kategoriler.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ad} · {k.tur === "gelir" ? "gelir" : "gider"}
                  </option>
                ))}
              </select>
              <select className={s.secim} value={hesapId} onChange={(e) => setHesapId(e.target.value)}>
                <option value="">Bütün hesaplar</option>
                {hesaplar.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.ad}
                  </option>
                ))}
              </select>
              <div className={s.suzgecArama}>
                <Giris
                  ikon={<Search size={15} />}
                  value={arama}
                  placeholder="Karşı taraf ya da not"
                  onChange={(e) => setArama(e.target.value)}
                />
              </div>
            </div>
          }
        >
          {gorunen.length === 0 ? (
            <BosDurum
              baslik="Kayıt yok"
              metin="Bu dönemde süzgeçlere uyan işlem bulunmuyor."
              eylem={<Dugme ikon={<Plus size={15} />} onClick={yeniIslem}>İşlem ekle</Dugme>}
            />
          ) : (
            <div className={s.kaydir}>
              <table className={s.tablo}>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Kategori</th>
                    <th className={s.buyu}>Karşı taraf · not</th>
                    <th>Hesap</th>
                    <th>Ödeme</th>
                    <th className={s.sag}>Tutar</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map((i) => {
                    const kategori = tanimlar.kategoriler.find((k) => k.id === i.kategoriId);
                    const hesap = tanimlar.hesaplar.find((h) => h.id === i.hesapId);
                    return (
                      <tr key={i.id}>
                        <td className={s.tarihSutun}>{kisaTarih(i.tarih)}</td>
                        <td>
                          <span className={s.rozet}>
                            <span className={s.nokta} style={{ background: kategori?.renk ?? "#8b93a3" }} />
                            {kategori?.ad ?? "Silinmiş kategori"}
                          </span>
                        </td>
                        <td className={s.buyu}>
                          {i.karsiTaraf || i.not || "—"}
                          {i.transfer && <span className={s.soluk}> · transfer</span>}
                          {i.duzenliId && <span className={s.soluk}> · düzenli</span>}
                        </td>
                        <td className={s.orta}>{hesap?.ad ?? "—"}</td>
                        <td className={s.orta}>{ODEME_ADLARI[i.odeme]}</td>
                        <td className={`${s.sag} ${s.tutar} ${i.tur === "gelir" ? s.gelir : s.gider}`}>
                          {i.transfer
                            ? paraMetni(i.kurus, simge)
                            : paraIsaretli(i.tur === "gelir" ? i.kurus : -i.kurus, simge)}
                        </td>
                        <td>
                          <div className={s.satirEylem}>
                            <Dugme tur="sade" ikon={<Pencil size={15} />} aria-label="Düzenle" onClick={() => setTaslak(i)} />
                            <Dugme tur="sade" ikon={<Trash2 size={15} />} aria-label="Sil" onClick={() => sil(i)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Kart>

        <div className={`${s.aralik} ${s.orta}`}>
          <span>
            Gider {paraMetni(toplam.filter((i) => i.tur === "gider").reduce((a, i) => a + i.kurus, 0), simge)}
          </span>
          <span>
            Gelir {paraMetni(toplam.filter((i) => i.tur === "gelir").reduce((a, i) => a + i.kurus, 0), simge)}
          </span>
        </div>
      </div>
    </>
  );
}
