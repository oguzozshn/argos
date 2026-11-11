import { Bold, Code, Italic, Link, Strikethrough, Unlink } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ToggleKey } from "@ortak/sayfa-marks";
import s from "./sayfalar.module.css";

/**
 * The small bar that floats over selected text. Its buttons cancel
 * `mousedown` so the selection in the block survives the click; only the link
 * field takes focus, and the block keeps the bar open while it does.
 */

/** Marks the bar in the DOM, so a block can tell "focus moved into my toolbar" from a real blur. */
export const TOOLBAR_ATTR = "data-format-toolbar";

const BUTTONS: { key: ToggleKey; label: string; hint: string; icon: typeof Bold }[] = [
  { key: "bold", label: "Kalın", hint: "Ctrl+B", icon: Bold },
  { key: "italic", label: "İtalik", hint: "Ctrl+I", icon: Italic },
  { key: "strike", label: "Üstü çizili", hint: "Ctrl+Shift+S", icon: Strikethrough },
  { key: "code", label: "Kod", hint: "Ctrl+E", icon: Code },
];

/** "ornek.com" is what people type; a link without a scheme would open nothing. */
export const normalizeUrl = (raw: string): string => {
  const url = raw.trim();
  if (url === "") return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
};

export function FormatToolbar({
  anchor,
  active,
  link,
  onToggle,
  onLink,
  onClose,
}: {
  /** The selection on screen. */
  anchor: { left: number; top: number; bottom: number; width: number };
  active: Record<ToggleKey, boolean>;
  /** The link already on the selection, empty if none. */
  link: string;
  onToggle: (key: ToggleKey) => void;
  /** Empty url removes the link. */
  onLink: (url: string) => void;
  /** `restore` puts the selection back in the block (Escape); a click elsewhere does not. */
  onClose: (restore: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState(link);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const above = anchor.top - r.height - 8;
    const left = anchor.left + anchor.width / 2 - r.width / 2;
    el.style.top = `${above < margin ? anchor.bottom + 8 : above}px`;
    el.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - r.width - margin))}px`;
  });

  return createPortal(
    <div
      ref={ref}
      className={s.formatBar}
      role="toolbar"
      aria-label="Biçim"
      {...{ [TOOLBAR_ATTR]: "" }}
      style={{ left: anchor.left, top: anchor.top }}
      onMouseDown={(e) => {
        // Everything but the link field leaves focus, and with it the selection, in the block.
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {linking ? (
        <form
          className={s.formatLink}
          onSubmit={(e) => {
            e.preventDefault();
            onLink(normalizeUrl(url));
          }}
        >
          <input
            autoFocus
            className={s.formatLinkInput}
            value={url}
            placeholder="Bağlantı yapıştır ya da yaz"
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              e.stopPropagation();
              onClose(true);
            }}
            onBlur={(e) => {
              if (!e.relatedTarget || !ref.current?.contains(e.relatedTarget as Node)) onClose(false);
            }}
          />
          {link && (
            <button type="button" className={s.formatButton} title="Bağlantıyı kaldır" aria-label="Bağlantıyı kaldır" onClick={() => onLink("")}>
              <Unlink size={15} />
            </button>
          )}
        </form>
      ) : (
        <>
          {BUTTONS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={active[b.key] ? `${s.formatButton} ${s.formatButtonActive}` : s.formatButton}
              title={`${b.label} · ${b.hint}`}
              aria-label={b.label}
              aria-pressed={active[b.key]}
              onClick={() => onToggle(b.key)}
            >
              <b.icon size={15} />
            </button>
          ))}
          <span className={s.formatDivider} />
          <button
            type="button"
            className={link ? `${s.formatButton} ${s.formatButtonActive}` : s.formatButton}
            title="Bağlantı"
            aria-label="Bağlantı"
            onClick={() => {
              setUrl(link);
              setLinking(true);
            }}
          >
            <Link size={15} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
