import { ArrowRight, CalendarOff, Check, ChevronLeft, ChevronRight, Plus, RefreshCw, X } from "lucide-react";
import type { Uygulama } from "@ortak/bot";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AY_TAM, GUN_ADLARI, GUN_KISA, gunEkle, haftaninGunu } from "@ortak/gun";
import type { Hafta as HaftaTipi, Slot } from "@ortak/plan";
import { takvim } from "@ortak/ozet";
import { dakika, gununSlotlari, kuralSetiTamamla, type KuralSeti } from "@ortak/kural";
import { gunBosalt, gunTipi, slotEkle, slotuYerlestir, type BosaltRaporu } from "@ortak/plan-islem";
import type { TaskList } from "@ortak/task";
import type { TodoistGorev } from "@ortak/tipler";
import { Kisayollar } from "@/ui/Kisayollar";
import { Dugme, EkranBasi, Kart, Yuklenirken } from "@/ui/bilesenler";
import { SlotPaneli } from "@/ui/SlotPaneli";
import {
  hedefOzellikleri,
  hedefSinifi,
  kaynakOzellikleri,
  useSurukle,
  type SurukleDurumu,
} from "@/ui/surukle";
import { bildir } from "@/ui/toast";
import { dosyayiGuncelle } from "@/veri/guncelle";
import { useDosya } from "@/veri/kanca";
import { usePlanVerisi } from "@/veri/plan";
import { gorevSaati, useTodoistAralik } from "@/veri/todoist";
import { useTaskComposerTarget, type NewTaskInput, type TaskComposerTarget } from "@/veri/task-create";
import { Composer } from "@/ui/gorev/Composer";
import { TaskPanel } from "@/ui/gorev/TaskPanel";
import { useTaskBoard } from "@/veri/task-board";
import {
  birakmayiCoz,
  dakikaMetni,
  gunBoyuAnahtari,
  saateOtur,
  sinirla,
  type EksenOlcusu,
} from "@ortak/gorev-zaman";
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

const TIP_ADI: Record<string, string> = { ofis: "ofis", ev: "ev" };
/** Dar hücrede etiket kısalınca ipucu olarak tam adı. */
const TIP_TAM: Record<string, string> = { ofis: "ofis günü", ev: "evden çalışma", haftaSonu: "hafta sonu" };

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

/* --- slot düzenleme (eksende) --------------------------------------------- */

/** Sürükleme ve boyutlandırma 15 dakikalık adımlarla. */
const ADIM_DK = 15;

const saatMetni = dakikaMetni;

/** Eksenin ölçüsü — piksel/dakika çevrimi @ortak/gorev-zaman'da. */
const EKSEN_OLCU: EksenOlcusu = {
  ilkSaat: ILK_SAAT,
  sonSaat: SON_SAAT,
  saatYuksekligi: SAAT_YUKSEKLIK,
  adimDk: ADIM_DK,
};

/** Sürüklenen slotun o anki hayali yeri. */
interface Tasima {
  id: string;
  kod: string;
  tur: "tasi" | "boyut";
  iso: string;
  basDk: number;
  sureDk: number;
  /** Hedef gün aynı hafta dosyasında mı; değilse bırakılamaz. */
  gecerli: boolean;
}

/** Eksen sütunlarının düzenleme için ekrandan aldığı olanaklar. */
interface EksenDuzeni {
  tasima: Tasima | null;
  baslat: (e: ReactPointerEvent, x: Slot, kayit: GunKaydi, iso: string, tur: Tasima["tur"]) => void;
  /** Boş yere çift tıklanınca o saate slot. */
  ekle: (kayit: GunKaydi, iso: string, dk?: number) => void;
}

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

/**
 * Opens a task's detail panel (issue #52). Clicking a task on the calendar
 * used to complete it, which is how tasks got completed by accident (#44);
 * completing is now the panel's (or the day list's circle's) job.
 */
const GorevAc = createContext<(g: TodoistGorev) => void>(() => undefined);

function GorevCipi({ gorev, surukle }: { gorev: TodoistGorev; surukle: Surukle }) {
  const saat = gorevSaati(gorev);
  const ac = useContext(GorevAc);
  const ipucu = gorev.tekrarli ? `ayrıntı için tıkla — ${SURUKLENMEZ}` : "ayrıntı için tıkla, taşımak için sürükle";
  return (
    <button
      type="button"
      className={gorev.tekrarli ? `${s.gorevCip} ${s.gorevCipTekrarli}` : s.gorevCip}
      onClick={() => ac(gorev)}
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
  duzen,
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
  duzen: EksenDuzeni;
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

  const gorevAc = useContext(GorevAc);
  const saatliGorevler = gorevler.filter((g) => gorevSaati(g) !== null);

  // Sürüklenen görevin düşeceği dakika. Bırakmadan önce görünsün: 15 dakikalık
  // adımla körlemesine bırakmak kullanılabilir değil.
  const [onizleme, setOnizleme] = useState<number | null>(null);
  const dakikayaCevir = (e: { clientY: number; currentTarget: Element }): number =>
    saateOtur(e.clientY - e.currentTarget.getBoundingClientRect().top, EKSEN_OLCU);

  return (
    <div
      className={[dar ? `${s.slotSutunu} ${s.haftaSutun}` : s.slotSutunu, hedefSinifi(iso, surukle)]
        .filter(Boolean)
        .join(" ")}
      style={{ height: EKSEN_YUKSEKLIK }}
      data-eksen-iso={iso}
      title={kayit ? "Çift tıkla: bu saate slot ekle" : undefined}
      onDoubleClick={(e) => {
        // Yalnızca boş yere: bloğa çift tıklamak onu açar, slot eklemez.
        if (!kayit || e.target !== e.currentTarget) return;
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
        const dk = Math.floor(((y / SAAT_YUKSEKLIK) * 60 + ILK_SAAT * 60) / 30) * 30;
        duzen.ekle(kayit, iso, sinirla(dk, ILK_SAAT * 60, SON_SAAT * 60 - 60));
      }}
      {...hedefOzellikleri(iso, surukle, undefined, {
        // Sütunun neresine bırakıldıysa o saat; anahtar sabit kalsa saat kaybolurdu.
        birakAnahtari: (e) => {
          setOnizleme(null);
          return `${iso}T${saatMetni(dakikayaCevir(e))}`;
        },
        gezinme: (e) => setOnizleme(dakikayaCevir(e)),
      })}
      onDragLeaveCapture={() => setOnizleme(null)}
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

      {onizleme !== null && (
        <div className={s.saatOnizleme} style={{ top: yerDk(onizleme) }}>
          <span className={s.saatOnizlemeEtiket}>{saatMetni(onizleme)}</span>
        </div>
      )}

      {slotlar.map((x) => {
        const t = duzen.tasima?.id === x.id ? duzen.tasima : null;
        // Boyutlandırırken blok yerinde uzar; taşırken yerinde soluk kalır, hayali hedefte çizilir.
        const sure = t?.tur === "boyut" ? t.sureDk : x.sureDk;
        const tasinabilir = Boolean(kayit) && x.durum !== "tasindi";
        return (
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
              tasinabilir && s.blokTasinabilir,
              t?.tur === "tasi" && s.blokKaynak,
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              top: yerDk(dakika(x.saat)),
              height: Math.max(20, (sure / 60) * SAAT_YUKSEKLIK - 3),
            }}
            onPointerDown={(e) => kayit && duzen.baslat(e, x, kayit, iso, "tasi")}
            // Fareyle seçim bırakma anında yapılıyor; burası yalnızca klavye (Enter/Boşluk).
            onClick={(e) => {
              if (e.detail === 0) onSlotSec(x.id === seciliSlot ? null : x.id);
            }}
            title={`${x.saat} · ${x.alan} — ${x.konu} · ${sure} dk${tasinabilir ? " — sürükle: taşı, alt kenar: süre" : ""}`}
          >
            <span className={s.blokBas}>{dar ? x.alan : `${x.saat} · ${x.alan}`}</span>
            {x.konu && !dar && <span className={s.blokAlt}>{x.konu}</span>}
            {t?.tur === "boyut" && <span className={s.blokSure}>{sure} dk</span>}
            {tasinabilir && (
              <span
                className={s.boyutTutamak}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (kayit) duzen.baslat(e, x, kayit, iso, "boyut");
                }}
              />
            )}
          </button>
        );
      })}

      {duzen.tasima?.tur === "tasi" && duzen.tasima.iso === iso && (
        <div
          className={duzen.tasima.gecerli ? `${s.blok} ${s.blokHayalet}` : `${s.blok} ${s.blokHayalet} ${s.blokGecersiz}`}
          style={{
            top: yerDk(duzen.tasima.basDk),
            height: Math.max(20, (duzen.tasima.sureDk / 60) * SAAT_YUKSEKLIK - 3),
          }}
        >
          <span className={s.blokBas}>
            {duzen.tasima.gecerli ? saatMetni(duzen.tasima.basDk) : "başka hafta"}
          </span>
        </div>
      )}

      {saatliGorevler.map((g) => (
        <div
          key={g.id}
          className={`${s.blok} ${s.gorevBlok}${dar ? ` ${s.blokKucuk}` : ""}`}
          style={{ top: yerDk(dakika(gorevSaati(g)!)), height: 24 }}
          title={`${gorevSaati(g)} · ${g.icerik} — ayrıntı için tıkla${g.tekrarli ? ` · ${SURUKLENMEZ}` : ""}`}
          onClick={() => gorevAc(g)}
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

/**
 * Eksen kendi kutusunda kayar; açılışta ve dönem değişince "şimdi"ye (bir
 * saat öncesiyle) ya da o günlerin ilk slotuna kaydırılır. Önceden 06:00'dan
 * başlıyordu, akşam slotları ekranın altında kalıyordu.
 */
function useEksenKaydirma(anahtar: string, hedefDk: number) {
  const kutu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = kutu.current;
    if (k) k.scrollTop = Math.max(0, yerDk(hedefDk) - 24);
    // Yalnızca dönem değişince; dakikada bir kayan "şimdi" kullanıcının kaydırmasını ezmesin.
  }, [anahtar]);
  return kutu;
}

/** Kaydırma hedefi: bugün görünüyorsa şimdiden bir saat önce, değilse ilk slot, o da yoksa 08:00. */
function kaydirmaHedefi(gunler: string[], bugun: string, simdiDk: number, gunHaritasi: Map<string, GunKaydi>): number {
  if (gunler.includes(bugun)) return Math.max(ILK_SAAT * 60, simdiDk - 60);
  const ilkler = gunler.flatMap((iso) => {
    const k = gunHaritasi.get(iso);
    return k ? gununSlotlari(k.veri, k.gunNo).map((x) => dakika(x.saat)) : [];
  });
  return ilkler.length ? Math.max(ILK_SAAT * 60, Math.min(...ilkler) - 30) : 8 * 60;
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
  const { haftalar, kurallar, bugun, yukleniyor, tazele } = usePlanVerisi();
  const [gorunum, setGorunum] = useState<Gorunum>("ay");
  const [secili, setSecili] = useState(bugun);
  const [seciliSlot, setSeciliSlot] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(() => new Date());
  const [tasima, setTasima] = useState<Tasima | null>(null);
  // Pencere dinleyicileri çizimden bağımsız; son hayali yeri buradan okur.
  const tasimaRef = useRef<Tasima | null>(null);
  /** Eksen her yazdığında artar; gün paneli dosyasını izleyiciyi beklemeden yeniden okur. */
  const [yazim, setYazim] = useState(0);

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
  const td = useTodoistAralik(gunEkle(bas, -1), gunEkle(son, 1));
  // The task detail panel (issue #52): the same panel as Yapılacaklar, on the right.
  const pano = useTaskBoard();
  const [acikGorev, setAcikGorev] = useState<string | null>(null);
  const gorevAc = useCallback((g: TodoistGorev) => setAcikGorev(`${g.source === "local" ? "local" : "todoist"}:${g.id}`), []);
  const acikTask = acikGorev ? pano.tasks.find((t) => t.key === acikGorev) ?? null : null;
  const gorevHedefi = useTaskComposerTarget();
  const { tazele: tdTazele } = td;
  const ekleHost = useMemo(
    () => ({
      ...gorevHedefi,
      createTask: async (list: TaskList, input: NewTaskInput) => {
        const ok = await gorevHedefi.createTask(list, input);
        if (ok) void tdTazele();
        return ok;
      },
    }),
    [gorevHedefi, tdTazele],
  );

  // Anahtar hedefe göre değişiyor: "gün", "günTsaat" ya da "gün#gunboyu".
  // Ay hücresi günü değiştirir ve saati korur; eksen saat verir; gün boyu
  // şeridi saati siler.
  const surukle = useSurukle<TodoistGorev>(
    useCallback(
      (g: TodoistGorev, anahtar: string) => {
        const b = birakmayiCoz(anahtar);
        if (b) void td.tarihiDegistir(g, b.iso, b.saat);
      },
      [td],
    ),
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

  /**
   * Eksenden gelen değişiklik: dosya damgalı güncellenir, sonra plan hemen
   * yeniden okunur (izleyicinin haberini beklemeden). Reddedilen taşıma ve
   * kural uyarısı bildirimle söylenir.
   */
  const dosyaya = async (kod: string, f: (v: HaftaTipi) => Uygulama<HaftaTipi>): Promise<boolean> => {
    try {
      const u = await dosyayiGuncelle<HaftaTipi>(`${kod}.json`, (v) =>
        v ? f(v) : { tur: "reddet", sebep: `${kod}.json okunamadı` },
      );
      if (u.tur === "reddet") bildir({ metin: u.sebep, tur: "hata" });
      else if (u.tur === "eklendi" && u.not) bildir({ metin: u.not });
      return u.tur === "eklendi";
    } catch (e) {
      bildir({ metin: e instanceof Error ? e.message : String(e), tur: "hata" });
      return false;
    } finally {
      await tazele();
      setYazim((n) => n + 1);
    }
  };

  const slotuEkle = (kayit: GunKaydi, iso: string, dk?: number) => {
    let yeniId: string | null = null;
    void dosyaya(kayit.kod, (v) => {
      const r = slotEkle(v, kayit.gunNo, kuralSeti, dk === undefined ? undefined : saatMetni(dk));
      yeniId = r.id;
      return { tur: "eklendi", veri: r.hafta };
    }).then((ok) => {
      if (!ok || !yeniId) return;
      setSecili(iso);
      setSeciliSlot(yeniId);
    });
  };

  /**
   * Blokta fare basıldı. Kıpırdamadan bırakılırsa tıklamadır (seç); sürüklenirse
   * taşıma ya da boyutlandırma. Esc vazgeçer. Taşıma yalnızca aynı hafta
   * dosyasının günlerine: başka haftaya geçmek iki dosyayı birden yazmak olurdu.
   */
  const baslat = (e: ReactPointerEvent, x: Slot, kayit: GunKaydi, iso: string, tur: Tasima["tur"]) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const bas0 = dakika(x.saat);
    const sure0 = x.sureDk;
    const oynar = x.durum !== "tasindi";
    let oynadi = false;
    const ilk: Tasima = { id: x.id, kod: kayit.kod, tur, iso, basDk: bas0, sureDk: sure0, gecerli: true };

    const hareket = (ev: PointerEvent) => {
      if (!oynar) return;
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!oynadi && Math.hypot(dx, dy) < 4) return;
      oynadi = true;
      const adim = Math.round(((dy / SAAT_YUKSEKLIK) * 60) / ADIM_DK) * ADIM_DK;
      let t: Tasima;
      if (tur === "boyut") {
        t = { ...ilk, sureDk: sinirla(sure0 + adim, ADIM_DK, SON_SAAT * 60 - bas0) };
      } else {
        const el = document
          .elementsFromPoint(ev.clientX, ev.clientY)
          .find((n): n is HTMLElement => n instanceof HTMLElement && Boolean(n.dataset.eksenIso));
        const hedefIso = el?.dataset.eksenIso ?? tasimaRef.current?.iso ?? iso;
        t = {
          ...ilk,
          iso: hedefIso,
          basDk: sinirla(bas0 + adim, ILK_SAAT * 60, SON_SAAT * 60 - sure0),
          gecerli: gunHaritasi.get(hedefIso)?.kod === kayit.kod,
        };
      }
      tasimaRef.current = t;
      setTasima(t);
    };

    const bitir = (iptal: boolean) => {
      window.removeEventListener("pointermove", hareket);
      window.removeEventListener("pointerup", birak);
      window.removeEventListener("keydown", tus, true);
      const t = tasimaRef.current;
      tasimaRef.current = null;
      setTasima(null);
      if (iptal) return;
      if (!oynadi || !t) {
        setSecili(iso);
        setSeciliSlot((sec) => (sec === x.id ? null : x.id));
        return;
      }
      if (t.tur === "boyut") {
        if (t.sureDk === sure0) return;
        void dosyaya(kayit.kod, (v) => ({
          tur: "eklendi",
          veri: { ...v, slotlar: v.slotlar.map((y) => (y.id === x.id ? { ...y, sureDk: t.sureDk } : y)) },
        }));
        return;
      }
      if (!t.gecerli) {
        bildir({ metin: "Slot başka haftaya taşınamaz — o haftanın planı ayrı dosyada.", tur: "hata" });
        return;
      }
      const hedef = gunHaritasi.get(t.iso)!;
      void dosyaya(kayit.kod, (v) => {
        const r = slotuYerlestir(v, kuralSeti, x.id, hedef.gunNo, saatMetni(t.basDk));
        if (r.tasindi) return { tur: "eklendi", veri: r.hafta, ...(r.not ? { not: r.not } : {}) };
        return r.not ? { tur: "reddet", sebep: r.not } : { tur: "zatenVar" };
      });
      setSecili(t.iso);
      setSeciliSlot(x.id);
    };
    const birak = () => bitir(false);
    const tus = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      bitir(true);
    };
    window.addEventListener("pointermove", hareket);
    window.addEventListener("pointerup", birak);
    window.addEventListener("keydown", tus, true);
  };

  const duzen: EksenDuzeni = { tasima, baslat, ekle: slotuEkle };

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
        altyazi={
          gorunum === "ay"
            ? "Plan ve görevler bir arada. Geçmişin dökümü Arşiv'de."
            : "Slotu sürükle: taşı · alt kenarını çek: süre · boş yere çift tıkla: yeni slot"
        }
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
                { tus: "n", aciklama: "Seçili güne slot ekle", eylem: seciliKayit ? () => slotuEkle(seciliKayit, secili) : null },
                { tus: "Escape", aciklama: "Slot seçimini kaldır", eylem: seciliSlot ? () => setSeciliSlot(null) : null },
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

      {/* Anahtar yokken takvim hatasız ve görevsiz görünürdü; sebebi söylenmiyordu. */}
      {td.anahtarYok && !td.hata && (
        <p className={s.todoistHata}>
          Todoist anahtarı tanımlı değil — görevler gösterilmiyor. Ayarlar'dan anahtar
          dosyasını seç.
        </p>
      )}

      <GorevAc.Provider value={gorevAc}>
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
              duzen={duzen}
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
              duzen={duzen}
            />
          )}
        </Kart>

        {acikTask ? (
          // A completed or deleted task leaves the board: the day panel comes back by itself.
          <TaskPanel key={acikTask.key} task={acikTask} board={pano} onClose={() => setAcikGorev(null)} />
        ) : seciliKayit ? (
          <GunPaneliDosyali
            kod={seciliKayit.kod}
            gunNo={seciliKayit.gunNo}
            iso={secili}
            kurallar={kuralSeti}
            gorevler={td.gunlere.get(secili) ?? []}
            onGorevKapat={td.kapat}
            ekleHost={ekleHost}
            surukle={surukle}
            seciliSlot={seciliSlot}
            onSlotSec={setSeciliSlot}
            yazim={yazim}
          />
        ) : (
          <GunPaneliPlansiz
            iso={secili}
            gorevler={td.gunlere.get(secili) ?? []}
            onGorevKapat={td.kapat}
            ekleHost={ekleHost}
            surukle={surukle}
          />
        )}
      </div>
      </GorevAc.Provider>
    </>
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
                {/* Hafta sonu sütun başlığında zaten yazıyor; etiket yalnızca iş günlerini ayırır. */}
                {tip && tip !== "haftaSonu" && (
                  <span
                    className={tip === "ofis" ? `${s.gunTipi} ${s.tipOfis}` : s.gunTipi}
                    title={TIP_TAM[tip]}
                  >
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
  duzen,
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
  duzen: EksenDuzeni;
}) {
  const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(bas, i));
  const sutunlar = `52px repeat(7, minmax(0, 1fr))`;
  const kutu = useEksenKaydirma(bas, kaydirmaHedefi(gunler, bugun, simdiDk, gunHaritasi));

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
              {...hedefOzellikleri(iso, surukle, undefined, {
                // Gün boyu şeridine bırakmak "saati kaldır" demek.
                birakAnahtari: () => gunBoyuAnahtari(iso),
              })}
            >
              {(gorevler.get(iso) ?? [])
                .filter((g) => gorevSaati(g) === null)
                .map((g) => (
                  <GorevCipi
                    key={g.id}
                    gorev={g}
                    surukle={surukle}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      <div ref={kutu} className={s.eksenKaydir}>
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
              duzen={duzen}
            />
          ))}
        </div>
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
  duzen,
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
  duzen: EksenDuzeni;
}) {
  const kutu = useEksenKaydirma(
    iso,
    kaydirmaHedefi([iso], bugun, simdiDk, kayit ? new Map([[iso, kayit]]) : new Map()),
  );
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
              <GorevCipi key={g.id} gorev={g} surukle={surukle} />
            ))}
          </div>
        </div>
      )}

      <div ref={kutu} className={s.eksenKaydir}>
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
          duzen={duzen}
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
      </div>
    </>
  );
}

/* --- gün paneli ---------------------------------------------------------- */

/** Slot durumunun okunur adı; ham anahtar (`kacti`) arayüze çıkmaz. */
const DURUM_ADI: Record<string, string> = {
  planli: "Planlı",
  yapildi: "Yapıldı",
  kacti: "Kaçtı",
  tasindi: "Taşındı",
};

/** Başlık: büyük gün numarası, altında gün adı, ay ve gün tipi. */
function PanelBasi({ iso, tip, eylemler }: { iso: string; tip?: string; eylemler?: ReactNode }) {
  const alt = [AY_TAM[Number(iso.slice(5, 7)) - 1], tip && tip !== "haftaSonu" ? TIP_TAM[tip] : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={s.panelBas}>
      <span className={s.panelGunNo}>{Number(iso.slice(8, 10))}</span>
      <div className={s.panelBasMetin}>
        <h2 className={s.panelBaslik}>{GUN_ADLARI[haftaninGunu(iso)]}</h2>
        <p className={s.panelAlt}>{alt}</p>
      </div>
      {eylemler && <div className={s.panelEylemler}>{eylemler}</div>}
    </div>
  );
}

type GunOgesi =
  | { tur: "gorev"; saat: string | null; gorev: TodoistGorev }
  | { tur: "slot"; saat: string; slot: Slot };

/**
 * Günün tek listesi. Görev ile slot ayrı bölümde durunca "bugün ne var"
 * sorusu iki yerden okunuyordu: gün boyu görevler üstte, saatliler (görev ya
 * da slot) saat sırasıyla altta.
 */
function GunListesi({
  gorevler,
  slotlar,
  seciliSlot,
  onSlotSec,
  onKapat,
  surukle,
}: {
  gorevler: TodoistGorev[];
  slotlar: Slot[];
  seciliSlot?: string | null;
  onSlotSec?: (id: string | null) => void;
  onKapat: (g: TodoistGorev) => Promise<void>;
  surukle: Surukle;
}) {
  const gorevAc = useContext(GorevAc);
  const gunBoyu = gorevler.filter((g) => !gorevSaati(g));
  const saatli: GunOgesi[] = [
    ...gorevler
      .filter((g) => gorevSaati(g))
      .map((g): GunOgesi => ({ tur: "gorev", saat: gorevSaati(g), gorev: g })),
    ...slotlar.map((x): GunOgesi => ({ tur: "slot", saat: x.saat, slot: x })),
  ].sort((a, b) => (a.saat! < b.saat! ? -1 : a.saat! > b.saat! ? 1 : 0));

  if (gunBoyu.length === 0 && saatli.length === 0) {
    return <p className={s.aciklama}>Bu gün boş.</p>;
  }

  const gorevSatiri = (g: TodoistGorev, saat: string | null) => (
    <div key={g.id} className={s.gunSatir} {...gorevKaynagi(g, surukle)}>
      <span className={s.gunSatirSaat}>{saat}</span>
      <button
        type="button"
        className={s.gunKutucuk}
        onClick={() => void onKapat(g)}
        title="Tamamla"
        aria-label={`${g.icerik} görevini tamamla`}
      />
      <button type="button" className={s.gunSatirAc} onClick={() => gorevAc(g)} title="Ayrıntı">
        {g.icerik}
      </button>
    </div>
  );

  const slotSatiri = (x: Slot) => {
    const durum = DURUM_ADI[x.durum] ?? x.durum;
    return (
      <button
        key={x.id}
        type="button"
        className={[
          s.gunSatir,
          s.gunSlot,
          x.id === seciliSlot && s.gunSlotSecili,
          x.durum !== "planli" && s.gunSatirBitti,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onSlotSec?.(x.id === seciliSlot ? null : x.id)}
        title={`${x.saat} · ${x.sureDk} dk · ${durum}`}
      >
        <span className={s.gunSatirSaat}>{x.saat}</span>
        <span
          className={[
            s.gunCubuk,
            x.durum === "yapildi" && s.gunCubukIyi,
            x.durum === "kacti" && s.gunCubukHata,
            x.durum === "tasindi" && s.gunCubukSoluk,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <span className={s.gunSatirMetin}>
          <span className={s.gunSatirAd}>{x.alan}</span>
          {x.konu && <span className={s.gunSatirKonu}>{x.konu}</span>}
        </span>
        <span className={s.gunDurum} aria-label={durum}>
          {x.durum === "yapildi" && <Check size={14} className={s.gunDurumIyi} />}
          {x.durum === "kacti" && <X size={14} className={s.gunDurumHata} />}
          {x.durum === "tasindi" && <ArrowRight size={14} />}
        </span>
      </button>
    );
  };

  return (
    <div className={s.gunListe}>
      {gunBoyu.length > 0 && (
        <>
          <p className={s.panelBolum}>Gün boyu</p>
          {gunBoyu.map((g) => gorevSatiri(g, null))}
        </>
      )}
      {gunBoyu.length > 0 && saatli.length > 0 && <div className={s.gunAyrac} />}
      {saatli.map((o) => (o.tur === "slot" ? slotSatiri(o.slot) : gorevSatiri(o.gorev, o.saat)))}
    </div>
  );
}

/**
 * Listenin sonundaki ekleme satırı. Görev Inbox'a gider: `Gelişim Planı`
 * slotların projesi, kişisel görev oraya yazılmaz.
 */
/**
 * Adding a task on a day: the same box as Yapılacaklar (issue #45), with
 * the day already set. Any list, description, priority, important, time,
 * repeat and reminders; Inbox unless another list is picked.
 */
function GunaGorevEkle({ iso, host }: { iso: string; host: TaskComposerTarget & { inbox: TaskList | null } }) {
  const [acik, setAcik] = useState(false);
  // Another day picked: the box closes, so it never adds to the day left behind.
  useEffect(() => setAcik(false), [iso]);
  const liste = host.inbox ?? host.lists[0] ?? null;
  if (!liste) return null;
  return acik ? (
    <div className={s.gorevKutusu}>
      <Composer key={iso} list={liste} host={host} defaultDate={iso} onClose={() => setAcik(false)} />
    </div>
  ) : (
    <button type="button" className={s.gorevEkleAc} onClick={() => setAcik(true)}>
      <Plus size={15} />
      Görev ekle
    </button>
  );
}

/** Haftası kurulmamış gün: görevleri var, planı yok. Hata değil. */
function GunPaneliPlansiz({
  iso,
  gorevler,
  onGorevKapat,
  ekleHost,
  surukle,
}: {
  iso: string;
  gorevler: TodoistGorev[];
  onGorevKapat: (g: TodoistGorev) => Promise<void>;
  ekleHost: TaskComposerTarget & { inbox: TaskList | null };
  surukle: Surukle;
}) {
  return (
    <aside className={s.panel}>
      <PanelBasi iso={iso} />
      <GunListesi gorevler={gorevler} slotlar={[]} onKapat={onGorevKapat} surukle={surukle} />
      <GunaGorevEkle iso={iso} host={ekleHost} />
      <p className={s.aciklama}>Bu haftanın planı kurulmamış; slot eklemek için önce hafta kurulur.</p>
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
  ekleHost,
  surukle,
  seciliSlot,
  onSlotSec,
  yazim,
}: {
  kod: string;
  gunNo: number;
  iso: string;
  kurallar: KuralSeti;
  gorevler: TodoistGorev[];
  onGorevKapat: (g: TodoistGorev) => Promise<void>;
  ekleHost: TaskComposerTarget & { inbox: TaskList | null };
  surukle: Surukle;
  seciliSlot: string | null;
  onSlotSec: (id: string | null) => void;
  yazim: number;
}) {
  const { veri, yukleniyor, yaz, tazele } = useDosya<HaftaTipi>(`${kod}.json`);
  // Eksen aynı dosyayı başka yoldan yazdı: eski hâl üzerine yazılmasın, hemen oku.
  useEffect(() => {
    if (yazim > 0) void tazele();
  }, [yazim, tazele]);
  const [rapor, setRapor] = useState<BosaltRaporu | null>(null);

  if (yukleniyor || !veri) {
    return (
      <aside className={s.panel}>
        <Yuklenirken satir={2} />
      </aside>
    );
  }

  const slotlar = gununSlotlari(veri, gunNo);
  const tip = gunTipi(gunNo, veri.ofisGunleri ?? []);
  const bosaltilabilir = slotlar.some((x) => x.durum === "planli");

  const slotuEkle = () => {
    const { hafta, id } = slotEkle(veri, gunNo, kurallar);
    void yaz(hafta);
    setRapor(null);
    onSlotSec(id);
  };

  // Eksende seçilen slot bu dosyadaysa düzenleme paneli listenin üstünde açılır.
  const secilen = veri.slotlar.find((x) => x.id === seciliSlot) ?? null;
  const slotDegis = (y: Slot) => void yaz({ ...veri, slotlar: veri.slotlar.map((x) => (x.id === y.id ? y : x)) });
  const slotSil = (id: string) => {
    void yaz({ ...veri, slotlar: veri.slotlar.filter((x) => x.id !== id) });
    onSlotSec(null);
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
      <PanelBasi
        iso={iso}
        tip={tip}
        eylemler={
          <>
            <Dugme
              tur="sade"
              ikon={<Plus size={16} />}
              onClick={slotuEkle}
              title="Slot ekle"
              aria-label="Slot ekle"
            />
            {/* Seyrek iş: açıklaması ipucunda, panelde kalıcı yer tutmuyor. */}
            <Dugme
              tur="sade"
              ikon={<CalendarOff size={16} />}
              onClick={bosalt}
              disabled={!bosaltilabilir}
              title="Günü boşalt (buluşma) — planlı slotlar taşınır, sıkıştırılmaz. Hafta sonuna sığmayan düşer ve ⊘ olarak kalır."
              aria-label="Günü boşalt"
            />
          </>
        }
      />

      {secilen && (
        <SlotPaneli
          gomulu
          slot={secilen}
          kurallar={kurallar}
          gunler={veri.gunler}
          onDegis={slotDegis}
          onSil={() => slotSil(secilen.id)}
          onKapat={() => onSlotSec(null)}
        />
      )}

      {rapor && (
        <div className={s.rapor}>
          {rapor.not ?? `${rapor.tasinan} slot taşındı, ${rapor.dusen} düştü.`}
          {rapor.hedefler.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>
      )}

      <GunListesi
        gorevler={gorevler}
        slotlar={slotlar}
        seciliSlot={seciliSlot}
        onSlotSec={onSlotSec}
        onKapat={onGorevKapat}
        surukle={surukle}
      />
      <GunaGorevEkle iso={iso} host={ekleHost} />
    </aside>
  );
}
