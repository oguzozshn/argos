import { Check, ChevronDown, ChevronRight, GripVertical, Plus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  clearMarks,
  inlineShortcut,
  linkAt,
  rangeHas,
  setLink,
  sliceMarks,
  spliceText,
  toggleMark,
  type ToggleKey,
} from "@ortak/sayfa-marks";
import { markdownShortcut, type Block, type BlockType } from "@ortak/sayfalar";
import { searchBlockTypes, type BlockTypeInfo } from "./blockTypes";
import { FormatToolbar, TOOLBAR_ATTR } from "./FormatToolbar";
import { RichText, type RichTextHandle, type RichValue, type TextRange } from "./RichText";
import { SlashMenu } from "./SlashMenu";
import s from "./sayfalar.module.css";

/**
 * Tek blok satırı. Her blok kendi metin kutusu: tek bir contentEditable
 * gövde yerine blok başına alan tutmak, Notion'ın da yaptığı gibi, imleç ve
 * geri alma işini tarayıcıya bırakıyor.
 *
 * Metin satırın kendi durumunda duruyor ve dosyaya gecikmeli yazılıyor:
 * her tuşa basışta sayfa dosyasını baştan yazmak, OneDrive'ın izlediği bir
 * klasörde yazarken takılmaya yol açardı.
 */

/** Yazarken dosyaya yazma gecikmesi. Enter, Tab ve odak kaybı beklemeden yazar. */
const YAZMA_GECIKMESI = 400;

export type DropPlace = "before" | "after";

/** A focus request from the page: which caret position, and whether to open the slash menu. */
export interface FocusRequest {
  /** Caret offset; the end of the text when left out. */
  caret?: number;
  /** Open the "/" menu right away: the "+" handle asks for this. */
  slash?: boolean;
}

export interface BlokEylemleri {
  yaz: (id: string, patch: Partial<Block>) => void;
  /** Enter: imlecin solu bu blokta kalır, sağı yeni bloğa geçer. */
  enter: (id: string, once: RichValue, sonra: RichValue) => void;
  /** Enter at the very start of a non-empty block: an empty block opens above. */
  insertAbove: (id: string) => void;
  /** Backspace at the start of a block: back to plain text, outdent, or merge into the block above. */
  backspaceAtStart: (id: string, value: RichValue) => void;
  /** New block of the given type right below, focused. */
  insertBelow: (id: string, type: BlockType, slash?: boolean) => void;
  /** The block itself turns into a divider and a fresh paragraph follows. */
  toDivider: (id: string) => void;
  girintile: (id: string) => void;
  cikar: (id: string) => void;
  tasi: (id: string, delta: -1 | 1) => void;
  odakKomsu: (id: string, delta: -1 | 1) => void;
  menu: (id: string, x: number, y: number) => void;
  dragStart: (id: string) => void;
  dragOver: (id: string, place: DropPlace) => void;
  drop: () => void;
  dragEnd: () => void;
}

const YER_TUTUCU: Partial<Record<Block["type"], string>> = {
  paragraph: "Bir şeyler yaz ya da komutlar için '/' tuşuna bas",
  heading1: "Başlık 1",
  heading2: "Başlık 2",
  heading3: "Başlık 3",
  bulleted: "Liste",
  numbered: "Liste",
  todo: "Yapılacak",
  code: "Kod",
  toggle: "Katlanır başlık",
  callout: "Not",
  quote: "Alıntı",
};

/** Girinti adımı: bir seviye içeri, Notion'daki kadar. */
const GIRINTI = 26;

const BOS: RichValue = { text: "", marks: [] };

const valueOf = (block: Block): RichValue => ({ text: block.text, marks: block.marks ?? [] });

/** The block fields a value writes. An unformatted text drops the `marks` field from the file. */
export const valuePatch = (v: RichValue): Pick<Block, "text" | "marks"> => ({
  text: v.text,
  marks: v.marks.length > 0 ? v.marks : undefined,
});

const sameValue = (a: RichValue, b: RichValue): boolean =>
  a.text === b.text && JSON.stringify(a.marks) === JSON.stringify(b.marks);

interface SelectionBar extends TextRange {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

export function BlokSatiri({
  block,
  depth,
  number,
  hasChildren,
  focus,
  dragging,
  dragActive,
  dropPlace,
  eylem,
  onOdaklandi,
}: {
  block: Block;
  depth: number;
  number: number;
  hasChildren: boolean;
  /** Bu bloğa odaklanılmalı (yeni eklendi, komşudan gelindi). */
  focus: FocusRequest | null;
  /** This block is the one being dragged. */
  dragging: boolean;
  /** Some block is being dragged, so this row is a drop target. */
  dragActive: boolean;
  /** Where the drop line shows on this row. */
  dropPlace: DropPlace | null;
  eylem: BlokEylemleri;
  onOdaklandi: () => void;
}) {
  const [deger, setDeger] = useState<RichValue>(() => valueOf(block));
  const [slash, setSlash] = useState<{ start: number; end: number; selected: number } | null>(null);
  const [secim, setSecim] = useState<SelectionBar | null>(null);
  const alan = useRef<RichTextHandle>(null);
  const satir = useRef<HTMLDivElement>(null);
  const zaman = useRef<number | undefined>(undefined);
  // En son yazılan metin: gecikmeli yazma tetiklendiğinde state bayat olabilir.
  const sonDeger = useRef(deger);
  // A caret position to apply once the next value lands in the DOM.
  const pendingCaret = useRef<number | null>(null);
  // Set right after an inline shortcut closes a run (`**bold**`): the next
  // character typed there is plain, so writing goes on outside the format.
  const leaveFormatAt = useRef<number | null>(null);
  // Eylemler her çizimde yeni nesne; etkiler onlara bağlanırsa her çizimde
  // yeniden kurulur. Güncel hâli ref üstünden okunuyor.
  const eylemRef = useRef(eylem);
  eylemRef.current = eylem;
  const idRef = useRef(block.id);
  idRef.current = block.id;

  const kod = block.type === "code";
  const dosyadaki = valueOf(block);
  const dosyaAnahtari = `${dosyadaki.text}\u0000${JSON.stringify(dosyadaki.marks)}`;

  // Dosya dışarıdan değiştiyse (başka pencere, eşitleme) satır onu alır —
  // ama kullanıcı o sırada yazıyorsa değil: yazdığı silinmesin.
  useEffect(() => {
    if (document.activeElement !== alan.current?.el) {
      setDeger(dosyadaki);
      sonDeger.current = dosyadaki;
    }
    // The key stands for the value: the object itself is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dosyaAnahtari]);

  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    const h = alan.current;
    if (h?.el && document.activeElement === h.el) h.select(pendingCaret.current);
    pendingCaret.current = null;
  }, [deger, block.type]);

  const odakAlindiRef = useRef(onOdaklandi);
  odakAlindiRef.current = onOdaklandi;

  useEffect(() => {
    if (!focus) return;
    const h = alan.current;
    if (!h?.el) return;
    h.focus();
    if (focus.slash) {
      const v = { text: "/", marks: [] };
      setDeger(v);
      sonDeger.current = v;
      pendingCaret.current = 1;
      setSlash({ start: 0, end: 1, selected: 0 });
    } else {
      h.select(focus.caret ?? sonDeger.current.text.length);
      // The merged text may arrive a render later; keep the caret where it was asked.
      if (focus.caret !== undefined) pendingCaret.current = focus.caret;
    }
    odakAlindiRef.current();
  }, [focus]);

  const zamaniTemizle = () => {
    window.clearTimeout(zaman.current);
    zaman.current = undefined;
  };

  /** Sets the row's own value without scheduling a write: the caller writes. */
  const metniKoy = (v: RichValue) => {
    zamaniTemizle();
    setDeger(v);
    sonDeger.current = v;
  };

  const yazNow = (v: RichValue) => {
    zamaniTemizle();
    if (!sameValue(v, dosyadaki)) eylem.yaz(block.id, valuePatch(v));
  };

  const yazGecikmeli = (v: RichValue) => {
    window.clearTimeout(zaman.current);
    zaman.current = window.setTimeout(() => {
      zaman.current = undefined;
      eylemRef.current.yaz(idRef.current, valuePatch(v));
    }, YAZMA_GECIKMESI);
  };

  // Satır ekrandan kalkarken bekleyen yazma kaybolmasın. Yalnızca sökülmede:
  // bağımlılığı olan bir etki her çizimde yazar ve kendini tetiklerdi.
  useEffect(
    () => () => {
      if (zaman.current === undefined) return;
      window.clearTimeout(zaman.current);
      zaman.current = undefined;
      eylemRef.current.yaz(idRef.current, valuePatch(sonDeger.current));
    },
    [],
  );

  const slashItems = slash ? searchBlockTypes(deger.text.slice(slash.start + 1, slash.end)) : [];

  const degisti = (gelen: RichValue, imlec: number) => {
    let v = gelen;
    let caret = imlec;
    pendingCaret.current = null;
    const onceki = sonDeger.current;
    const yazildi = v.text.length > onceki.text.length;

    const cikis = leaveFormatAt.current;
    leaveFormatAt.current = null;
    if (cikis !== null && v.text.length === onceki.text.length + 1 && caret === cikis + 1) {
      v = { text: v.text, marks: clearMarks(v.marks, cikis, caret, v.text.length) };
    }

    // Markdown kısayolu: işaret silinir, blok tip değiştirir. The mark counts
    // at the start of the line even when text already follows the caret.
    const kisayol = kod || !yazildi ? null : markdownShortcut(v.text.slice(0, caret));
    if (kisayol) {
      const kalan = { text: v.text.slice(caret), marks: sliceMarks(v.marks, caret, v.text.length) };
      setSlash(null);
      metniKoy(kalan);
      if (kisayol.type === "divider") {
        if (kalan.text === "") eylem.toDivider(block.id);
        else {
          eylem.yaz(block.id, valuePatch(kalan));
          eylem.insertBelow(block.id, "divider");
        }
        return;
      }
      pendingCaret.current = 0;
      eylem.yaz(block.id, { type: kisayol.type, ...valuePatch(kalan) });
      return;
    }

    // Inline markdown: a closed `**pair**` becomes the format it spells.
    const ic = kod || !yazildi ? null : inlineShortcut(v.text, v.marks, caret);
    if (ic) {
      v = { text: ic.text, marks: ic.marks };
      caret = ic.caret;
      pendingCaret.current = ic.caret;
      leaveFormatAt.current = ic.caret;
    }

    // "/" at the start of a line or after a space opens the command menu.
    if (slash) {
      if (v.text[slash.start] !== "/" || caret <= slash.start) setSlash(null);
      else if (searchBlockTypes(v.text.slice(slash.start + 1, caret)).length === 0) setSlash(null);
      else setSlash({ start: slash.start, end: caret, selected: 0 });
    } else if (yazildi && !kod && v.text[caret - 1] === "/" && (caret === 1 || /\s/.test(v.text[caret - 2] ?? ""))) {
      setSlash({ start: caret - 1, end: caret, selected: 0 });
    }

    setDeger(v);
    sonDeger.current = v;
    yazGecikmeli(v);
  };

  /** A slash menu pick: the "/query" goes away, then the block converts or a new one opens below. */
  const slashPick = (item: BlockTypeInfo) => {
    if (!slash) return;
    const kalan = spliceText(deger.text, deger.marks, slash.start, slash.end, "");
    const bos = kalan.text.trim() === "";
    setSlash(null);
    metniKoy(bos ? BOS : kalan);
    if (!bos) pendingCaret.current = slash.start;
    if (item.type === "divider") {
      if (bos) eylem.toDivider(block.id);
      else {
        eylem.yaz(block.id, valuePatch(kalan));
        eylem.insertBelow(block.id, "divider");
      }
      return;
    }
    if (bos) {
      eylem.yaz(block.id, { type: item.type, ...valuePatch(BOS) });
      return;
    }
    eylem.yaz(block.id, valuePatch(kalan));
    eylem.insertBelow(block.id, item.type);
  };

  /** Ctrl+B and the toolbar buttons: toggles a format on the selection. */
  const bicim = (key: ToggleKey) => {
    if (kod) return;
    alan.current?.edit((v, r) =>
      r.end > r.start
        ? { value: { text: v.text, marks: toggleMark(v.marks, r.start, r.end, key, v.text.length) }, range: r }
        : null,
    );
  };

  const tuslar = (e: KeyboardEvent<HTMLDivElement>) => {
    const text = deger.text;
    const sel = alan.current?.selection() ?? { start: text.length, end: text.length };
    const bas = sel.start;
    const son = sel.end;

    if (slash && slashItems.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = slashItems.length;
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setSlash({ ...slash, selected: (slash.selected + delta + n) % n });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        slashPick(slashItems[Math.min(slash.selected, slashItems.length - 1)]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSlash(null);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      const key: ToggleKey | null =
        k === "b" && !e.shiftKey ? "bold" : k === "i" && !e.shiftKey ? "italic" : k === "e" && !e.shiftKey ? "code" : k === "s" && e.shiftKey ? "strike" : null;
      if (key) {
        e.preventDefault();
        bicim(key);
        return;
      }
    }

    // Shift+Enter breaks the line inside the block. Kod bloğunda Enter satır
    // atlar: kodun içinde yeni blok açmak anlamsız.
    if (e.key === "Enter" && (e.shiftKey || kod)) {
      e.preventDefault();
      alan.current?.insert("\n");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (bas === 0 && son === 0 && text !== "") {
        yazNow(deger);
        eylem.insertAbove(block.id);
        return;
      }
      const once = { text: text.slice(0, bas), marks: sliceMarks(deger.marks, 0, bas) };
      const sonra = { text: text.slice(son), marks: sliceMarks(deger.marks, son, text.length) };
      // The row shows the left half at once; the write below carries both halves.
      metniKoy(once);
      eylem.enter(block.id, once, sonra);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      yazNow(deger);
      if (e.shiftKey) eylem.cikar(block.id);
      else eylem.girintile(block.id);
      return;
    }
    if (e.key === "Backspace" && bas === 0 && son === 0) {
      e.preventDefault();
      zamaniTemizle();
      eylem.backspaceAtStart(block.id, deger);
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      yazNow(deger);
      eylem.tasi(block.id, e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    // Yukarı/aşağı: metnin ilk/son satırındaysak komşu bloğa geçilir. A block
    // that fits on one visual line hands over from any caret position; a
    // wrapped one only from its very start or end, since wraps cannot be read
    // off the text.
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    const el = e.currentTarget;
    const tekSatir = el.scrollHeight < parseFloat(getComputedStyle(el).lineHeight) * 2;
    if (e.key === "ArrowUp" && !text.slice(0, bas).includes("\n") && (bas === 0 || tekSatir)) {
      e.preventDefault();
      yazNow(deger);
      eylem.odakKomsu(block.id, -1);
    }
    if (e.key === "ArrowDown" && !text.slice(son).includes("\n") && (son === text.length || tekSatir)) {
      e.preventDefault();
      yazNow(deger);
      eylem.odakKomsu(block.id, 1);
    }
  };

  /** The format toolbar follows a non-empty selection inside this block. */
  const secimDegisti = (range: TextRange | null) => {
    if (kod || !range || range.end <= range.start) {
      setSecim((mevcut) => (mevcut === null ? mevcut : null));
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    setSecim({ ...range, left: r.left, top: r.top, bottom: r.bottom, width: r.width });
  };

  const odakGitti = (e: FocusEvent<HTMLDivElement>) => {
    setSlash(null);
    yazNow(deger);
    // Focus moving into the link field is not leaving the block.
    const hedef = e.relatedTarget as HTMLElement | null;
    if (!hedef?.closest?.(`[${TOOLBAR_ATTR}]`)) setSecim(null);
  };

  const menu = (e: MouseEvent) => {
    e.preventDefault();
    eylem.menu(block.id, e.clientX, e.clientY);
  };

  const dropTarget = dragActive
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move" as const;
          const r = e.currentTarget.getBoundingClientRect();
          eylem.dragOver(block.id, e.clientY < r.top + r.height / 2 ? "before" : "after");
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          eylem.drop();
        },
      }
    : {};

  const sinif = [
    s.satir,
    dragging && s.rowDragging,
    dropPlace === "before" && s.dropBefore,
    dropPlace === "after" && s.dropAfter,
  ]
    .filter(Boolean)
    .join(" ");

  const metinli = block.type !== "divider" && block.type !== "unknown";

  const kabuk = (icerik: ReactNode) => (
    <div
      ref={satir}
      className={sinif}
      data-type={block.type}
      style={{ paddingLeft: depth * GIRINTI, "--indent": `${depth * GIRINTI}px` } as CSSProperties}
      onContextMenu={menu}
      {...dropTarget}
    >
      <div className={s.handles} style={{ left: depth * GIRINTI - 48 }}>
        <button
          type="button"
          className={s.tutamak}
          aria-label="Altına blok ekle"
          title="Altına blok ekle"
          onClick={() => {
            if (metinli) yazNow(deger);
            eylem.insertBelow(block.id, "paragraph", true);
          }}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className={`${s.tutamak} ${s.grip}`}
          aria-label="Blok menüsü"
          title="Sürükle: taşı · Tıkla: menü"
          draggable
          onClick={(e) => eylem.menu(block.id, e.clientX, e.clientY)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", "");
            if (satir.current) e.dataTransfer.setDragImage(satir.current, 48, 12);
            if (metinli) yazNow(deger);
            eylem.dragStart(block.id);
          }}
          onDragEnd={() => eylem.dragEnd()}
        >
          <GripVertical size={16} />
        </button>
      </div>
      {icerik}
    </div>
  );

  if (block.type === "divider") {
    return kabuk(
      <div className={s.ayracKutu}>
        <hr className={s.ayrac} />
      </div>,
    );
  }

  if (block.type === "unknown") {
    const tur = (block.raw as { type?: string } | undefined)?.type ?? "bilinmeyen";
    return kabuk(
      <div className={s.bilinmeyen} title="Argos bu blok tipini çizmiyor; Notion'daki hâli olduğu gibi korunuyor">
        <code>{tur}</code>
        {block.text && <span>{block.text}</span>}
      </div>,
    );
  }

  const anchor = slash && slashItems.length > 0 ? alan.current?.el?.getBoundingClientRect() : undefined;

  return kabuk(
    <div className={s.content}>
      {block.type === "toggle" && (
        <button
          type="button"
          className={s.katla}
          aria-expanded={!block.collapsed}
          aria-label={block.collapsed ? "Aç" : "Kapat"}
          onClick={() => eylem.yaz(block.id, { collapsed: !block.collapsed })}
        >
          {block.collapsed || !hasChildren ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
      )}
      {block.type === "bulleted" && <span className={`${s.madde} ${s.bullet}`}>•</span>}
      {block.type === "numbered" && <span className={s.madde}>{number}.</span>}
      {block.type === "todo" && (
        <span className={s.todoBox}>
          <button
            type="button"
            className={block.checked ? `${s.kutucuk} ${s.kutucukDolu}` : s.kutucuk}
            aria-label={block.checked ? "İşareti kaldır" : "Tamamlandı işaretle"}
            aria-pressed={block.checked}
            onClick={() => eylem.yaz(block.id, { checked: !block.checked })}
          >
            <Check size={12} strokeWidth={3} />
          </button>
        </span>
      )}
      {block.type === "callout" && <span className={s.calloutIkon}>💡</span>}
      <RichText
        ref={alan}
        value={deger}
        plain={kod}
        className={`${s.alan} ${block.type === "todo" && block.checked ? s.bitti : ""}`}
        placeholder={YER_TUTUCU[block.type] ?? ""}
        onChange={degisti}
        onKeyDown={tuslar}
        onBlur={odakGitti}
        onSelection={secimDegisti}
      />
      {slash && anchor && (
        <SlashMenu
          anchor={anchor}
          items={slashItems}
          selected={Math.min(slash.selected, slashItems.length - 1)}
          onPick={slashPick}
          onHover={(i) => setSlash({ ...slash, selected: i })}
        />
      )}
      {secim && !slash && (
        <FormatToolbar
          anchor={secim}
          active={{
            bold: rangeHas(deger.marks, secim.start, secim.end, "bold"),
            italic: rangeHas(deger.marks, secim.start, secim.end, "italic"),
            strike: rangeHas(deger.marks, secim.start, secim.end, "strike"),
            code: rangeHas(deger.marks, secim.start, secim.end, "code"),
          }}
          link={linkAt(deger.marks, secim.start, secim.end)}
          onToggle={bicim}
          onLink={(url) => {
            const range = { start: secim.start, end: secim.end };
            setSecim(null);
            alan.current?.edit((v) => ({
              value: { text: v.text, marks: setLink(v.marks, range.start, range.end, url, v.text.length) },
              range,
            }));
          }}
          onClose={(restore) => {
            const range = { start: secim.start, end: secim.end };
            setSecim(null);
            if (!restore) return;
            alan.current?.focus();
            alan.current?.select(range.start, range.end);
          }}
        />
      )}
    </div>,
  );
}
