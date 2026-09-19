import { CalendarOff, ChevronLeft, ChevronRight, History, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AY_TAM, GUN_ADLARI, GUN_KISA, gunEkle, haftaninGunu, saatAyikla } from "@ortak/gun";
import type { Hafta as HaftaTipi, Slot } from "@ortak/plan";
import { takvim } from "@ortak/ozet";
import { dakika, gununSlotlari, kuralSetiTamamla, yeniSlotId, type KuralSeti } from "@ortak/kural";
import { gunBosalt, gunTipi, type BosaltRaporu } from "@ortak/plan-islem";
import type { TodoistGorev } from "@ortak/tipler";
import { Kisayollar } from "@/ui/Kisayollar";
import { Dugme, EkranBasi, Etiket, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import {
  hedefOzellikleri,
  hedefSinifi,
  kaynakOzellikleri,
  useSurukle,
  type SurukleDurumu,
} from "@/ui/surukle";
import { useDosya } from "@/veri/kanca";
import { usePlanVerisi } from "@/veri/plan";
import { gorevSaati, useTodoistAralik } from "@/veri/todoist";
import s from "./takvim.module.css";

/**
 * Takvim — geçmişe değil ÖNE bakar.
 *
 * İki kaynak birleşir: plan slotları (`data/W*.json`) ve Todoist görevleri.
 * Takvim yalnızca planı gösterse günün yarısı eksik kalırdı.
 *
 * Ay ızgarasının işi **boşluk görmek**: hangi güne ne sığar, korumalı alan
 * nerede, sosyal kota hangi güne konabilir. Hafta ve gün ekseni ise saati
 * gösterir — plan ile görev yan yana.
 *
 * Haftası kurulmamış bir gün hata değil: o gün de açılır, görevleri görünür,
 * yalnızca slot düzenleme kapalıdır.
 */

const kisaltAlan = (a: string): string => (a.length <= 4 ? a : a.slice(0, 3));

const TIP_ADI: Record<string, string> = { ofis: "ofis", ev: "ev", haftaSonu: "h.sonu" };

type Gorunum = "ay" | "hafta" | "gun";

/** Eksenin saat aralığı ve bir saatin piksel yüksekliği. */
const ILK_SAAT = 6;
const SON_SAAT = 24;
const SAAT_YUKSEKLIK = 46;
const EKSEN_YUKSEKLIK = (SON_SAAT - ILK_SAAT) * SAAT_YUKSEKLIK;

const yerDk = (dk: number): number => ((dk - ILK_SAAT * 60) / 60) * SAAT_YUKSEKLIK;

/** Bir ISO tarihin plan dosyasındaki karşılığı. */
interface GunKaydi {
  kod: string;
  gunNo: number;
  veri: HaftaTipi;
}

const haftaninPazartesisi = (iso: string): string => gunEkle(iso, -haftaninGunu(iso));

/* --- sürükleme ----------------------------------------------------------- */

/**
 * Takvimde yalnızca görev taşınıyor; gövde ortak (`ui/surukle`), buradaki
 * tek kural tekrarlı görevin sürüklenmemesi.
 *
 * Tarihi `due_string` ile yazmak tekrar düzenini siler — alışkanlık görevini
 * bir kez taşımak onu tümden bitirir.
 */
type Surukle = SurukleDurumu<TodoistGorev>;

const SURUKLENMEZ = "Tekrarlı görev sürüklenmez — tekrar düzeni silinir";

const gorevKaynagi = (g: TodoistGorev, sr: Surukle) =>
  kaynakOzellikleri(g, sr, { kapali: g.tekrarli });

/* --- görev parçaları ----------------------------------------------------- */

function GorevCipi({
  gorev,
  onKapat,
  surukle,
}: {
  gorev: TodoistGorev;
  onKapat: () => void;
  surukle: Surukle;
}) {
  const saat = gorevSaati(gorev);
  const ipucu = gorev.tekrarli ? SURUKLENMEZ : "tamamlamak için tıkla, taşımak için sürükle";
  return (
    <button
      type="button"
      className={gorev.tekrarli ? `${s.gorevCip} ${s.gorevCipTekrarli}` : s.gorevCip}
      onClick={onKapat}
      title={`${gorev.icerik}${saat ? ` · ${saat}` : ""} — ${ipucu}`}
      {...kaynakOzellikleri(gorev, surukle)}
    >
      <span className={s.gorevKutucuk} />
      <span className={s.gorevCipAd}>
        {saat ? `${saat} ` : ""}
        {gorev.icerik}
      </span>
    </button>
  );
}

/* --- gün sütunu (hafta ve gün ekseni ortak) ------------------------------ */

function EksenSutunu({
  iso,
  kayit,
  kurallar,
  gorevler,
  bugunMu,
  simdiDk,
  dar,
  onSlotSec,
  seciliSlot,
  surukle,
}: {
  iso: string;
  kayit: GunKaydi | null;
  kurallar: KuralSeti;
  gorevler: TodoistGorev[];
  bugunMu: boolean;
  simdiDk: number;
  dar: boolean;
  onSlotSec: (id: string | null) => void;
  seciliSlot: string | null;
  surukle: Surukle;
}) {
  const slotlar = kayit ? gununSlotlari(kayit.veri, kayit.gunNo) : [];
  const ofisK = kurallar.ofisGunuKurallari ?? {};

  // Yasak ve korumalı bantlar: nereye slot konmayacağı gözle görünsün.
  const bantlar: { bas: number; son: number; ad: string }[] = [];
  if (kayit) {
    const tip = gunTipi(kayit.gunNo, kayit.veri.ofisGunleri ?? []);
    if (tip === "ofis") {
      if (ofisK.sabahSlotuYok && ofisK.sabahSiniri) {
        bantlar.push({ bas: ILK_SAAT * 60, son: dakika(ofisK.sabahSiniri), ad: "sabah yok" });
      }
      if (ofisK.sonSlotBitisEnGec) {
        bantlar.push({ bas: dakika(ofisK.sonSlotBitisEnGec), son: SON_SAAT * 60, ad: "geç" });
      }
    }
    for (const k of kurallar.korumaliAlanlar ?? []) {
      if (k.gunler.includes(kayit.gunNo)) {
        bantlar.push({ bas: dakika(k.saattenSonra), son: SON_SAAT * 60, ad: "korumalı" });
      }
    }
  }

  const saatliGorevler = gorevler.filter((g) => gorevSaati(g) !== null);

  return (
    <div
      className={[dar ? `${s.slotSutunu} ${s.haftaSutun}` : s.slotSutunu, hedefSinifi(iso, surukle)]
        .filter(Boolean)
        .join(" ")}
      style={{ height: EKSEN_YUKSEKLIK }}
      {...hedefOzellikleri(iso, surukle)}
    >
      {Array.from({ length: (SON_SAAT - ILK_SAAT) * 2 + 1 }, (_, i) => (
        <div
          key={i}
          className={i % 2 ? `${s.saatCizgi} ${s.saatCizgiYarim}` : s.saatCizgi}
          style={{ top: (i * SAAT_YUKSEKLIK) / 2 }}
        />
      ))}

      {bantlar.map((b, i) => (
        <div
          key={i}
          className={s.bant}
          style={{ top: yerDk(b.bas), height: yerDk(b.son) - yerDk(b.bas) }}
        >
          {!dar && <span className={s.bantEtiket}>{b.ad}</span>}
        </div>
      ))}

      {slotlar.map((x) => (
        <button
          key={x.id}
          type="button"
          className={[
            s.blok,
            dar && s.blokKucuk,
            x.id === seciliSlot && s.blokSecili,
            x.durum === "yapildi" && s.blokYapildi,
            x.durum === "kacti" && s.blokKacti,
            x.durum === "tasindi" && s.blokTasindi,
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            top: yerDk(dakika(x.saat)),
            height: Math.max(20, (x.sureDk / 60) * SAAT_YUKSEKLIK - 3),
          }}
          onClick={() => onSlotSec(x.id === seciliSlot ? null : x.id)}
          title={`${x.saat} · ${x.alan} — ${x.konu} · ${x.sureDk} dk`}
        >
          <span className={s.blokBas}>{dar ? x.alan : `${x.saat} · ${x.alan}`}</span>
          {x.konu && !dar && <span className={s.blokAlt}>{x.konu}</span>}
        </button>
      ))}

      {saatliGorevler.map((g) => (
        <div
          key={g.id}
          className={`${s.blok} ${s.gorevBlok}${dar ? ` ${s.blokKucuk}` : ""}`}
          style={{ top: yerDk(dakika(gorevSaati(g)!)), height: 24 }}
          title={`${gorevSaati(g)} · ${g.icerik}${g.tekrarli ? ` — ${SURUKLENMEZ}` : ""}`}
          {...gorevKaynagi(g, surukle)}
        >
          <span className={s.blokBas}>{g.icerik}</span>
        </div>
      ))}

      {bugunMu && simdiDk >= ILK_SAAT * 60 && simdiDk <= SON_SAAT * 60 && (
        <div className={s.simdiCizgi} style={{ top: yerDk(simdiDk) }} />
      )}
    </div>
  );
}

function SaatSutunu() {
  return (
    <div className={s.saatSutunu}>
      {Array.from({ length: SON_SAAT - ILK_SAAT + 1 }, (_, i) => (
        <span key={i} className={s.saatEtiket} style={{ top: i * SAAT_YUKSEKLIK }}>
          {String(ILK_SAAT + i).padStart(2, "0")}:00
        </span>
      ))}
    </div>
  );
}

/* --- ekran --------------------------------------------------------------- */

export function Takvim() {
  const { haftalar, kurallar, bugun, yukleniyor } = usePlanVerisi();
  const [gorunum, setGorunum] = useState<Gorunum>("ay");
  const [secili, setSecili] = useState(bugun);
  const [seciliSlot, setSeciliSlot] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(() => new Date());

  const kuralSeti = useMemo(() => kuralSetiTamamla(kurallar), [kurallar]);

  useEffect(() => {
    const t = window.setInterval(() => setSimdi(new Date()), 60000);
    return () => window.clearInterval(t);
  }, []);

  /** Görünen aralık — hem Todoist sorgusu hem ay ızgarası bunu kullanır. */
  const { bas, son, ayAnahtari } = useMemo(() => {
    if (gorunum === "gun") return { bas: secili, son: secili, ayAnahtari: secili.slice(0, 7) };
    if (gorunum === "hafta") {
      const p = haftaninPazartesisi(secili);
      return { bas: p, son: gunEkle(p, 6), ayAnahtari: secili.slice(0, 7) };
    }
    const ilk = `${secili.slice(0, 7)}-01`;
    const basla = haftaninPazartesisi(ilk);
    return { bas: basla, son: gunEkle(basla, 41), ayAnahtari: secili.slice(0, 7) };
  }, [gorunum, secili]);

  // Todoist süzgeci uç değerleri dışlar; bir gün pay bırakılıyor.
  const td = useTodoistAralik(gunEkle(bas, -1), gunEkle(son, 1), bugun);

  const surukle = useSurukle<TodoistGorev>(
    useCallback((g: TodoistGorev, iso: string) => void td.tarihiDegistir(g, iso), [td]),
  );

  const yil = Number(ayAnahtari.slice(0, 4));
  const ayNo = Number(ayAnahtari.slice(5, 7));
  const tk = useMemo(() => takvim(haftalar, yil, ayNo), [haftalar, yil, ayNo]);

  const gunHaritasi = useMemo(() => {
    const m = new Map<string, GunKaydi>();
    for (const h of haftalar) {
      for (const g of h.veri.gunler) {
        if (g.isoTarih) m.set(g.isoTarih, { kod: h.kod, gunNo: g.no, veri: h.veri });
      }
    }
    return m;
  }, [haftalar]);

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Takvim" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
  const seciliKayit = gunHaritasi.get(secili) ?? null;

  const kaydir = (yon: number) => {
    if (gorunum === "gun") setSecili(gunEkle(secili, yon));
    else if (gorunum === "hafta") setSecili(gunEkle(secili, yon * 7));
    else setSecili(gunEkle(`${secili.slice(0, 7)}-01`, yon > 0 ? 32 : -1).slice(0, 7) + "-01");
  };

  const baslikMetni =
    gorunum === "gun"
      ? `${Number(secili.slice(8, 10))} ${AY_TAM[Number(secili.slice(5, 7)) - 1]} ${secili.slice(0, 4)} · ${GUN_ADLARI[haftaninGunu(secili)]}`
      : gorunum === "hafta"
        ? `${Number(bas.slice(8, 10))} ${AY_TAM[Number(bas.slice(5, 7)) - 1]} – ${Number(son.slice(8, 10))} ${AY_TAM[Number(son.slice(5, 7)) - 1]}`
        : `${AY_TAM[ayNo - 1]} ${yil}`;

  return (
    <>
      <EkranBasi
        baslik="Takvim"
        altyazi="Plan ve görevler bir arada. Geçmişin dökümü Arşiv'de."
        sag={
          <div className={s.gez}>
            <div className={s.gorunumler}>
              {(["ay", "hafta", "gun"] as Gorunum[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={
                    g === gorunum ? `${s.gorunumDugme} ${s.gorunumSecili}` : s.gorunumDugme
                  }
                  onClick={() => setGorunum(g)}
                >
                  {g === "gun" ? "gün" : g}
                </button>
              ))}
            </div>
            <Kisayollar
              grup="Takvim"
              liste={[
                { tus: "ArrowLeft", aciklama: `Önceki ${gorunum === "gun" ? "gün" : gorunum}`, eylem: () => kaydir(-1) },
                { tus: "ArrowRight", aciklama: `Sonraki ${gorunum === "gun" ? "gün" : gorunum}`, eylem: () => kaydir(1) },
                { tus: "t", aciklama: "Bugüne dön", eylem: secili !== bugun ? () => setSecili(bugun) : null },
              ]}
            />
            <Dugme
              tur="sade"
              ikon={<ChevronLeft size={16} />}
              onClick={() => kaydir(-1)}
              aria-label="Önceki"
            />
            <span style={{ minWidth: 150, textAlign: "center" }}>{baslikMetni}</span>
            <Dugme
              tur="sade"
              ikon={<ChevronRight size={16} />}
              onClick={() => kaydir(1)}
              aria-label="Sonraki"
            />
            {secili !== bugun && (
              <Dugme tur="sade" onClick={() => setSecili(bugun)}>
                bugün
              </Dugme>
            )}
            <Dugme
              tur="sade"
              ikon={<RefreshCw size={15} />}
              onClick={() => void td.tazele()}
              title="Görevleri yenile"
              aria-label="Görevleri yenile"
            />
          </div>
        }
      />

      {/* Görevler gelmediyse boş gün "görev yok" sanılmasın. */}
      {td.hata && (
        <p className={s.todoistHata}>
          Todoist'e ulaşılamadı — görevler gösterilmiyor. ({td.hata})
        </p>
      )}

      {td.gecikmisler.length > 0 && (
        <GecikmisSerit
          gorevler={td.gecikmisler}
          onKapat={td.kapat}
          onBugune={(g) => void td.tarihiDegistir(g, bugun)}
          surukle={surukle}
        />
      )}

      <div className={`${s.duzen} ${s.duzenPanelli}`}>
        <Kart dolgulu={false}>
          {gorunum === "ay" && (
            <AyIzgarasi
              bas={bas}
              ay={ayAnahtari}
              bugun={bugun}
              secili={secili}
              tk={tk}
              gunHaritasi={gunHaritasi}
              kurallar={kuralSeti}
              gorevler={td.gunlere}
              surukle={surukle}
              onSec={setSecili}
              onGunGorunumu={(iso) => {
                setSecili(iso);
                setGorunum("gun");
              }}
            />
          )}

          {gorunum === "hafta" && (
            <HaftaEkseni
              bas={bas}
              bugun={bugun}
              secili={secili}
              simdiDk={simdiDk}
              gunHaritasi={gunHaritasi}
              kurallar={kuralSeti}
              gorevler={td.gunlere}
              surukle={surukle}
              onSec={setSecili}
              seciliSlot={seciliSlot}
              onSlotSec={setSeciliSlot}
              onKapat={td.kapat}
            />
          )}

          {gorunum === "gun" && (
            <GunEkseni
              iso={secili}
              bugun={bugun}
              simdiDk={simdiDk}
              kayit={seciliKayit}
              kurallar={kuralSeti}
              gorevler={td.gunlere.get(secili) ?? []}
              surukle={surukle}
              seciliSlot={seciliSlot}
              onSlotSec={setSeciliSlot}
              onKapat={td.kapat}
            />
          )}
        </Kart>

        {seciliKayit ? (
          <GunPaneliDosyali
            kod={seciliKayit.kod}
            gunNo={seciliKayit.gunNo}
            iso={secili}
            kurallar={kuralSeti}
            gorevler={td.gunlere.get(secili) ?? []}
            onGorevKapat={td.kapat}
            onGorevEkle={td.ekle}
            surukle={surukle}
          />
        ) : (
          <GunPaneliPlansiz
            iso={secili}
            gorevler={td.gunlere.get(secili) ?? []}
            onGorevKapat={td.kapat}
            onGorevEkle={td.ekle}
            surukle={surukle}
          />
        )}
      </div>
    </>
  );
}

/**
 * Gecikmiş görevler. Aralık sorgusundan bağımsız gelir: eylülü görüntülerken
 * ağustostan kalan görev de burada durur, yoksa hiç görünmezdi.
 *
 * Yığın suçluluk üretmesin diye tek satır: ya tamamlanır, ya bugüne alınır, ya
 * da bir güne sürüklenir.
 */
function GecikmisSerit({
  gorevler,
  onKapat,
  onBugune,
  surukle,
}: {
  gorevler: TodoistGorev[];
  onKapat: (g: TodoistGorev) => Promise<void>;
  onBugune: (g: TodoistGorev) => void;
  surukle: Surukle;
}) {
  return (
    <div className={s.gecikmis}>
      <span className={s.gecikmisBas}>
        <History size={15} strokeWidth={2} />
        {gorevler.length} gecikmiş
      </span>
      <div className={s.gecikmisListe}>
        {gorevler.map((g) => (
          <span key={g.id} className={s.gecikmisOge}>
            <GorevCipi gorev={g} onKapat={() => void onKapat(g)} surukle={surukle} />
            <button
              type="button"
              className={s.gecikmisBugune}
              onClick={() => onBugune(g)}
              title={`${g.icerik} — bugüne al`}
              disabled={g.tekrarli}
            >
              bugüne
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* --- ay ızgarası --------------------------------------------------------- */

function AyIzgarasi({
  bas,
  ay,
  bugun,
  secili,
  tk,
  gunHaritasi,
  kurallar,
  gorevler,
  surukle,
  onSec,
  onGunGorunumu,
}: {
  bas: string;
  ay: string;
  bugun: string;
  secili: string;
  tk: ReturnType<typeof takvim>;
  gunHaritasi: Map<string, GunKaydi>;
  kurallar: KuralSeti;
  gorevler: Map<string, TodoistGorev[]>;
  surukle: Surukle;
  onSec: (iso: string) => void;
  onGunGorunumu: (iso: string) => void;
}) {
  const korumaliAlanlar = kurallar.korumaliAlanlar ?? [];

  return (
    <>
      <div className={s.baslikSatiri}>
        {GUN_KISA.map((g) => (
          <span key={g} className={s.baslikGun}>
            {g}
          </span>
        ))}
      </div>

      <div className={s.izgara}>
        {Array.from({ length: 42 }, (_, i) => {
          const iso = gunEkle(bas, i);
          if (iso.slice(0, 7) !== ay) return <div key={iso} className={`${s.hucre} ${s.hucreDisi}`} />;

          const kayit = gunHaritasi.get(iso);
          const gun = tk.gunler[iso] as
            | { slotlar?: { id: string; saat: string; alan: string; konu: string; durum: string }[] }
            | undefined;
          const slotlar = gun?.slotlar ?? [];
          const gunGorevleri = gorevler.get(iso) ?? [];
          const gecmis = iso < bugun;
          const yapilan = slotlar.filter((x) => x.durum === "yapildi").length;
          const planli = slotlar.filter((x) => x.durum !== "tasindi").length;
          const tip = kayit ? gunTipi(kayit.gunNo, kayit.veri.ofisGunleri ?? []) : null;
          const korumali =
            kayit !== undefined && korumaliAlanlar.some((k) => k.gunler.includes(kayit.gunNo));
          const kota = kayit?.veri.sosyalKota ?? {};
          const bos = slotlar.filter((x) => x.durum !== "tasindi" && x.alan !== "Kapanış").length === 0;
          const kotaBos =
            kayit !== undefined && (kayit.gunNo >= 6 ? kota.haftaSonu !== true : kota.haftaIci !== true);

          return (
            <button
              key={iso}
              type="button"
              className={[
                s.hucre,
                iso === bugun && s.hucreBugun,
                iso === secili && s.hucreSecili,
                gecmis && s.hucreGecmis,
                hedefSinifi(iso, surukle),
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSec(iso)}
              onDoubleClick={() => onGunGorunumu(iso)}
              {...hedefOzellikleri(iso, surukle)}
            >
              <span className={s.hucreBas}>
                <span className={s.gunNo}>{Number(iso.slice(8, 10))}</span>
                {tip && (
                  <span className={tip === "ofis" ? `${s.gunTipi} ${s.tipOfis}` : s.gunTipi}>
                    {TIP_ADI[tip]}
                  </span>
                )}
                {korumali && (
                  <span className={s.korumaliIsaret} title="16:00 sonrası korumalı">
                    ⌾
                  </span>
                )}
              </span>

              <span className={s.alanlar}>
                {slotlar
                  .filter((x) => x.durum !== "tasindi")
                  .slice(0, 3)
                  .map((x) => (
                    <span
                      key={x.id}
                      className={[
                        s.alanRozet,
                        x.durum === "yapildi" && s.alanRozetYapildi,
                        x.durum === "kacti" && s.alanRozetKacti,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={`${x.saat} · ${x.alan} — ${x.konu}`}
                    >
                      {kisaltAlan(x.alan)}
                    </span>
                  ))}
                {gunGorevleri.slice(0, 2).map((g) => (
                  <span
                    key={g.id}
                    className={g.tekrarli ? `${s.gorevRozet} ${s.gorevRozetTekrarli}` : s.gorevRozet}
                    title={g.tekrarli ? `${g.icerik} — ${SURUKLENMEZ}` : `${g.icerik} — başka güne sürükleyebilirsin`}
                    {...gorevKaynagi(g, surukle)}
                  >
                    {g.icerik}
                  </span>
                ))}
                {gunGorevleri.length > 2 && (
                  <span className={s.gorevRozet}>+{gunGorevleri.length - 2}</span>
                )}
              </span>

              <span className={s.hucreDip}>
                {/* Oran yalnızca geçmiş günlerde, küçük punto. */}
                {gecmis && planli > 0 && (
                  <span>
                    {yapilan}/{planli}
                  </span>
                )}
                {!gecmis && bos && kotaBos && kayit && <span className={s.bosluk}>kota boş</span>}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* --- hafta ekseni -------------------------------------------------------- */

function HaftaEkseni({
  bas,
  bugun,
  secili,
  simdiDk,
  gunHaritasi,
  kurallar,
  gorevler,
  surukle,
  onSec,
  seciliSlot,
  onSlotSec,
  onKapat,
}: {
  bas: string;
  bugun: string;
  secili: string;
  simdiDk: number;
  gunHaritasi: Map<string, GunKaydi>;
  kurallar: KuralSeti;
  gorevler: Map<string, TodoistGorev[]>;
  surukle: Surukle;
  onSec: (iso: string) => void;
  seciliSlot: string | null;
  onSlotSec: (id: string | null) => void;
  onKapat: (g: TodoistGorev) => Promise<void>;
}) {
  const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(bas, i));
  const sutunlar = `52px repeat(7, minmax(0, 1fr))`;

  return (
    <>
      <div className={s.haftaBaslik} style={{ gridTemplateColumns: sutunlar }}>
        <span className={s.haftaBaslikBos} />
        {gunler.map((iso) => (
          <button
            key={iso}
            type="button"
            className={iso === secili ? `${s.haftaGun} ${s.haftaGunSecili}` : s.haftaGun}
            onClick={() => onSec(iso)}
          >
            <span className={s.haftaGunAd}>{GUN_KISA[haftaninGunu(iso)]}</span>
            <span className={iso === bugun ? `${s.haftaGunNo} ${s.haftaGunBugun}` : s.haftaGunNo}>
              {Number(iso.slice(8, 10))}
            </span>
          </button>
        ))}
      </div>

      {/* Saatsiz görevler eksene konamaz; üstte gün boyu şeridinde durur. */}
      <div className={s.gunBoyu} style={{ gridTemplateColumns: sutunlar }}>
        <span className={s.gunBoyuEtiket}>gün boyu</span>
        <div
          className={s.gunBoyuSutunlar}
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridColumn: "2 / -1" }}
        >
          {gunler.map((iso) => (
            <div
              key={iso}
              className={[s.gunBoyuHucre, hedefSinifi(iso, surukle)].filter(Boolean).join(" ")}
              {...hedefOzellikleri(iso, surukle)}
            >
              {(gorevler.get(iso) ?? [])
                .filter((g) => gorevSaati(g) === null)
                .map((g) => (
                  <GorevCipi
                    key={g.id}
                    gorev={g}
                    onKapat={() => void onKapat(g)}
                    surukle={surukle}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      <div
        className={s.haftaEksen}
        style={{ gridTemplateColumns: sutunlar, height: EKSEN_YUKSEKLIK + 24 }}
      >
        <SaatSutunu />
        {gunler.map((iso) => (
          <EksenSutunu
            key={iso}
            iso={iso}
            kayit={gunHaritasi.get(iso) ?? null}
            kurallar={kurallar}
            gorevler={gorevler.get(iso) ?? []}
            bugunMu={iso === bugun}
            simdiDk={simdiDk}
            dar
            seciliSlot={seciliSlot}
            onSlotSec={onSlotSec}
            surukle={surukle}
          />
        ))}
      </div>
    </>
  );
}

/* --- gün ekseni ---------------------------------------------------------- */

function GunEkseni({
  iso,
  bugun,
  simdiDk,
  kayit,
  kurallar,
  gorevler,
  surukle,
  seciliSlot,
  onSlotSec,
  onKapat,
}: {
  iso: string;
  bugun: string;
  simdiDk: number;
  kayit: GunKaydi | null;
  kurallar: KuralSeti;
  gorevler: TodoistGorev[];
  surukle: Surukle;
  seciliSlot: string | null;
  onSlotSec: (id: string | null) => void;
  onKapat: (g: TodoistGorev) => Promise<void>;
}) {
  const seanslar = (kayit?.veri.seanslar ?? []).filter(
    (x) => (x.baslangic ?? "").slice(0, 10) === iso,
  );
  const gunBoyu = gorevler.filter((g) => gorevSaati(g) === null);

  return (
    <>
      <div className={s.sutunBasi}>
        <span className={s.sutunBasiPlan}>plan ve görevler</span>
        <span className={s.sutunBasiOlcum}>ölçülen</span>
      </div>

      {gunBoyu.length > 0 && (
        <div className={s.gunBoyu}>
          <span className={s.gunBoyuEtiket}>gün boyu</span>
          <div className={s.gunBoyuIcerik}>
            {gunBoyu.map((g) => (
              <GorevCipi key={g.id} gorev={g} onKapat={() => void onKapat(g)} surukle={surukle} />
            ))}
          </div>
        </div>
      )}

      <div className={s.eksen} style={{ height: EKSEN_YUKSEKLIK + 24 }}>
        <SaatSutunu />
        <EksenSutunu
          iso={iso}
          kayit={kayit}
          kurallar={kurallar}
          gorevler={gorevler}
          bugunMu={iso === bugun}
          simdiDk={simdiDk}
          dar={false}
          seciliSlot={seciliSlot}
          onSlotSec={onSlotSec}
          surukle={surukle}
        />

        {/* Ölçülen seanslar ayrı sütunda: plan ile gerçek yan yana durur. */}
        <div className={s.seansSutunu} style={{ height: EKSEN_YUKSEKLIK }}>
          {seanslar.map((x) => {
            const t = (x.baslangic ?? "").slice(11, 16) || "00:00";
            return (
              <div key={x.id}>
                <div
                  className={s.seansBlok}
                  style={{
                    top: yerDk(dakika(t)),
                    height: Math.max(3, ((x.sureDk ?? 0) / 60) * SAAT_YUKSEKLIK),
                  }}
                  title={`${t} · ${x.sureDk} dk`}
                />
                <span className={s.seansEtiket} style={{ top: yerDk(dakika(t)) }}>
                  {x.sureDk} dk
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* --- gün paneli ---------------------------------------------------------- */

/**
 * Günün görevleri ve yeni görev satırı. Görev Inbox'a gider: `Gelişim Planı`
 * slotların projesi, kişisel görev oraya yazılmaz.
 */
function GorevBolumu({
  iso,
  gorevler,
  onKapat,
  onEkle,
  surukle,
}: {
  iso: string;
  gorevler: TodoistGorev[];
  onKapat: (g: TodoistGorev) => Promise<void>;
  onEkle: (iso: string, icerik: string, saat?: string | null) => Promise<boolean>;
  surukle: Surukle;
}) {
  return (
    <>
      <p className={s.panelBolum}>Görevler</p>
      {gorevler.length === 0 && <p className={s.aciklama}>Bu güne görev yok.</p>}
      {gorevler.map((g) => (
        <div key={g.id} className={s.panelGorev} {...gorevKaynagi(g, surukle)}>
          <button
            type="button"
            className={s.gorevKutucuk}
            onClick={() => void onKapat(g)}
            title="Tamamla"
            aria-label={`${g.icerik} görevini tamamla`}
          />
          <span className={s.panelGorevAd}>{g.icerik}</span>
          {gorevSaati(g) && <span className={s.aciklama}>{gorevSaati(g)}</span>}
        </div>
      ))}
      <GorevEkle iso={iso} onEkle={onEkle} />
    </>
  );
}

function GorevEkle({
  iso,
  onEkle,
}: {
  iso: string;
  onEkle: (iso: string, icerik: string, saat?: string | null) => Promise<boolean>;
}) {
  const [metin, setMetin] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // Saat metnin içinden çıkar: dar panelde ayrı bir saat kutusu hem yer yiyor
  // hem de tarayıcının kendi çizimiyle geliyordu.
  const { icerik, saat } = saatAyikla(metin);

  const gonder = async (e: FormEvent) => {
    e.preventDefault();
    if (!icerik || gonderiliyor) return;
    setGonderiliyor(true);
    // Eklenemediyse yazılan metin kaybolmasın; hata üstte gösteriliyor.
    if (await onEkle(iso, icerik, saat)) setMetin("");
    setGonderiliyor(false);
  };

  return (
    <form className={s.gorevEkle} onSubmit={(e) => void gonder(e)}>
      <Giris
        placeholder="Yeni görev"
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        aria-label="Yeni görev"
      />
      <Dugme type="submit" tur="dolu" disabled={!icerik || gonderiliyor}>
        Ekle
      </Dugme>
      {/* Ayrıştırmanın sonucu görünür olsun: sihir görünmezse güvenilmez. */}
      <p className={saat ? `${s.gorevEkleNot} ${s.gorevEkleNotSaat}` : s.gorevEkleNot}>
        {saat ? `${icerik} — ${saat}` : "Sona saat yazarsan (18:00) o saate konur, yazmazsan gün boyu."}
      </p>
    </form>
  );
}

/** Haftası kurulmamış gün: görevleri var, planı yok. Hata değil. */
function GunPaneliPlansiz({
  iso,
  gorevler,
  onGorevKapat,
  onGorevEkle,
  surukle,
}: {
  iso: string;
  gorevler: TodoistGorev[];
  onGorevKapat: (g: TodoistGorev) => Promise<void>;
  onGorevEkle: (iso: string, icerik: string, saat?: string | null) => Promise<boolean>;
  surukle: Surukle;
}) {
  return (
    <aside className={s.panel}>
      <div className={s.panelBas}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className={s.panelUst}>{GUN_ADLARI[haftaninGunu(iso)]}</p>
          <h2 className={s.panelBaslik}>
            {Number(iso.slice(8, 10))} {AY_TAM[Number(iso.slice(5, 7)) - 1]}
          </h2>
        </div>
      </div>

      <GorevBolumu
        iso={iso}
        gorevler={gorevler}
        onKapat={onGorevKapat}
        onEkle={onGorevEkle}
        surukle={surukle}
      />

      <p className={s.panelBolum}>Plan</p>
      <p className={s.aciklama}>
        Bu haftanın planı henüz kurulmamış. Slot eklemek için önce hafta kurulur.
      </p>
    </aside>
  );
}

function GunPaneliDosyali({
  kod,
  gunNo,
  iso,
  kurallar,
  gorevler,
  onGorevKapat,
  onGorevEkle,
  surukle,
}: {
  kod: string;
  gunNo: number;
  iso: string;
  kurallar: KuralSeti;
  gorevler: TodoistGorev[];
  onGorevKapat: (g: TodoistGorev) => Promise<void>;
  onGorevEkle: (iso: string, icerik: string, saat?: string | null) => Promise<boolean>;
  surukle: Surukle;
}) {
  const { veri, yukleniyor, yaz } = useDosya<HaftaTipi>(`${kod}.json`);
  const [rapor, setRapor] = useState<BosaltRaporu | null>(null);

  if (yukleniyor || !veri) {
    return (
      <aside className={s.panel}>
        <Yuklenirken satir={2} />
      </aside>
    );
  }

  const gun = veri.gunler.find((g) => g.no === gunNo);
  const slotlar = gununSlotlari(veri, gunNo);
  const tip = gunTipi(gunNo, veri.ofisGunleri ?? []);

  const slotEkle = () => {
    const sonuncu = slotlar[slotlar.length - 1];
    const saat = sonuncu
      ? `${String(
          Math.min(22, Math.floor((dakika(sonuncu.saat) + sonuncu.sureDk + 15) / 60)),
        ).padStart(2, "0")}:00`
      : tip === "haftaSonu"
        ? "09:30"
        : "19:00";
    const id = yeniSlotId(veri, gunNo, saat);
    const yeni: Slot = {
      id,
      gun: gunNo,
      saat,
      sureDk: 60,
      alan: kurallar.alanlar?.[0] ?? "Serbest",
      konu: "",
      durum: "planli",
    };
    void yaz({
      ...veri,
      slotlar: [...veri.slotlar, yeni],
      kullanilmisIdler: [...(veri.kullanilmisIdler ?? []), id],
    });
    setRapor(null);
  };

  const bosalt = () => {
    const { hafta, rapor: r } = gunBosalt(
      veri,
      kurallar,
      gunNo,
      gunNo >= 6 ? "haftaSonu" : "haftaIci",
    );
    setRapor(r);
    void yaz(hafta);
  };

  return (
    <aside className={s.panel}>
      <div className={s.panelBas}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className={s.panelUst}>
            {gun?.ad} · {TIP_ADI[tip]}
          </p>
          <h2 className={s.panelBaslik}>{gun?.tarih ?? iso}</h2>
        </div>
      </div>

      <GorevBolumu
        iso={iso}
        gorevler={gorevler}
        onKapat={onGorevKapat}
        onEkle={onGorevEkle}
        surukle={surukle}
      />

      <p className={s.panelBolum}>Plan</p>
      {slotlar.length === 0 ? (
        <p className={s.aciklama}>Bu güne slot konmamış.</p>
      ) : (
        slotlar.map((x) => (
          <div key={x.id} className={s.panelSlot}>
            <span className={s.panelSlotSaat}>{x.saat}</span>
            <span className={s.panelSlotAd}>
              {x.alan}
              {x.konu ? ` — ${x.konu}` : ""}
            </span>
            <Etiket tur={x.durum === "yapildi" ? "iyi" : x.durum === "kacti" ? "hata" : "sade"}>
              {x.durum}
            </Etiket>
          </div>
        ))
      )}

      {rapor && (
        <div className={s.rapor}>
          {rapor.not ?? `${rapor.tasinan} slot taşındı, ${rapor.dusen} düştü.`}
          {rapor.hedefler.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>
      )}

      <div className={s.panelDip}>
        <Dugme ikon={<Plus size={15} />} onClick={slotEkle}>
          Slot ekle
        </Dugme>
        <Dugme
          tur="cizgili"
          ikon={<CalendarOff size={15} />}
          onClick={bosalt}
          disabled={slotlar.filter((x) => x.durum === "planli").length === 0}
        >
          Günü boşalt (buluşma)
        </Dugme>
        <p className={s.aciklama}>
          Slot taşınır, sıkıştırılmaz. Hafta sonuna sığmayan düşer ve ⊘ olarak kalır.
        </p>
      </div>
    </aside>
  );
}
