import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { BlockTypeInfo } from "./blockTypes";
import s from "./sayfalar.module.css";

/**
 * The "/" command menu. Focus never leaves the block being typed in: the
 * block's own key handler moves the selection and picks, this only draws the
 * list. That is why the rows cancel `mousedown` — a click must not blur the
 * textarea, which would close the menu before the click lands.
 */
export function SlashMenu({
  anchor,
  items,
  selected,
  onPick,
  onHover,
}: {
  /** The block's text box on screen; the menu opens under it, or above if there is no room. */
  anchor: { left: number; top: number; bottom: number };
  items: BlockTypeInfo[];
  selected: number;
  onPick: (item: BlockTypeInfo) => void;
  onHover: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const below = anchor.bottom + 4;
    const top = below + r.height + margin > window.innerHeight ? anchor.top - r.height - 4 : below;
    el.style.top = `${Math.max(margin, top)}px`;
    el.style.left = `${Math.max(margin, Math.min(anchor.left, window.innerWidth - r.width - margin))}px`;
  });

  useLayoutEffect(() => {
    ref.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return createPortal(
    <div ref={ref} className={s.slashMenu} role="listbox" aria-label="Blok ekle" style={{ left: anchor.left, top: anchor.bottom + 4 }}>
      <div className={s.slashLabel}>Temel bloklar</div>
      {items.map((item, i) => (
        <button
          key={item.type}
          type="button"
          role="option"
          aria-selected={i === selected}
          data-index={i}
          className={i === selected ? `${s.slashItem} ${s.slashItemSelected}` : s.slashItem}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(item)}
        >
          <span className={s.slashIcon}>
            <item.icon size={18} />
          </span>
          <span className={s.slashText}>
            <span className={s.slashName}>{item.name}</span>
            <span className={s.slashDescription}>{item.description}</span>
          </span>
          {item.hint && <span className={s.slashHint}>{item.hint}</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}
