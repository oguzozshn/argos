import { Check, LayoutGrid, Pencil, Plus, RotateCcw, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { GridBackground } from "react-grid-layout/extras";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  BUGUN_DUZEN_PATH,
  EN_DAR,
  EN_KISA,
  KOLON,
  altSinir,
  ayniDuzen,
  kartAyarla,
  kartEkle,
  kartKaldir,
  normalizeDuzen,
  okumaSirasi,
  sinirla,
  varsayilanDuzen,
  type BugunDuzen,
  type KartAyari,
  type KartYeri,
} from "@ortak/bugun-duzen";
import { moduller, type KartAyarTanimi } from "@/modules";
import { BosDurum, Dugme, EkranBasi } from "@/ui/bilesenler";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import { useDosya } from "@/veri/kanca";
import { HataSiniri } from "./HataSiniri";
import s from "./bugun.module.css";

const gunAdi = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Grid measures: 12 columns; rows short enough to size a card finely. */
const SATIR = 24;
const ARA: [number, number] = [16, 16];
/** Below this width the cards stack in reading order and the layout cannot be edited. */
const DAR = 760;

/** A card type, as this screen uses it. */
interface Kart {
  /** "<module>:<kind>". */
  id: string;
  ad: string;
  ust: boolean;
  /** Can be added more than once, each copy with its own settings. */
  coklu: boolean;
  modulAd: string;
  Bilesen: ComponentType<{ ayar: KartAyari }>;
  ayarlar?: KartAyarTanimi[];
  w?: number;
  h?: number;
}

/** A module's `Ozet`/`Ust` component as a card type: one of a kind, no settings. */
const tekil = (C: ComponentType): ComponentType<{ ayar: KartAyari }> => {
  const Sar = () => <C />;
  Sar.displayName = C.displayName ?? C.name;
  return Sar;
};

/** Every card type the modules offer: strips, summary cards, and the card types with settings. */
const KARTLAR: Kart[] = [
  ...moduller
    .filter((m) => m.Ust)
    .map((m) => ({ id: `${m.id}:ust`, ad: m.ustAd ?? m.ad, ust: true, coklu: false, modulAd: m.ad, Bilesen: tekil(m.Ust!) })),
  ...moduller
    .filter((m) => m.Ozet)
    .map((m) => ({ id: `${m.id}:ozet`, ad: m.ozetAd ?? m.ad, ust: false, coklu: false, modulAd: m.ad, Bilesen: tekil(m.Ozet!) })),
  ...moduller.flatMap((m) =>
    (m.kartlar ?? []).map((t) => ({
      id: `${m.id}:${t.id}`,
      ad: t.ad,
      ust: false,
      coklu: true,
      modulAd: m.ad,
      Bilesen: t.Bilesen,
      ayarlar: t.ayarlar,
      w: t.w,
      h: t.h,
    })),
  ),
];

/** A copy's id: unique, and readable in the layout file. */
const kopyaId = (tur: string): string => `${tur}#${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A card's settings menu: each setting's choices, the current one marked. */
function AyarMenusu({ kart, ayar, onSec }: { kart: Kart; ayar: KartAyari; onSec: (ayar: KartAyari) => void }) {
  return (
    <>
      {(kart.ayarlar ?? []).map((t, i) => (
        <AyarSecimi key={t.anahtar} tanim={t} ilk={i === 0} secili={ayar[t.anahtar]} onSec={(deger) => onSec({ ...ayar, [t.anahtar]: deger })} />
      ))}
    </>
  );
}

function AyarSecimi({ tanim, ilk, secili, onSec }: { tanim: KartAyarTanimi; ilk: boolean; secili?: string; onSec: (deger: string) => void }) {
  const secenekler = tanim.useSecenekler();
  // A setting not chosen yet shows the first choice as current: that is what the card falls back to.
  const gecerli = secenekler.some((x) => x.deger === secili) ? secili : secenekler[0]?.deger;
  return (
    <>
      {!ilk && <MenuSeparator />}
      <MenuLabel>{tanim.ad}</MenuLabel>
      {secenekler.length === 0 ? (
        <MenuLabel>Seçenek yok</MenuLabel>
      ) : (
        secenekler.map((x) => (
          <MenuItem key={x.deger} active={x.deger === gecerli} onSelect={() => onSec(x.deger)}>
            {x.ad}
          </MenuItem>
        ))
      )}
    </>
  );
}

/**
 * Cards that render nothing right now (no important dates, no plan…), kept
 * up to date as their content comes and goes. Watching the DOM rather than
 * asking the modules: a card's own component decides when it has nothing.
 */
function useBosKartlar(): [Set<string>, (id: string) => (el: HTMLDivElement | null) => void] {
  const [bos, setBos] = useState<Set<string>>(new Set());
  const gozcu = useRef(new Map<string, MutationObserver>());
  useEffect(() => () => gozcu.current.forEach((o) => o.disconnect()), []);
  const bagla = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      gozcu.current.get(id)?.disconnect();
      gozcu.current.delete(id);
      if (!el) return;
      const bak = () =>
        setBos((x) => {
          const simdi = el.childElementCount === 0;
          if (simdi === x.has(id)) return x;
          const y = new Set(x);
          if (simdi) y.add(id);
          else y.delete(id);
          return y;
        });
      bak();
      const o = new MutationObserver(bak);
      o.observe(el, { childList: true });
      gozcu.current.set(id, o);
    },
    [],
  );
  return [bos, bagla];
}

/**
 * Modüllerin buluştuğu tek ekran. Her modül kendi kartını verir; bu ekran
 * onları 12 sütunlu bir ızgaraya dizer (issue #48). "Düzenle" ile kartlar
 * sürüklenir, kenarlarından boyutlandırılır, kaldırılır ya da geri eklenir;
 * ızgaraya yapıştıkları için kenarlar kendiliğinden hizalanır. Düzen veri
 * klasörüne yazılır, klasörü kullanan her makinede aynıdır.
 */
export function Bugun() {
  const dosya = useDosya<BugunDuzen>(BUGUN_DUZEN_PATH);
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [ekleMenusu, setEkleMenusu] = useState<{ x: number; y: number } | null>(null);
  const [ayarMenusu, setAyarMenusu] = useState<{ id: string; x: number; y: number } | null>(null);
  const { width, containerRef, mounted } = useContainerWidth();
  const [bos, bagla] = useBosKartlar();
  // Stable per card copy, so a re-render does not re-attach every observer.
  const baglar = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const baglayici = (id: string) => {
    let f = baglar.current.get(id);
    if (!f) baglar.current.set(id, (f = bagla(id)));
    return f;
  };

  const kayitli = useMemo(() => normalizeDuzen(dosya.veri, KARTLAR.map((k) => k.id)), [dosya.veri]);
  const duzen = kayitli ?? varsayilanDuzen(KARTLAR);
  const ekrandakiler = new Set(duzen.map((k) => k.id));
  const ekrandakiTurler = new Set(duzen.map((k) => k.tur));
  // Copies can always be added; a one-of-a-kind card only when it is not on the screen.
  const eklenebilir = KARTLAR.filter((k) => k.coklu || !ekrandakiTurler.has(k.id));
  const dar = mounted && width < DAR;

  const kaydet = (yeni: KartYeri[]) => {
    const temiz = yeni.map(sinirla);
    if (!ayniDuzen(temiz, duzen) || kayitli === null) void dosya.yaz({ version: 1, kartlar: temiz });
  };

  /** The grid's layout after a drag or resize; only cards it knows, kept inside the grid. */
  const izgaradan = (layout: Layout): KartYeri[] =>
    duzen
      .map((k) => {
        const l = layout.find((x) => x.i === k.id);
        return l ? { ...k, x: l.x, y: l.y, w: l.w, h: l.h } : k;
      })
      .filter((k) => ekrandakiler.has(k.id));

  const ekleAc = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setEkleMenusu({ x: r.left, y: r.bottom + 4 });
  };

  const kart = (t: Kart, yer: KartYeri) => (
    <HataSiniri ad={t.modulAd}>
      <t.Bilesen ayar={yer.ayar ?? {}} />
    </HataSiniri>
  );

  if (KARTLAR.length === 0) {
    return (
      <>
        <EkranBasi ustyazi={gunAdi.format(new Date())} baslik="Bugün" />
        <BosDurum
          ikon={<LayoutGrid size={34} strokeWidth={1.4} />}
          baslik="Henüz modül yok"
          metin="Kabuk kuruldu. İlk modül eklendiğinde özeti bu ekranda görünecek."
        />
      </>
    );
  }

  const tanim = (tur: string) => KARTLAR.find((k) => k.id === tur)!;

  return (
    <>
      <EkranBasi
        ustyazi={gunAdi.format(new Date())}
        baslik="Bugün"
        sag={
          dar ? null : duzenleniyor ? (
            <div className={s.eylemler}>
              <Dugme tur="sade" ikon={<Plus size={15} />} onClick={ekleAc} disabled={eklenebilir.length === 0}>
                Kart ekle
              </Dugme>
              <Dugme
                tur="sade"
                ikon={<RotateCcw size={15} />}
                onClick={() => void dosya.yaz({ version: 1, kartlar: varsayilanDuzen(KARTLAR) })}
                title="Bütün kartlar, ilk düzen"
              >
                Varsayılana dön
              </Dugme>
              <Dugme tur="dolu" ikon={<Check size={15} />} onClick={() => setDuzenleniyor(false)}>
                Bitti
              </Dugme>
            </div>
          ) : (
            <Dugme tur="sade" ikon={<Pencil size={15} />} onClick={() => setDuzenleniyor(true)} title="Kartları taşı, boyutlandır, ekle ya da kaldır">
              Düzenle
            </Dugme>
          )
        }
      />

      {duzenleniyor && (
        <p className={s.ipucu}>
          Kartı tutup sürükle; kenarından ya da köşesinden çekerek boyutlandır. Kartlar ızgaraya oturur, kenarları kendiliğinden hizalanır.
        </p>
      )}

      <div ref={containerRef} className={duzenleniyor ? `${s.alan} ${s.alanDuzen}` : s.alan}>
        {duzen.length === 0 && (
          <BosDurum
            ikon={<LayoutGrid size={34} strokeWidth={1.4} />}
            baslik="Ekranda kart yok"
            metin={duzenleniyor ? "Yukarıdaki \"Kart ekle\" ile istediğin kartları geri getir." : "\"Düzenle\"ye basıp kart ekleyebilirsin."}
          />
        )}

        {dar ? (
          // Too narrow for twelve columns: the cards one under another, in the layout's reading order.
          <div className={s.dizi}>
            {okumaSirasi(duzen).map((k) => (
              <div key={k.id}>{kart(tanim(k.tur), k)}</div>
            ))}
          </div>
        ) : (
          mounted && (
            <>
              {duzenleniyor && (
                <GridBackground
                  className={s.izgaraArka}
                  width={width}
                  cols={KOLON}
                  rowHeight={SATIR}
                  margin={ARA}
                  containerPadding={[0, 0]}
                  rows={altSinir(duzen) + 6}
                  color="var(--zemin-alt)"
                  borderRadius={6}
                />
              )}
              <ReactGridLayout
                width={width}
                // An empty card shrinks to one row outside editing, so the cards below close the gap;
                // it stays mounted (no reload) and grows back when it has something to show.
                layout={duzen.map((k) => ({
                  i: k.id,
                  x: k.x,
                  y: k.y,
                  w: k.w,
                  h: !duzenleniyor && bos.has(k.id) ? 1 : k.h,
                  minW: EN_DAR,
                  minH: duzenleniyor ? EN_KISA : 1,
                }))}
                gridConfig={{ cols: KOLON, rowHeight: SATIR, margin: ARA, containerPadding: [0, 0] }}
                dragConfig={{ enabled: duzenleniyor, cancel: `.${s.kaldir}` }}
                resizeConfig={{ enabled: duzenleniyor, handles: ["s", "e", "w", "se", "sw"] }}
                onDragStop={(layout) => kaydet(izgaradan(layout))}
                onResizeStop={(layout) => kaydet(izgaradan(layout))}
              >
                {duzen.map((k) => {
                  const t = tanim(k.tur);
                  return (
                    <div key={k.id} className={s.oge}>
                      <div className={s.icerik} ref={baglayici(k.id)}>
                        {kart(t, k)}
                      </div>
                      {duzenleniyor && (
                        // Over the card while editing: the whole card is the handle, and its links do not fire.
                        <div className={s.duzenKatmani}>
                          <span className={s.kartAdi}>
                            {t.ad}
                            {bos.has(k.id) ? " · şu an boş" : ""}
                          </span>
                          <span className={s.katmanEylem}>
                          {t.ayarlar?.length ? (
                            <button
                              type="button"
                              className={s.kaldir}
                              onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setAyarMenusu({ id: k.id, x: r.left, y: r.bottom + 4 });
                              }}
                              aria-label={`${t.ad} kartının ayarları`}
                              title="Ayarlar"
                            >
                              <Settings2 size={14} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={s.kaldir}
                            onClick={() => kaydet(kartKaldir(duzen, k.id))}
                            aria-label={`${t.ad} kartını kaldır`}
                            title="Kaldır (Kart ekle ile geri gelir)"
                          >
                            <X size={14} />
                          </button>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </ReactGridLayout>
            </>
          )
        )}
      </div>

      {ayarMenusu &&
        (() => {
          const yer = duzen.find((k) => k.id === ayarMenusu.id);
          if (!yer) return null;
          return (
            <Popover x={ayarMenusu.x} y={ayarMenusu.y} onClose={() => setAyarMenusu(null)} label="Kart ayarları">
              <AyarMenusu
                kart={tanim(yer.tur)}
                ayar={yer.ayar ?? {}}
                onSec={(ayar) => {
                  kaydet(kartAyarla(duzen, yer.id, ayar));
                  setAyarMenusu(null);
                }}
              />
            </Popover>
          );
        })()}

      {ekleMenusu && (
        <Popover x={ekleMenusu.x} y={ekleMenusu.y} onClose={() => setEkleMenusu(null)} label="Kart ekle">
          {[...new Set(eklenebilir.map((k) => k.modulAd))].map((modul, i) => (
            <div key={modul}>
              {i > 0 && <MenuSeparator />}
              <MenuLabel>{modul}</MenuLabel>
              {eklenebilir
                .filter((k) => k.modulAd === modul)
                .map((k) => (
                  <MenuItem
                    key={k.id}
                    icon={<Plus size={15} />}
                    onSelect={() => {
                      kaydet(kartEkle(duzen, k, k.coklu ? kopyaId(k.id) : undefined));
                      setEkleMenusu(null);
                    }}
                  >
                    {k.ad}
                  </MenuItem>
                ))}
            </div>
          ))}
        </Popover>
      )}
    </>
  );
}
