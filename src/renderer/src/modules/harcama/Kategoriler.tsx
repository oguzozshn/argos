import { useState } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Kategori, Tur } from "@ortak/harcama";
import { TUR_ADLARI } from "@ortak/harcama";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Satir, Yuklenirken } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { useHarcama } from "./kanca";
import { kategoriSirasi, yeniId } from "./tipler";
import s from "./harcama.module.css";

const YENI = (tur: Tur, sira: number): Kategori => ({
  id: yeniId(),
  ad: "",
  tur,
  renk: "#5b8def",
  simge: "",
  arsiv: false,
  sira,
});

export function Kategoriler() {
  const defter = useHarcama(true);
  const [duzenlenen, setDuzenlenen] = useState<Kategori | null>(null);
  const [arsivGoster, setArsivGoster] = useState(false);

  const { tanimlar, islemler } = defter;

  const yaz = (kategoriler: Kategori[], butceler = tanimlar.butceler) =>
    void defter.tanimlariYaz({ ...tanimlar, kategoriler, butceler });

  const kaydet = (kategori: Kategori) => {
    const ad = kategori.ad.trim();
    if (!ad) return;
    // Aynı ad iki yönde birden olabilir ("Kira" ödenen ve alınan), tür anahtarın parçası.
    if (tanimlar.kategoriler.some((k) => k.id !== kategori.id && k.tur === kategori.tur && k.ad.trim() === ad)) return;
    const varOlan = tanimlar.kategoriler.some((k) => k.id === kategori.id);
    yaz(
      varOlan
        ? tanimlar.kategoriler.map((k) => (k.id === kategori.id ? { ...kategori, ad } : k))
        : [...tanimlar.kategoriler, { ...kategori, ad }],
    );
    setDuzenlenen(null);
  };

  const tasi = (kategori: Kategori, yon: number) => {
    const kardesler = tanimlar.kategoriler.filter((k) => k.tur === kategori.tur).sort(kategoriSirasi);
    const yer = kardesler.findIndex((k) => k.id === kategori.id);
    const hedef = yer + yon;
    if (yer < 0 || hedef < 0 || hedef >= kardesler.length) return;
    [kardesler[yer], kardesler[hedef]] = [kardesler[hedef]!, kardesler[yer]!];
    const yeniSira = new Map(kardesler.map((k, i) => [k.id, i + 1]));
    yaz(tanimlar.kategoriler.map((k) => (yeniSira.has(k.id) ? { ...k, sira: yeniSira.get(k.id)! } : k)));
  };

  const kullanim = (id: string) => ({
    islem: islemler.filter((i) => i.kategoriId === id).length,
    kural: tanimlar.duzenliler.filter((d) => d.kategoriId === id).length,
  });

  const sil = (kategori: Kategori) => {
    // Kategoriyle birlikte bütçesi de gidiyor; geri alma ikisini de koyar.
    const butce = tanimlar.butceler.find((b) => b.kategoriId === kategori.id);
    silVeBildir({
      metin: `"${kategori.ad}" kategorisi silindi.`,
      sil: () =>
        defter.tanimlariDegistir((t) => ({
          ...t,
          kategoriler: t.kategoriler.filter((k) => k.id !== kategori.id),
          butceler: t.butceler.filter((b) => b.kategoriId !== kategori.id),
        })),
      geriKoy: () =>
        defter.tanimlariDegistir((t) => ({
          ...t,
          kategoriler: t.kategoriler.some((k) => k.id === kategori.id) ? t.kategoriler : [...t.kategoriler, kategori],
          butceler:
            butce && !t.butceler.some((b) => b.kategoriId === kategori.id) ? [...t.butceler, butce] : t.butceler,
        })),
    });
  };

  const arsivle = (kategori: Kategori, arsiv: boolean) =>
    yaz(tanimlar.kategoriler.map((k) => (k.id === kategori.id ? { ...k, arsiv } : k)));

  if (defter.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Kategoriler" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const bolum = (tur: Tur) => {
    const liste = tanimlar.kategoriler.filter((k) => k.tur === tur && (arsivGoster || !k.arsiv)).sort(kategoriSirasi);
    return (
      <Kart
        dolgulu={false}
        baslik={TUR_ADLARI[tur]}
        not={
          <Dugme
            tur="sade"
            ikon={<Plus size={15} />}
            onClick={() => setDuzenlenen(YENI(tur, tanimlar.kategoriler.filter((k) => k.tur === tur).length + 1))}
          >
            Ekle
          </Dugme>
        }
      >
        {liste.length === 0 ? (
          <BosDurum baslik="Kategori yok" />
        ) : (
          <div className={s.satirlar}>
            {liste.map((k) => {
              const kd = kullanim(k.id);
              return (
                <Satir
                  key={k.id}
                  sol={<span className={s.nokta} style={{ background: k.renk }} />}
                  baslik={
                    <>
                      {k.simge ? `${k.simge} ${k.ad}` : k.ad} {k.arsiv && <Etiket tur="uyari">arşiv</Etiket>}
                    </>
                  }
                  alt={`${kd.islem} işlem${kd.kural > 0 ? ` · ${kd.kural} düzenli kural` : ""}`}
                  sag={
                    <div className={s.eylemler}>
                      <Dugme tur="sade" ikon={<ChevronUp size={15} />} aria-label="Yukarı" onClick={() => tasi(k, -1)} />
                      <Dugme tur="sade" ikon={<ChevronDown size={15} />} aria-label="Aşağı" onClick={() => tasi(k, 1)} />
                      <Dugme tur="sade" ikon={<Pencil size={15} />} aria-label="Düzenle" onClick={() => setDuzenlenen(k)} />
                      <Dugme
                        tur="sade"
                        ikon={k.arsiv ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                        aria-label={k.arsiv ? "Arşivden çıkar" : "Arşivle"}
                        onClick={() => arsivle(k, !k.arsiv)}
                      />
                      {/* Kullanımdaki kategori silinmez, arşivlenir: geçmiş toplamlar sessizce bozulmasın. */}
                      {kd.islem === 0 && kd.kural === 0 && (
                        <Dugme tur="sade" ikon={<Trash2 size={15} />} aria-label="Sil" onClick={() => sil(k)} />
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </Kart>
    );
  };

  return (
    <>
      <EkranBasi
        baslik="Kategoriler"
        altyazi="Kullanımdaki kategori silinmez, arşivlenir — geçmiş toplamlar yerinde kalsın."
        sag={
          <Dugme tur="sade" onClick={() => setArsivGoster(!arsivGoster)}>
            {arsivGoster ? "Arşivi gizle" : "Arşivi göster"}
          </Dugme>
        }
      />

      {defter.hata && <p className={s.uyari}>{defter.hata}</p>}

      <div className={s.duzen}>
        {duzenlenen && (
          <Kart>
            <KategoriFormu
              key={duzenlenen.id}
              baslangic={duzenlenen}
              onKaydet={kaydet}
              onIptal={() => setDuzenlenen(null)}
            />
          </Kart>
        )}
        <div className={s.ikiSutun}>
          {bolum("gider")}
          {bolum("gelir")}
        </div>
      </div>
    </>
  );
}

function KategoriFormu({
  baslangic,
  onKaydet,
  onIptal,
}: {
  baslangic: Kategori;
  onKaydet: (kategori: Kategori) => void;
  onIptal: () => void;
}) {
  const [ad, setAd] = useState(baslangic.ad);
  const [renk, setRenk] = useState(baslangic.renk);
  const [simge, setSimge] = useState(baslangic.simge);

  const kaydet = () => onKaydet({ ...baslangic, ad, renk, simge: simge.trim() });

  return (
    <div className={s.duzen}>
      <div className={s.form}>
        <label className={s.alan}>
          <span className={s.etiket}>Ad · {TUR_ADLARI[baslangic.tur]}</span>
          <input
            className={s.metin}
            value={ad}
            autoFocus
            onChange={(e) => setAd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && kaydet()}
          />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Simge</span>
          <Giris value={simge} maxLength={4} placeholder="🛒" onChange={(e) => setSimge(e.target.value)} />
        </label>
        <label className={s.alan}>
          <span className={s.etiket}>Renk</span>
          <input className={s.metin} type="color" value={renk} onChange={(e) => setRenk(e.target.value)} />
        </label>
      </div>
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
