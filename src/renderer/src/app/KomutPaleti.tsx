import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArchiveRestore, CornerDownLeft, Home, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { komutAra, type Eslesme } from "@ortak/komut-ara";
import { moduller, type Komut } from "@/modules";
import { gecisEgrisi } from "@/ui/hareket";
import { bildir } from "@/ui/toast";
import { kopru } from "@/veri/kanca";
import s from "./komutPaleti.module.css";

/**
 * Komut paleti (Ctrl+K): tüm ekranlara ve modüllerin eylemlerine tek giriş.
 *
 * Kabuk modülleri tanımaz; komutları `Modul.komutlar`'dan toplar, gitme
 * komutlarını rotalardan kendisi üretir. Eylemler önce, gitmeler sonra:
 * palet çoğunlukla bir şey yapmak için açılıyor.
 */

/** Ekranlara gitme komutları. Tek ekranlı modülde ad yalnızca modül adı. */
function gitmeKomutlari(): Komut[] {
  const bugun: Komut = {
    id: "git.bugun",
    ad: "Git: Bugün",
    ikon: Home,
    anahtarlar: ["bugün", "ana sayfa"],
    calistir: (_a, o) => o.git("/"),
  };
  return [
    bugun,
    ...moduller.flatMap((m) =>
      m.rotalar.map(
        (r): Komut => ({
          id: `git.${m.id}.${r.yol}`,
          ad: m.rotalar.length > 1 ? `Git: ${m.ad} › ${r.ad}` : `Git: ${m.ad}`,
          ikon: m.ikon,
          anahtarlar: [m.ad, r.ad],
          calistir: (_a, o) => o.git(r.yol ? `/${m.id}/${r.yol}` : `/${m.id}`),
        }),
      ),
    ),
  ];
}

/** Kabuğun kendi eylemleri: bir modüle ait olmayanlar. */
const KABUK_KOMUTLARI: Komut[] = [
  {
    id: "kabuk.yedekler",
    ad: "Yedek klasörünü aç",
    ikon: ArchiveRestore,
    anahtarlar: ["yedek", "geri yükle"],
    calistir: async () => {
      const k = kopru();
      if (!k) throw new Error("Uygulama köprüsü yok");
      await k.yedekAc();
    },
  },
];

const GITMELER = gitmeKomutlari();

/**
 * `acilis` her açılışta artar ve anahtar olur. Sabit anahtarla, kapanma
 * animasyonu sürerken yeniden açılan palet taze kurulmuyor; kapanmakta olan
 * örnek eski yazısıyla ve yarı saydam geri geliyordu.
 */
export function KomutPaleti({ acik, acilis, kapat }: { acik: boolean; acilis: number; kapat: () => void }) {
  return (
    <AnimatePresence>
      {acik && <PaletIcerik key={acilis} kapat={kapat} />}
    </AnimatePresence>
  );
}

function PaletIcerik({ kapat }: { kapat: () => void }) {
  const git = useNavigate();
  const [sorgu, setSorgu] = useState("");
  const [secili, setSecili] = useState(0);
  /** Metin alan komutun hatası: palet açık kalır, yazılan düzeltilir. */
  const [hata, setHata] = useState<string | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const girdi = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLUListElement>(null);

  // `uygun` o anki duruma bakıyor (sayaç çalışıyor mu); palet her açılışta yeniden kurulur.
  const komutlar = useMemo(
    () => [
      ...moduller.flatMap((m) => m.komutlar ?? []).filter((k) => k.uygun?.() ?? true),
      ...GITMELER,
      ...KABUK_KOMUTLARI,
    ],
    [],
  );
  const sonuclar = useMemo(() => komutAra(sorgu, komutlar), [sorgu, komutlar]);

  useEffect(() => {
    setSecili(0);
    setHata(null);
  }, [sorgu]);
  useEffect(() => {
    liste.current?.querySelector<HTMLElement>(`[data-sira="${secili}"]`)?.scrollIntoView({ block: "nearest" });
  }, [secili]);

  const calistir = (e: Eslesme<Komut>) => {
    const { komut, arguman } = e;
    // Metin alan komut argümansız seçildiyse önek yazılır, yazmaya devam edilir.
    if (komut.onekler && !arguman) {
      setSorgu(`${komut.onekler[0]} `);
      girdi.current?.focus();
      return;
    }
    const ortam = { git: (yol: string) => git(yol) };
    // Gitme ve düğme gibi komutlar anında: palet kapanır, sonuç bildirimde.
    if (!komut.onekler) {
      kapat();
      void (async () => {
        try {
          const mesaj = await komut.calistir("", ortam);
          if (mesaj) bildir({ metin: mesaj });
        } catch (h) {
          bildir({ metin: h instanceof Error ? h.message : String(h), tur: "hata", sure: 8000 });
        }
      })();
      return;
    }
    // Metin alan komut: bitene dek palet açık. Hata olursa yazılan kaybolmasın.
    if (calisiyor) return;
    setCalisiyor(true);
    setHata(null);
    void (async () => {
      try {
        const mesaj = await komut.calistir(arguman ?? "", ortam);
        kapat();
        if (mesaj) bildir({ metin: mesaj });
      } catch (h) {
        setHata(h instanceof Error ? h.message : String(h));
        girdi.current?.focus();
      } finally {
        setCalisiyor(false);
      }
    })();
  };

  const tus = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSecili((i) => Math.min(i + 1, sonuclar.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSecili((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const x = sonuclar[secili];
      if (x) calistir(x);
    } else if (e.key === "Escape") {
      e.preventDefault();
      kapat();
    }
  };

  const onekli = sonuclar[0]?.arguman !== null && sonuclar[0]?.arguman !== undefined ? sonuclar[0] : null;

  return (
    <motion.div
      className={s.perde}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: gecisEgrisi }}
      exit={{ opacity: 0, transition: { ...gecisEgrisi, duration: 0.1 } }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) kapat();
      }}
    >
      <motion.div
        className={s.palet}
        role="dialog"
        aria-label="Komut paleti"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: gecisEgrisi }}
        exit={{ opacity: 0, y: -4, transition: { ...gecisEgrisi, duration: 0.1 } }}
      >
        <div className={s.girdiSatiri}>
          <Search size={17} strokeWidth={1.9} className={s.aramaIkonu} />
          <input
            ref={girdi}
            autoFocus
            className={s.girdi}
            value={sorgu}
            onChange={(e) => setSorgu(e.target.value)}
            onKeyDown={tus}
            placeholder="Komut ara ya da yaz: görev …, slot …, not …"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls="palet-liste"
            aria-activedescendant={sonuclar[secili] ? `palet-${sonuclar[secili]!.komut.id}` : undefined}
          />
        </div>

        {hata && (
          <div className={s.hata} role="alert">
            <AlertTriangle size={14} />
            <span>{hata}</span>
          </div>
        )}

        {!hata && onekli && !onekli.arguman && onekli.komut.ornek && (
          <div className={s.ipucu}>
            Örnek: <span className={s.ornek}>{onekli.komut.onekler?.[0]} {onekli.komut.ornek}</span>
          </div>
        )}

        <ul ref={liste} id="palet-liste" role="listbox" className={s.liste}>
          {sonuclar.length === 0 && <li className={s.bos}>Eşleşen komut yok</li>}
          {sonuclar.map((e, i) => {
            const Ikon = e.komut.ikon;
            return (
              <li
                key={e.komut.id}
                id={`palet-${e.komut.id}`}
                data-sira={i}
                role="option"
                aria-selected={i === secili}
                className={i === secili ? `${s.satir} ${s.secili}` : s.satir}
                onMouseMove={() => setSecili(i)}
                onMouseDown={(olay) => {
                  // Girdi odağı kaybetmesin; tıklama Enter gibi.
                  olay.preventDefault();
                  calistir(e);
                }}
              >
                <span className={s.satirIkonu}>{Ikon && <Ikon size={16} strokeWidth={1.9} />}</span>
                <span className={s.ad}>{e.komut.ad}</span>
                {e.arguman ? (
                  <span className={s.arguman}>{e.arguman}</span>
                ) : (
                  e.komut.onekler && <span className={s.onek}>{e.komut.onekler[0]} …</span>
                )}
                {i === secili &&
                  (calisiyor ? (
                    <Loader2 size={14} className={`${s.enter} ${s.donen}`} />
                  ) : (
                    <CornerDownLeft size={14} className={s.enter} />
                  ))}
              </li>
            );
          })}
        </ul>

        <div className={s.alt}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> seç
          </span>
          <span>
            <kbd>Enter</kbd> çalıştır
          </span>
          <span>
            <kbd>Esc</kbd> kapat
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
