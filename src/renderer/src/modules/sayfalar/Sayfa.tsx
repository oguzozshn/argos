import { ArrowDown, ArrowUp, Copy, SmilePlus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  CONTAINER_TYPES,
  appendBlock,
  blockOutline,
  blockWithDescendants,
  deleteBlock,
  deleteBlockTree,
  indentBlock,
  insertBlockAfter,
  insertBlockBefore,
  moveBlock,
  moveBlockTo,
  newBlockId,
  outdentBlock,
  typeAfterEnter,
  updateBlock,
  type Block,
  type BlockType,
  type NewBlock,
  type PageDoc,
  type PageMeta,
} from "@ortak/sayfalar";
import { concatMarks } from "@ortak/sayfa-marks";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import { BlokSatiri, valuePatch, type BlokEylemleri, type DropPlace, type FocusRequest } from "./BlokSatiri";
import { BLOCK_TYPE_INFO } from "./blockTypes";
import { EmojiPicker } from "./EmojiPicker";
import { useSayfaGovdesi } from "./kanca";
import s from "./sayfalar.module.css";

/** Boşken Enter'a basılınca düz metne dönen tipler. */
const LISTE_TIPLERI: BlockType[] = ["bulleted", "numbered", "todo"];

interface DragState {
  id: string;
  target: { id: string; place: DropPlace } | null;
}

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
  const [odak, setOdak] = useState<({ id: string } & FocusRequest) | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [emoji, setEmoji] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
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
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const blok = (id: string): Block | undefined => docRef.current.blocks.find((b) => b.id === id);

  const odakKomsu = useCallback((id: string, delta: -1 | 1) => {
    const liste = anahatRef.current;
    let i = liste.findIndex((x) => x.block.id === id) + delta;
    // Dividers and unknown blocks have no text box: step over them.
    while (liste[i] && (liste[i]!.block.type === "divider" || liste[i]!.block.type === "unknown")) i += delta;
    const hedef = liste[i];
    if (hedef) setOdak({ id: hedef.block.id });
  }, []);

  const eylem: BlokEylemleri = useMemo(
    () => ({
      yaz: (id, patch) => void degistir((d) => updateBlock(d, id, patch)),

      enter: (id, once, sonra) => {
        const b = blok(id);
        if (!b) return;
        // Boş liste maddesinde Enter yeni madde açmaz: önce girintiden çıkar,
        // kök seviyedeyse düz metne döner. Notion'ın davranışı. The same goes
        // for any other empty typed block: Enter gives the plain line back.
        if (once.text === "" && sonra.text === "") {
          if (b.parentId && (b.type === "paragraph" || LISTE_TIPLERI.includes(b.type))) {
            void degistir((d) => outdentBlock(d, id));
            return;
          }
          if (b.type !== "paragraph") {
            void degistir((d) => updateBlock(d, id, { type: "paragraph", text: "", marks: undefined }));
            return;
          }
        }
        const yeni = newBlockId();
        // One write carries both halves, so the file never holds the text twice.
        void degistir((d) =>
          insertAfterOrInside(
            updateBlock(d, id, valuePatch(once)),
            b,
            { type: typeAfterEnter(b.type), text: sonra.text, marks: sonra.marks },
            yeni,
          ),
        );
        setOdak({ id: yeni, caret: 0 });
      },

      insertAbove: (id) => void degistir((d) => insertBlockBefore(d, id, { type: "paragraph" }, newBlockId())),

      backspaceAtStart: (id, value) => {
        const text = value.text;
        const yama = valuePatch(value);
        const b = blok(id);
        if (!b) return;
        // Order as in Notion: the block type goes first, then the indent,
        // and only a plain root-level line joins the block above.
        if (b.type !== "paragraph") {
          void degistir((d) => updateBlock(d, id, { type: "paragraph", ...yama }));
          return;
        }
        if (b.parentId) {
          void degistir((d) => outdentBlock(updateBlock(d, id, yama), id));
          return;
        }
        const liste = anahatRef.current;
        const i = liste.findIndex((x) => x.block.id === id);
        const onceki = liste[i - 1]?.block;
        if (!onceki) {
          const sonraki = liste[i + 1]?.block;
          if (text === "" && sonraki && sonraki.type !== "divider" && sonraki.type !== "unknown") {
            void degistir((d) => deleteBlock(d, id));
            setOdak({ id: sonraki.id, caret: 0 });
          }
          return;
        }
        if (onceki.type === "divider") {
          void degistir((d) => deleteBlock(updateBlock(d, id, yama), onceki.id));
          return;
        }
        if (onceki.type === "unknown") return;
        const caret = onceki.text.length;
        // The two texts join and so do their formats, the lower one shifted behind the upper.
        const birlesik = valuePatch({
          text: onceki.text + text,
          marks: concatMarks(onceki.marks ?? [], onceki.text.length, value.marks),
        });
        void degistir((d) => deleteBlock(updateBlock(d, onceki.id, birlesik), id));
        setOdak({ id: onceki.id, caret });
      },

      insertBelow: (id, type, slash) => {
        const b = blok(id);
        if (!b) return;
        const yeni = newBlockId();
        if (type === "divider") {
          const ardi = newBlockId();
          void degistir((d) =>
            insertBlockAfter(insertBlockAfter(d, id, { type: "divider" }, yeni), yeni, { type: "paragraph" }, ardi),
          );
          setOdak({ id: ardi });
          return;
        }
        void degistir((d) => insertAfterOrInside(d, b, { type }, yeni));
        setOdak({ id: yeni, slash });
      },

      toDivider: (id) => {
        const ardi = newBlockId();
        void degistir((d) =>
          insertBlockAfter(updateBlock(d, id, { type: "divider", text: "", marks: undefined }), id, { type: "paragraph" }, ardi),
        );
        setOdak({ id: ardi });
      },

      girintile: (id) => void degistir((d) => indentBlock(d, id)),
      cikar: (id) => void degistir((d) => outdentBlock(d, id)),
      tasi: (id, delta) => void degistir((d) => moveBlock(d, id, delta)),
      odakKomsu,
      menu: (id, x, y) => setMenu({ id, x, y }),

      dragStart: (id) => setDrag({ id, target: null }),
      dragOver: (id, place) =>
        setDrag((mevcut) => {
          if (!mevcut) return mevcut;
          // A block cannot land inside its own subtree: no line is shown there.
          const gecerli = !blockWithDescendants(docRef.current, mevcut.id).includes(id);
          const target = gecerli ? { id, place } : null;
          if (mevcut.target?.id === target?.id && mevcut.target?.place === target?.place) return mevcut;
          return { ...mevcut, target };
        }),
      drop: () => {
        const d = dragRef.current;
        setDrag(null);
        if (!d?.target) return;
        const { id, place } = d.target;
        void degistir((x) => moveBlockTo(x, d.id, id, place === "before" ? "before" : "after"));
      },
      dragEnd: () => setDrag(null),
    }),
    [degistir, odakKomsu],
  );

  const odakAlindi = useCallback(() => setOdak(null), []);

  const sonaEkle = () => {
    const son = anahat[anahat.length - 1]?.block;
    // Son blok boş bir paragrafsa yenisini açmak yerine oraya odaklan.
    if (son && son.type === "paragraph" && son.text === "") {
      setOdak({ id: son.id });
      return;
    }
    const yeni = newBlockId();
    void degistir((d) => appendBlock(d, { type: "paragraph" }, yeni));
    setOdak({ id: yeni });
  };

  /** Enter in the title: writing continues in a fresh first line, as in Notion. */
  const basaEkle = () => {
    const ilk = anahat[0]?.block;
    if (ilk && ilk.type === "paragraph" && ilk.text === "") {
      setOdak({ id: ilk.id });
      return;
    }
    const yeni = newBlockId();
    void degistir((d) => (ilk ? insertBlockBefore(d, ilk.id, { type: "paragraph" }, yeni) : appendBlock(d, {}, yeni)));
    setOdak({ id: yeni });
  };

  const baslikYaz = (metin: string) => {
    setBaslik(metin);
    window.clearTimeout(baslikZaman.current);
    baslikZaman.current = window.setTimeout(() => onBaslik(metin), 400);
  };

  const baslikBitti = () => {
    window.clearTimeout(baslikZaman.current);
    if (baslik !== page.title) onBaslik(baslik);
  };

  const menuBlok = menu ? blok(menu.id) : undefined;

  return (
    <div className={s.sayfa}>
      <div className={s.column}>
        <div className={s.sayfaBas}>
          {page.icon ? (
            <button
              type="button"
              className={s.ikonDugmesi}
              title="İkonu değiştir"
              aria-label="Sayfa ikonu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setEmoji({ x: r.left, y: r.bottom + 6 });
              }}
            >
              {page.icon}
            </button>
          ) : (
            <button
              type="button"
              className={s.addIcon}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setEmoji({ x: r.left, y: r.bottom + 6 });
              }}
            >
              <SmilePlus size={15} />
              İkon ekle
            </button>
          )}
          <input
            className={s.baslikAlani}
            value={baslik}
            placeholder="Adsız"
            autoFocus={page.title === ""}
            spellCheck={false}
            onChange={(e) => baslikYaz(e.target.value)}
            onBlur={baslikBitti}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== "ArrowDown") return;
              e.preventDefault();
              baslikBitti();
              if (e.key === "Enter") basaEkle();
              else if (anahat[0]) setOdak({ id: anahat[0].block.id });
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
              focus={odak?.id === block.id ? odak : null}
              dragging={drag?.id === block.id}
              dragActive={drag !== null}
              dropPlace={drag?.target?.id === block.id ? drag.target.place : null}
              eylem={eylem}
              onOdaklandi={odakAlindi}
            />
          ))}
        </div>

        {/* Boşluğa tıklayınca yeni paragraf — sayfanın altı hep yazılabilir. */}
        <button type="button" className={s.bosAlan} onClick={sonaEkle} aria-label="Yeni blok">
          {anahat.length === 0 && !govde.yukleniyor && (
            <span className={s.bosIpucu}>Yazmaya başlamak için tıkla ya da başlıkta Enter'a bas</span>
          )}
        </button>
      </div>

      {emoji && (
        <EmojiPicker
          x={emoji.x}
          y={emoji.y}
          current={page.icon}
          onClose={() => setEmoji(null)}
          onPick={(e) => {
            onIkon(e);
            setEmoji(null);
          }}
        />
      )}

      {menu && menuBlok && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)} label="Blok" className={s.blokMenusu}>
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
          <MenuItem
            icon={<Copy size={15} />}
            onSelect={() => {
              const { type, text, marks, checked, lang, raw } = menuBlok;
              void degistir((d) => insertBlockAfter(d, menu.id, { type, text, marks, checked, lang, raw }, newBlockId()));
              setMenu(null);
            }}
          >
            Çoğalt
          </MenuItem>
          <MenuItem
            icon={<ArrowUp size={15} />}
            hint="Alt ↑"
            onSelect={() => {
              void degistir((d) => moveBlock(d, menu.id, -1));
              setMenu(null);
            }}
          >
            Yukarı taşı
          </MenuItem>
          <MenuItem
            icon={<ArrowDown size={15} />}
            hint="Alt ↓"
            onSelect={() => {
              void degistir((d) => moveBlock(d, menu.id, 1));
              setMenu(null);
            }}
          >
            Aşağı taşı
          </MenuItem>
          {menuBlok.type !== "unknown" && menuBlok.type !== "divider" && (
            <>
              <MenuSeparator />
              <MenuLabel>Şuna dönüştür</MenuLabel>
              {BLOCK_TYPE_INFO.filter((t) => t.type !== "divider").map((t) => (
                <MenuItem
                  key={t.type}
                  icon={<t.icon size={15} />}
                  active={menuBlok.type === t.type}
                  hint={t.hint}
                  onSelect={() => {
                    void degistir((d) => updateBlock(d, menu.id, { type: t.type }));
                    setMenu(null);
                  }}
                >
                  {t.name}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
      )}
    </div>
  );
}

/** Bloğun ilk çocuğu olarak ekler: altı dolu bir bloğun hemen ardına yazmak bu. */
function insertFirstChild(d: PageDoc, parentId: string, input: NewBlock, id: string): PageDoc {
  const shifted = { ...d, blocks: d.blocks.map((b) => (b.parentId === parentId ? { ...b, order: b.order + 1 } : b)) };
  const once = appendBlock(shifted, { ...input, parentId }, id);
  return updateBlock(once, id, { order: 0 });
}

/**
 * Where a line written right after `b` belongs. Under a block that already
 * has children it becomes the first child; otherwise the new line would end
 * up below the children. A collapsed toggle hides its children, so there the
 * line stays a sibling.
 */
function insertAfterOrInside(d: PageDoc, b: Block, input: NewBlock, id: string): PageDoc {
  const inside =
    CONTAINER_TYPES.includes(b.type) &&
    !(b.type === "toggle" && b.collapsed) &&
    d.blocks.some((x) => x.parentId === b.id);
  return inside ? insertFirstChild(d, b.id, input, id) : insertBlockAfter(d, b.id, input, id);
}
