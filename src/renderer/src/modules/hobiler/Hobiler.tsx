import { AnimatePresence, motion } from "motion/react";
import { Gamepad2, LayoutGrid, List, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bugunIso } from "@ortak/plan";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { maddeGecisi } from "@/ui/hareket";
import { useDosya } from "@/veri/kanca";
import { DurumDuzenleyici } from "./DurumDuzenleyici";
import { YanPanel } from "./YanPanel";
import { useAlanlar, useGorunum } from "./kanca";
import s from "./hobiler.module.css";
import {
  SABLONLAR,
  dosyaYolu,
  durumRengi,
  durumlarKur,
  normalize,
  slugla,
  yeniId,
  type Alan,
  type Madde,
} from "./tipler";

/* --- alan listesi ------------------------------------------------------ */

function AlanListesi({
  alanlar,
  secili,
  onSec,
  onEkle,
}: {
  alanlar: { slug: string; ad: string; adet: number }[];
  secili: string | null;
  onSec: (slug: string) => void;
  onEkle: (slug: string, alan: Alan) => Promise<boolean>;
}) {
  const [acik, setAcik] = useState(false);
  const [ad, setAd] = useState("");
  const [sablonId, setSablonId] = useState(SABLONLAR[0]!.id);
  const [hata, setHata] = useState<string | null>(null);

  const gonder = async () => {
    const temiz = ad.trim();
    if (!temiz) return;
    const slug = slugla(temiz);
    if (!slug) {
      setHata("Bu ad dosya adına çevrilemedi.");
      return;
    }
    const sablon = SABLONLAR.find((x) => x.id === sablonId)!;
    const ok = await onEkle(slug, {
      alan: slug,
      ad: temiz,
      durumlar: durumlarKur(sablon.durumlar),
      maddeler: [],
    });
    if (!ok) {
      setHata("Bu adda bir alan zaten var.");
      return;
    }
    setAd("");
    setHata(null);
    setAcik(false);
    onSec(slug);
  };

  return (
    <div className={s.alanlar}>
      {alanlar.map((a) => (
        <button
          key={a.slug}
          type="button"
          className={a.slug === secili ? `${s.alanBag} ${s.alanEtkin}` : s.alanBag}
          onClick={() => onSec(a.slug)}
        >
          <span className={s.alanAd}>{a.ad}</span>
          <span className={s.alanSayi}>{a.adet}</span>
        </button>
      ))}

      <Dugme
        tur="sade"
        className={s.alanEkleAc}
        ikon={<Plus size={15} />}
        onClick={() => setAcik((x) => !x)}
      >
        Alan ekle
      </Dugme>

      <AnimatePresence initial={false}>
        {acik && (
          <motion.div
            className={s.yeniAlan}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <Giris
              value={ad}
              autoFocus
              placeholder="Oyunlar"
              onChange={(e) => setAd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void gonder();
                if (e.key === "Escape") setAcik(false);
              }}
            />
            <div className={s.sablonlar}>
              {SABLONLAR.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={x.id === sablonId ? `${s.sablon} ${s.sablonSecili}` : s.sablon}
                  onClick={() => setSablonId(x.id)}
                  title={x.durumlar.join(" · ")}
                >
                  {x.ad}
                </button>
              ))}
            </div>
            <p className={s.formNot}>
              {SABLONLAR.find((x) => x.id === sablonId)!.durumlar.join(" · ")}
            </p>
            {hata && <p className={s.formNot}>{hata}</p>}
            <div className={s.formSatir}>
              <Dugme tur="dolu" onClick={() => void gonder()} disabled={!ad.trim()}>
                Oluştur
              </Dugme>
              <Dugme tur="sade" onClick={() => setAcik(false)}>
                Vazgeç
              </Dugme>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --- seçili alanın ekranı ---------------------------------------------- */

function AlanEkrani({
  slug,
  yan,
  onAlanSil,
}: {
  slug: string;
  yan: React.ReactNode;
  /** Silinen alanın son hâli geri alma için verilir. */
  onAlanSil: (alan: Alan) => void;
}) {
  const { veri: ham, yukleniyor, hata, disaridanDegisti, yaz } = useDosya<unknown>(dosyaYolu(slug));
  const [yeni, setYeni] = useState("");
  const [yeniDurum, setYeniDurum] = useState<string | null>(null);
  const [suzgec, setSuzgec] = useState<string | null>(null);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [durumlarAcik, setDurumlarAcik] = useState(false);
  const [gorunum, setGorunum] = useGorunum(slug);

  // Eski biçim (durumlar: string[]) burada yeni biçime çevrilir; ilk yazmada
  // diske de yeni biçim iner, eskisi .bak olarak kalır.
  const veri = useMemo(() => normalize(ham, slug), [ham, slug]);

  const sayilar = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of veri?.maddeler ?? []) m.set(x.durum, (m.get(x.durum) ?? 0) + 1);
    return m;
  }, [veri]);

  const gorunen = useMemo(
    () => (veri?.maddeler ?? []).filter((m) => !suzgec || m.durum === suzgec),
    [veri, suzgec],
  );

  if (yukleniyor) {
    return (
      <div className={s.duzen}>
        {yan}
        <Kart>
          <Yuklenirken />
        </Kart>
      </div>
    );
  }

  if (!veri) {
    return (
      <div className={s.duzen}>
        {yan}
        <Kart>
          <BosDurum baslik="Alan dosyası okunamadı" metin={hata ?? undefined} />
        </Kart>
      </div>
    );
  }

  const durumlar = veri.durumlar;
  const varsayilanDurum = yeniDurum ?? durumlar[0]?.ad ?? "";
  const secili = veri.maddeler.find((m) => m.id === seciliId) ?? null;

  const kaydet = (yeniAlan: Alan) => void yaz(yeniAlan);
  const maddeleriKaydet = (maddeler: Madde[]) => kaydet({ ...veri, maddeler });

  const ekle = () => {
    const ad = yeni.trim();
    if (!ad) return;
    const madde: Madde = {
      id: yeniId(),
      ad,
      durum: varsayilanDurum,
      not: "",
      // Yerel gün: UTC ile gece 00-03 arası eklenen madde düne yazılıyordu.
      eklendi: bugunIso(),
    };
    maddeleriKaydet([madde, ...veri.maddeler]);
    setYeni("");
    setSeciliId(madde.id);
  };

  const maddeDegistir = (yeniMadde: Madde) =>
    maddeleriKaydet(veri.maddeler.map((x) => (x.id === yeniMadde.id ? yeniMadde : x)));

  const maddeSil = (id: string) => {
    maddeleriKaydet(veri.maddeler.filter((x) => x.id !== id));
    setSeciliId(null);
  };

  const panelVar = durumlarAcik || secili !== null;

  return (
    <div className={panelVar ? `${s.duzen} ${s.duzenPanelli}` : s.duzen}>
      {yan}

      <Kart
        dolgulu={false}
        baslik={veri.ad}
        not={
          disaridanDegisti ? "dışarıdan güncellendi" : hata ? hata : `${veri.maddeler.length} kayıt`
        }
        bas={
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            <Dugme
              tur={gorunum === "satir" ? "cizgili" : "sade"}
              ikon={<List size={15} />}
              onClick={() => setGorunum("satir")}
              title="Satır görünümü"
              aria-label="Satır görünümü"
            />
            <Dugme
              tur={gorunum === "izgara" ? "cizgili" : "sade"}
              ikon={<LayoutGrid size={15} />}
              onClick={() => setGorunum("izgara")}
              title="Izgara görünümü"
              aria-label="Izgara görünümü"
            />
            <Dugme
              tur={durumlarAcik ? "cizgili" : "sade"}
              ikon={<SlidersHorizontal size={15} />}
              onClick={() => {
                setDurumlarAcik((x) => !x);
                setSeciliId(null);
              }}
              title="Durumları düzenle"
              aria-label="Durumları düzenle"
            />
            <Dugme
              tur="sade"
              ikon={<Trash2 size={15} />}
              onClick={() => {
                onAlanSil(veri);
              }}
              title="Alanı sil"
              aria-label="Alanı sil"
            />
          </div>
        }
      >
        <div className={s.ekleme}>
          <Giris
            value={yeni}
            placeholder={`${veri.ad} listesine ekle…`}
            onChange={(e) => setYeni(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ekle()}
          />
          <select
            className={s.secim}
            value={varsayilanDurum}
            onChange={(e) => setYeniDurum(e.target.value)}
            aria-label="Yeni kaydın durumu"
          >
            {durumlar.map((d) => (
              <option key={d.ad} value={d.ad}>
                {d.ad}
              </option>
            ))}
          </select>
          <Dugme tur="dolu" onClick={ekle} disabled={!yeni.trim()}>
            Ekle
          </Dugme>
        </div>

        <div className={s.suzgec}>
          <button
            type="button"
            className={suzgec === null ? `${s.cip} ${s.cipSecili}` : s.cip}
            onClick={() => setSuzgec(null)}
          >
            hepsi <span className={s.cipSayi}>{veri.maddeler.length}</span>
          </button>
          {durumlar.map((d) => (
            <button
              key={d.ad}
              type="button"
              className={suzgec === d.ad ? `${s.cip} ${s.cipSecili}` : s.cip}
              onClick={() => setSuzgec(suzgec === d.ad ? null : d.ad)}
            >
              {d.ad} <span className={s.cipSayi}>{sayilar.get(d.ad) ?? 0}</span>
            </button>
          ))}
        </div>

        {gorunen.length === 0 ? (
          <BosDurum
            baslik={suzgec ? `"${suzgec}" durumunda kayıt yok` : "Liste boş"}
            metin={suzgec ? undefined : "Yukarıdaki kutudan ilk kaydı ekle."}
            eylem={
              suzgec ? <Dugme onClick={() => setSuzgec(null)}>Süzgeci kaldır</Dugme> : undefined
            }
          />
        ) : gorunum === "izgara" ? (
          <div className={s.izgara}>
            {gorunen.map((m) => (
              <button
                key={m.id}
                type="button"
                className={m.id === seciliId ? `${s.kutu} ${s.kutuSecili}` : s.kutu}
                onClick={() => {
                  setSeciliId(m.id);
                  setDurumlarAcik(false);
                }}
              >
                <span
                  className={s.kutuSerit}
                  style={{ background: durumRengi(durumlar, m.durum) }}
                />
                <span className={s.kutuAd}>{m.ad}</span>
                {m.not && <span className={s.kutuNot}>{m.not}</span>}
                <span className={s.kutuDurum}>{m.durum}</span>
              </button>
            ))}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {gorunen.map((m) => (
              <motion.div
                key={m.id}
                className={s.madde}
                variants={maddeGecisi}
                initial="giris"
                animate="duruyor"
                exit="cikis"
                layout
              >
                <button
                  type="button"
                  className={
                    m.id === seciliId ? `${s.maddeBas} ${s.maddeSecili}` : s.maddeBas
                  }
                  onClick={() => {
                    setSeciliId(m.id);
                    setDurumlarAcik(false);
                  }}
                >
                  <span
                    className={s.durumNokta}
                    style={{ background: durumRengi(durumlar, m.durum) }}
                  />
                  <span className={s.maddeAd}>{m.ad}</span>
                  {m.not && <span className={s.maddeNot}>{m.not}</span>}
                  <span className={s.eklendi}>{m.durum}</span>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </Kart>

      {durumlarAcik ? (
        <DurumDuzenleyici alan={veri} onDegis={kaydet} onKapat={() => setDurumlarAcik(false)} />
      ) : secili ? (
        <YanPanel
          alan={veri}
          madde={secili}
          onDegis={maddeDegistir}
          onSil={() => maddeSil(secili.id)}
          onKapat={() => setSeciliId(null)}
        />
      ) : null}
    </div>
  );
}

/* --- modül ekranı ------------------------------------------------------ */

export function Hobiler() {
  const { alanlar, yukleniyor, alanEkle, alanSil } = useAlanlar();
  const [secili, setSecili] = useState<string | null>(null);

  useEffect(() => {
    if (alanlar.length === 0) setSecili(null);
    else if (!secili || !alanlar.some((a) => a.slug === secili)) setSecili(alanlar[0]!.slug);
  }, [alanlar, secili]);

  const ilkAlan = async () => {
    await alanEkle("oyunlar", {
      alan: "oyunlar",
      ad: "Oyunlar",
      durumlar: durumlarKur(SABLONLAR[0]!.durumlar),
      maddeler: [],
    });
    setSecili("oyunlar");
  };

  return (
    <>
      <EkranBasi
        baslik="Hobiler"
        altyazi="Oynadığın, izlediğin, alacağın şeylerin listesi. Plan değil, envanter."
      />

      {yukleniyor ? (
        <Kart>
          <Yuklenirken />
        </Kart>
      ) : alanlar.length === 0 ? (
        <Kart>
          <BosDurum
            ikon={<Gamepad2 size={34} strokeWidth={1.4} />}
            baslik="Henüz alan yok"
            metin="Bir alan bir listedir: Oyunlar, Diziler, Kitaplar. İstediğin kadar açabilirsin."
            eylem={
              <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={() => void ilkAlan()}>
                Oyunlar ile başla
              </Dugme>
            }
          />
        </Kart>
      ) : secili ? (
        <AlanEkrani
          key={secili}
          slug={secili}
          onAlanSil={(alan) => {
            const slug = secili;
            silVeBildir({
              metin: `"${alan.ad}" alanı silindi.`,
              sil: () => alanSil(slug),
              geriKoy: async () => {
                const ok = await alanEkle(slug, alan);
                if (ok) setSecili(slug);
                return ok;
              },
            });
          }}
          yan={
            <AlanListesi
              alanlar={alanlar}
              secili={secili}
              onSec={setSecili}
              onEkle={alanEkle}
            />
          }
        />
      ) : null}
    </>
  );
}
