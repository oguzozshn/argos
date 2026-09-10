import { useState } from "react";
import { Check, X } from "lucide-react";
import { paraCoz, paraGiris } from "@ortak/para";
import type { Hesap, Islem, Kategori, Odeme, Tur } from "@ortak/harcama";
import { ODEME_ADLARI } from "@ortak/harcama";
import { Dugme, Giris } from "@/ui/bilesenler";
import { kategoriAdi, kategoriSirasi } from "../tipler";
import s from "../harcama.module.css";

/**
 * İşlem ekleme ve düzenleme formu. Veriye dokunmaz; kaydetmeyi çağıran ekran
 * yapar.
 *
 * Tutar metin olarak tutuluyor, kaydederken çözülüyor: yazarken her tuşta
 * sayıya çevirmek "1.5" gibi yarım kalmış girdileri kullanıcının elinden alır.
 *
 * Düzenlenen kayıt değişince form sıfırlansın diye çağıran taraf `key` veriyor.
 */
export function IslemFormu({
  baslangic,
  kategoriler,
  hesaplar,
  karsiTaraflar,
  onKaydet,
  onIptal,
}: {
  baslangic: Islem;
  kategoriler: Kategori[];
  hesaplar: Hesap[];
  karsiTaraflar: string[];
  onKaydet: (islem: Islem) => void;
  onIptal: () => void;
}) {
  const [tur, setTur] = useState<Tur>(baslangic.tur);
  const [kategoriId, setKategoriId] = useState(baslangic.kategoriId);
  const [tutar, setTutar] = useState(baslangic.kurus === 0 ? "" : paraGiris(baslangic.kurus));
  const [tarih, setTarih] = useState(baslangic.tarih);
  const [hesapId, setHesapId] = useState(baslangic.hesapId ?? "");
  const [odeme, setOdeme] = useState<Odeme>(baslangic.odeme);
  const [karsiTaraf, setKarsiTaraf] = useState(baslangic.karsiTaraf);
  const [not, setNot] = useState(baslangic.not);
  const [transfer, setTransfer] = useState(baslangic.transfer);
  const [hata, setHata] = useState<string | null>(null);

  const secilebilir = kategoriler.filter((k) => k.tur === tur && (!k.arsiv || k.id === kategoriId)).sort(kategoriSirasi);

  const turDegistir = (yeni: Tur) => {
    setTur(yeni);
    // Kategori artık listede yoksa ilk uygun olana geç: gönderilemeyen bir form kalmasın.
    if (!kategoriler.some((k) => k.id === kategoriId && k.tur === yeni)) {
      setKategoriId(kategoriler.find((k) => k.tur === yeni && !k.arsiv)?.id ?? "");
    }
  };

  const kaydet = () => {
    const kurus = paraCoz(tutar);
    if (kurus === null) return setHata("Tutar okunamadı.");
    if (kurus === 0) return setHata("Tutar sıfır olamaz.");
    const kategori = kategoriler.find((k) => k.id === kategoriId);
    if (!kategori) return setHata("Kategori seçilmedi.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return setHata("Tarih geçersiz.");

    onKaydet({
      ...baslangic,
      kategoriId: kategori.id,
      // Tür kategoriden kopyalanır; satır kendi yönünü taşır.
      tur: kategori.tur,
      kurus: Math.abs(kurus),
      tarih,
      not: not.trim(),
      karsiTaraf: karsiTaraf.trim(),
      odeme,
      hesapId: hesapId || null,
      transfer,
    });
  };

  return (
    <div className={s.duzen}>
      <div className={s.form}>
        <label className={s.alan}>
          <span className={s.etiket}>Tür</span>
          <select className={s.secim} value={tur} onChange={(e) => turDegistir(e.target.value as Tur)}>
            <option value="gider">Gider</option>
            <option value="gelir">Gelir</option>
          </select>
        </label>

        <label className={s.alan}>
          <span className={s.etiket}>Kategori</span>
          <select className={s.secim} value={kategoriId} onChange={(e) => setKategoriId(e.target.value)}>
            {secilebilir.length === 0 && <option value="">— kategori yok —</option>}
            {secilebilir.map((k) => (
              <option key={k.id} value={k.id}>
                {kategoriAdi(k)}
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
            onKeyDown={(e) => e.key === "Enter" && kaydet()}
            autoFocus
          />
        </label>

        <label className={s.alan}>
          <span className={s.etiket}>Tarih</span>
          <input className={s.metin} type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
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

        <div className={s.alan}>
          <span className={s.etiket}>Karşı taraf</span>
          <Giris
            value={karsiTaraf}
            list="harcama-karsi-taraflar"
            placeholder="İşyeri, kişi"
            onChange={(e) => setKarsiTaraf(e.target.value)}
          />
          <datalist id="harcama-karsi-taraflar">
            {karsiTaraflar.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>

        <div className={s.alan}>
          <span className={s.etiket}>Not</span>
          <Giris value={not} onChange={(e) => setNot(e.target.value)} onKeyDown={(e) => e.key === "Enter" && kaydet()} />
        </div>
      </div>

      {hata && <p className={s.uyari}>{hata}</p>}

      <div className={s.eylemler}>
        <Dugme tur="dolu" ikon={<Check size={15} />} onClick={kaydet}>
          Kaydet
        </Dugme>
        <Dugme tur="sade" ikon={<X size={15} />} onClick={onIptal}>
          Vazgeç
        </Dugme>
        <label className={s.kutu} title="Kendi hesapları arasında para hareketi. Bakiyeyi değiştirir, gelir/gider raporlarına girmez.">
          <input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} />
          Hesaplar arası transfer
        </label>
      </div>
    </div>
  );
}
