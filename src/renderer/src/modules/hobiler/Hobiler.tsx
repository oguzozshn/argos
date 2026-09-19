import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  Gamepad2,
  LayoutGrid,
  List,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bugunIso } from "@ortak/plan";
import { grubaTasi, tasi } from "@ortak/siralama";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { maddeGecisi } from "@/ui/hareket";
import { useDosya } from "@/veri/kanca";
import { DurumDuzenleyici } from "./DurumDuzenleyici";
import { YanPanel } from "./YanPanel";
import { useAlanlar, useGorunum, useKapaliGruplar } from "./kanca";
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

/** Bırakılırsa kaydın ineceği yer: bir kaydın önü/arkası ya da bir grubun başı. */
type Hedef = { tip: "madde"; id: string; once: boolean } | { tip: "grup"; durum: string };

/**
 * Liste duruma göre gruplu. Durum ayrıca yazılmıyor, kaydın hangi grupta
 * durduğundan okunuyor; değiştirmek için kayıt başka bir gruba sürükleniyor.
 * Eskiden durum üç yerde dağınıktı (ekleme menüsü, süzgeç, panel) ve listede
 * soluk bir yazıdan ibaretti.
 */
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
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [durumlarAcik, setDurumlarAcik] = useState(false);
  const [gorunum, setGorunum] = useGorunum(slug);
  // Hangi grubun ekleme satırı açık ve içine ne yazılıyor.
  const [ekleGrup, setEkleGrup] = useState<string | null>(null);
  const [yeni, setYeni] = useState("");
  // Sürüklenen kayıt ve bırakılırsa nereye ineceği.
  const [suruklenen, setSuruklenen] = useState<string | null>(null);
  const [hedef, setHedef] = useState<Hedef | null>(null);

  // Eski biçim (durumlar: string[]) burada yeni biçime çevrilir; ilk yazmada
  // diske de yeni biçim iner, eskisi .bak olarak kalır.
  const veri = useMemo(() => normalize(ham, slug), [ham, slug]);
  const [kapali, kapaliCevir] = useKapaliGruplar(
    slug,
    (veri?.durumlar ?? []).map((d) => d.ad),
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
  const secili = veri.maddeler.find((m) => m.id === seciliId) ?? null;
  // Durumu listede olmayan kayıt (dosya elle düzenlenmiş) kaybolmasın: kendi
  // grubunda, sonda görünür.
  const bilinmeyen = [
    ...new Set(veri.maddeler.map((m) => m.durum).filter((d) => !durumlar.some((x) => x.ad === d))),
  ].map((ad) => ({ ad, renk: durumRengi(durumlar, ad) }));

  const kaydet = (yeniAlan: Alan) => void yaz(yeniAlan);
  const maddeleriKaydet = (maddeler: Madde[]) => kaydet({ ...veri, maddeler });

  const ekle = (durum: string) => {
    const ad = yeni.trim();
    if (!ad) return;
    const madde: Madde = {
      id: yeniId(),
      ad,
      durum,
      not: "",
      // Yerel gün: UTC ile gece 00-03 arası eklenen madde düne yazılıyordu.
      eklendi: bugunIso(),
    };
    // Dizinin başı, grubun da başı: grup dizideki sırayla süzülüyor.
    maddeleriKaydet([madde, ...veri.maddeler]);
    // Kutu açık kalır: arka arkaya birkaç şey eklemek tek tek açmaktan hızlı.
    setYeni("");
  };

  const maddeDegistir = (yeniMadde: Madde) =>
    maddeleriKaydet(veri.maddeler.map((x) => (x.id === yeniMadde.id ? yeniMadde : x)));

  const maddeSil = (id: string) => {
    maddeleriKaydet(veri.maddeler.filter((x) => x.id !== id));
    setSeciliId(null);
  };

  const suruklemeBitti = () => {
    setSuruklenen(null);
    setHedef(null);
  };

  const birak = (e: React.DragEvent) => {
    e.preventDefault();
    if (suruklenen && hedef) {
      const hedefMadde = hedef.tip === "madde" ? veri.maddeler.find((m) => m.id === hedef.id) : null;
      const grup = hedef.tip === "grup" ? hedef.durum : hedefMadde?.durum;
      if (grup !== undefined) {
        const yeniDizi = grubaTasi(
          veri.maddeler,
          suruklenen,
          "durum",
          grup,
          hedef.tip === "madde" ? hedef : null,
        );
        if (yeniDizi !== veri.maddeler) maddeleriKaydet(yeniDizi);
      }
    }
    suruklemeBitti();
  };

  /**
   * Kaydı sürükleyip başka bir kaydın önüne/arkasına bırakma — aynı grupta
   * sıralar, başka grupta durumu da değiştirir. Satırda üst-alt yarıya,
   * ızgarada sol-sağ yarıya bakılır: ızgara soldan sağa akıyor.
   */
  const surukleme = (m: Madde, yatay: boolean, grupMaddeleri: Madde[]) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", m.id);
      setSuruklenen(m.id);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!suruklenen) return; // dışarıdan gelen metin/dosya bırakılmaz
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const r = e.currentTarget.getBoundingClientRect();
      const once = yatay ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      if (hedef?.tip !== "madde" || hedef.id !== m.id || hedef.once !== once)
        setHedef({ tip: "madde", id: m.id, once });
    },
    onDrop: birak,
    onDragEnd: suruklemeBitti,
    // Fare kullanmadan da sıralanabilsin: Alt + ok tuşları grup içindeki komşuyla yer değiştirir.
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!e.altKey) return;
      const geri = e.key === "ArrowUp" || e.key === "ArrowLeft";
      const ileri = e.key === "ArrowDown" || e.key === "ArrowRight";
      if (!geri && !ileri) return;
      e.preventDefault();
      const i = grupMaddeleri.findIndex((x) => x.id === m.id);
      const komsu = grupMaddeleri[geri ? i - 1 : i + 1];
      if (!komsu) return;
      const yeniDizi = tasi(veri.maddeler, m.id, komsu.id, geri);
      if (yeniDizi !== veri.maddeler) maddeleriKaydet(yeniDizi);
    },
    onClick: () => {
      setSeciliId(m.id);
      setDurumlarAcik(false);
    },
    title: "Sürükleyerek sırala ya da başka gruba taşı · Alt + ok tuşları",
  });

  /** Grup başlığı ve ekleme satırı da bırakma yeri: kayıt grubun başına iner. */
  const grubaBirakma = (durum: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!suruklenen) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (hedef?.tip !== "grup" || hedef.durum !== durum) setHedef({ tip: "grup", durum });
    },
    onDrop: birak,
    "data-hedef": hedef?.tip === "grup" && hedef.durum === durum ? "grup" : undefined,
  });

  /** Bırakma çizgisi ve sürüklenenin soluklaşması CSS'te, data özniteliğiyle. */
  const isaret = (m: Madde) => ({
    "data-suruklenen": m.id === suruklenen || undefined,
    "data-hedef":
      hedef?.tip === "madde" && hedef.id === m.id && m.id !== suruklenen
        ? hedef.once
          ? "once"
          : "sonra"
        : undefined,
  });

  /** Liste dışına çıkınca çizgi kalmasın. */
  const disariCikti = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHedef(null);
  };

  const grup = (d: { ad: string; renk: string }) => {
    const grupMaddeleri = veri.maddeler.filter((m) => m.durum === d.ad);
    const acik = !kapali.has(d.ad);

    return (
      <section key={d.ad} className={s.grup}>
        <button
          type="button"
          className={s.grupBas}
          aria-expanded={acik}
          onClick={() => kapaliCevir(d.ad)}
          {...grubaBirakma(d.ad)}
        >
          {acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className={s.durumNokta} style={{ background: d.renk }} />
          <span className={s.grupAd}>{d.ad}</span>
          <span className={s.grupSayi}>{grupMaddeleri.length}</span>
        </button>

        {acik && (
          <>
            {gorunum === "izgara" ? (
              grupMaddeleri.length > 0 && (
                <div className={s.izgara}>
                  {grupMaddeleri.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={m.id === seciliId ? `${s.kutu} ${s.kutuSecili}` : s.kutu}
                      {...surukleme(m, true, grupMaddeleri)}
                      {...isaret(m)}
                    >
                      <span className={s.kutuSerit} style={{ background: d.renk }} />
                      <span className={s.kutuAd}>{m.ad}</span>
                      {m.not && <span className={s.kutuNot}>{m.not}</span>}
                    </button>
                  ))}
                </div>
              )
            ) : (
              // Çıkış animasyonu yok, bilerek: AnimatePresence içindeki satırın
              // çıkışı hiç başlamıyordu (motion 13.2) — silinen ya da başka
              // gruba taşınan kayıt eski yerinde hayalet gibi kalıyordu.
              // Giriş ve yer değiştirme animasyonu duruyor.
              <>
                {grupMaddeleri.map((m) => (
                  <motion.div
                    key={m.id}
                    className={s.madde}
                    variants={maddeGecisi}
                    initial="giris"
                    animate="duruyor"
                    layout
                    {...isaret(m)}
                  >
                    <button
                      type="button"
                      className={
                        m.id === seciliId ? `${s.maddeBas} ${s.maddeSecili}` : s.maddeBas
                      }
                      {...surukleme(m, false, grupMaddeleri)}
                    >
                      <span className={s.maddeAd}>{m.ad}</span>
                      {m.not && <span className={s.maddeNot}>{m.not}</span>}
                    </button>
                  </motion.div>
                ))}
              </>
            )}

            {ekleGrup === d.ad ? (
              <div className={s.ekleSatir}>
                <Giris
                  value={yeni}
                  autoFocus
                  placeholder={`${d.ad} grubuna ekle…`}
                  onChange={(e) => setYeni(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") ekle(d.ad);
                    if (e.key === "Escape") {
                      setEkleGrup(null);
                      setYeni("");
                    }
                  }}
                  onBlur={() => {
                    // Yazılmış bir şey varken dışarı tıklamak onu silmesin.
                    if (!yeni.trim()) setEkleGrup(null);
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className={s.ekleAc}
                onClick={() => {
                  setEkleGrup(d.ad);
                  setYeni("");
                }}
                {...grubaBirakma(d.ad)}
              >
                <Plus size={14} /> ekle
              </button>
            )}
          </>
        )}
      </section>
    );
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
        <div onDragLeave={disariCikti}>{[...durumlar, ...bilinmeyen].map(grup)}</div>
      </Kart>

      {durumlarAcik ? (
        <DurumDuzenleyici alan={veri} onDegis={kaydet} onKapat={() => setDurumlarAcik(false)} />
      ) : secili ? (
        <YanPanel
          key={secili.id}
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
