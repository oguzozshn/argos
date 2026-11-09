import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  CONTAINER_TYPES,
  EDITABLE_TYPES,
  appendBlock,
  blockOutline,
  deleteBlock,
  deleteBlockTree,
  indentBlock,
  insertBlockAfter,
  moveBlock,
  newBlockId,
  outdentBlock,
  typeAfterEnter,
  updateBlock,
  type Block,
  type BlockType,
  type PageDoc,
  type PageMeta,
} from "@ortak/sayfalar";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import { BlokSatiri, type BlokEylemleri } from "./BlokSatiri";
import { useSayfaGovdesi } from "./kanca";
import s from "./sayfalar.module.css";

/** Blok menüsündeki tip adları — markdown kısayolları da ipucu olarak duruyor. */
const TIP_ADLARI: Record<Exclude<BlockType, "divider" | "unknown">, { ad: string; ipucu: string }> = {
  paragraph: { ad: "Metin", ipucu: "" },
  heading1: { ad: "Başlık 1", ipucu: "#" },
  heading2: { ad: "Başlık 2", ipucu: "##" },
  heading3: { ad: "Başlık 3", ipucu: "###" },
  bulleted: { ad: "Madde", ipucu: "-" },
  numbered: { ad: "Numaralı", ipucu: "1." },
  todo: { ad: "Yapılacak", ipucu: "[]" },
  toggle: { ad: "Katlanır", ipucu: ">" },
  quote: { ad: "Alıntı", ipucu: "" },
  callout: { ad: "Not", ipucu: "" },
  code: { ad: "Kod", ipucu: "```" },
};

/** Boşken Enter'a basılınca düz metne dönen tipler. */
const LISTE_TIPLERI: BlockType[] = ["bulleted", "numbered", "todo"];

/**
 * Açık sayfanın kendisi: başlık, ikon ve blokları.
 *
 * Gövde dosyası ayrı (`pages/<id>.json`); başlık ve ikon ağaç dosyasında
 * durduğu için yukarı veriliyor.
 */
export function Sayfa({
  page,
  onBaslik,
  onIkon,
  onDegisti,
}: {
  page: PageMeta;
  onBaslik: (title: string) => void;
  onIkon: (icon: string) => void;
  /** Gövde değişti — ağaçtaki düzenleme damgası tazelensin. */
  onDegisti: () => void;
}) {
  const govde = useSayfaGovdesi(page.id);
  const { doc, degistir: govdeyiDegistir } = govde;
  const anahat = useMemo(() => blockOutline(doc), [doc]);
  const [odak, setOdak] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [baslik, setBaslik] = useState(page.title);
  const baslikZaman = useRef<number | undefined>(undefined);

  const degistir = useCallback(
    (f: (d: PageDoc) => PageDoc) => {
      onDegisti();
      return govdeyiDegistir(f);
    },
    [govdeyiDegistir, onDegisti],
  );

  // Eylemler satırlara prop olarak iniyor; kimlikleri her çizimde değişirse
  // satırların etkileri sürekli yeniden kurulur. Bu yüzden eylemler sabit,
  // güncel dosyayı ref üstünden okuyorlar.
  const docRef = useRef(doc);
  docRef.current = doc;
  const anahatRef = useRef(anahat);
  anahatRef.current = anahat;

  const blok = (id: string): Block | undefined => docRef.current.blocks.find((b) => b.id === id);

  const odakKomsu = useCallback((id: string, delta: -1 | 1) => {
    const liste = anahatRef.current;
    const i = liste.findIndex((x) => x.block.id === id);
    const hedef = liste[i + delta];
    if (hedef) setOdak(hedef.block.id);
  }, []);

  const eylem: BlokEylemleri = useMemo(
    () => ({
      yaz: (id, patch) => void degistir((d) => updateBlock(d, id, patch)),

      enter: (id, once, sonra) => {
        const b = blok(id);
        if (!b) return;
        // Boş liste maddesinde Enter yeni madde açmaz: önce girintiden çıkar,
        // kök seviyedeyse düz metne döner. Notion'ın davranışı.
        //
        // Metin dosyadan değil satırın verdiğinden okunuyor: satır az önce
        // yazdı ve yazma kuyrukta, dosyadaki hâl bir tık geride.
        if (once === "" && sonra === "" && LISTE_TIPLERI.includes(b.type)) {
          if (b.parentId) void degistir((d) => outdentBlock(d, id));
          else void degistir((d) => updateBlock(d, id, { type: "paragraph" }));
          return;
        }
        const yeni = newBlockId();
        // Alt blokları olan bir bloğun ardına yazılan satır, onun ilk çocuğu
        // olur; yoksa araya giren satır çocukların altında kalırdı.
        const altVar = docRef.current.blocks.some((x) => x.parentId === id);
        void degistir((d) =>
          altVar && CONTAINER_TYPES.includes(b.type)
            ? insertFirstChild(d, id, { type: typeAfterEnter(b.type), text: sonra }, yeni)
            : insertBlockAfter(d, id, { type: typeAfterEnter(b.type), text: sonra }, yeni),
        );
        setOdak(yeni);
      },

      sil: (id) => {
        odakKomsu(id, -1);
        void degistir((d) => deleteBlock(d, id));
      },

      girintile: (id) => void degistir((d) => indentBlock(d, id)),
      cikar: (id) => void degistir((d) => outdentBlock(d, id)),
      tasi: (id, delta) => void degistir((d) => moveBlock(d, id, delta)),
      odakKomsu,
      menu: (id, x, y) => setMenu({ id, x, y }),
    }),
    [degistir, odakKomsu],
  );

  const odakAlindi = useCallback(() => setOdak(null), []);

  const sonaEkle = () => {
    const son = anahat[anahat.length - 1]?.block;
    // Son blok boş bir paragrafsa yenisini açmak yerine oraya odaklan.
    if (son && son.type === "paragraph" && son.text === "") {
      setOdak(son.id);
      return;
    }
    const yeni = newBlockId();
    void degistir((d) => appendBlock(d, { type: "paragraph" }, yeni));
    setOdak(yeni);
  };

  const baslikYaz = (metin: string) => {
    setBaslik(metin);
    window.clearTimeout(baslikZaman.current);
    baslikZaman.current = window.setTimeout(() => onBaslik(metin), 400);
  };

  const menuBlok = menu ? blok(menu.id) : undefined;

  return (
    <div className={s.sayfa}>
      <div className={s.sayfaBas}>
        <button
          type="button"
          className={s.ikonDugmesi}
          title="Sayfa ikonu"
          onClick={() => {
            const yeni = window.prompt("Sayfa ikonu (emoji, boş bırakılırsa kaldırılır)", page.icon);
            if (yeni !== null) onIkon(yeni.trim().slice(0, 4));
          }}
        >
          {page.icon || "📄"}
        </button>
        <input
          className={s.baslikAlani}
          value={baslik}
          placeholder="Adsız sayfa"
          onChange={(e) => baslikYaz(e.target.value)}
          onBlur={() => {
            window.clearTimeout(baslikZaman.current);
            if (baslik !== page.title) onBaslik(baslik);
          }}
        />
      </div>

      {govde.hata && <p className={s.hata}>{govde.hata}</p>}

      <div className={s.bloklar}>
        {anahat.map(({ block, depth, number, hasChildren }) => (
          <BlokSatiri
            key={block.id}
            block={block}
            depth={depth}
            number={number}
            hasChildren={hasChildren}
            odakli={odak === block.id}
            eylem={eylem}
            onOdaklandi={odakAlindi}
          />
        ))}
      </div>

      {/* Boşluğa tıklayınca yeni paragraf — sayfanın altı hep yazılabilir. */}
      <button
        type="button"
        className={s.bosAlan}
        onClick={sonaEkle}
        aria-label="Yeni blok"
        title="Yeni blok"
      >
        {anahat.length === 0 && <span className={s.bosIpucu}>Yazmaya başlamak için tıkla</span>}
      </button>

      {menu && menuBlok && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)} label="Blok" className={s.blokMenusu}>
          {menuBlok.type !== "unknown" && menuBlok.type !== "divider" && (
            <>
              <MenuLabel>Tipi değiştir</MenuLabel>
              {EDITABLE_TYPES.map((t) => (
                <MenuItem
                  key={t}
                  active={menuBlok.type === t}
                  hint={TIP_ADLARI[t as keyof typeof TIP_ADLARI].ipucu}
                  onSelect={() => {
                    void degistir((d) => updateBlock(d, menu.id, { type: t }));
                    setMenu(null);
                  }}
                >
                  {TIP_ADLARI[t as keyof typeof TIP_ADLARI].ad}
                </MenuItem>
              ))}
              <MenuSeparator />
            </>
          )}
          <MenuItem
            icon={<ArrowUp size={15} />}
            onSelect={() => {
              void degistir((d) => moveBlock(d, menu.id, -1));
              setMenu(null);
            }}
          >
            Yukarı taşı
          </MenuItem>
          <MenuItem
            icon={<ArrowDown size={15} />}
            onSelect={() => {
              void degistir((d) => moveBlock(d, menu.id, 1));
              setMenu(null);
            }}
          >
            Aşağı taşı
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            danger
            icon={<Trash2 size={15} />}
            onSelect={() => {
              void degistir((d) => deleteBlock(d, menu.id));
              setMenu(null);
            }}
          >
            Sil
          </MenuItem>
          {doc.blocks.some((b) => b.parentId === menu.id) && (
            <MenuItem
              danger
              icon={<Trash2 size={15} />}
              onSelect={() => {
                void degistir((d) => deleteBlockTree(d, menu.id));
                setMenu(null);
              }}
            >
              Altındakilerle sil
            </MenuItem>
          )}
        </Popover>
      )}
    </div>
  );
}

/** Bloğun ilk çocuğu olarak ekler: altı dolu bir bloğun hemen ardına yazmak bu. */
function insertFirstChild(d: PageDoc, parentId: string, input: { type: BlockType; text: string }, id: string): PageDoc {
  const shifted = { ...d, blocks: d.blocks.map((b) => (b.parentId === parentId ? { ...b, order: b.order + 1 } : b)) };
  const once = appendBlock(shifted, { ...input, parentId }, id);
  return updateBlock(once, id, { order: 0 });
}
