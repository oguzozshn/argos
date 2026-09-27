import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import s from "./popover.module.css";

/**
 * A floating panel at a screen point: context menus, the list menu and later
 * the date picker. It stays inside the window, and closes on Escape, on a
 * click outside or when the window loses focus.
 */
export function Popover({
  x,
  y,
  onClose,
  children,
  className,
  label,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Measure after render and pull the panel back inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    el.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - r.width - margin))}px`;
    el.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - r.height - margin))}px`;
  });

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
    };
    const blur = () => closeRef.current();
    // Capture phase: a right-click elsewhere should close this one before opening the next.
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={className ? `${s.popover} ${className}` : s.popover}
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={s.label}>{children}</div>;
}

export function MenuSeparator() {
  return <div className={s.separator} role="separator" />;
}

export function MenuItem({
  icon,
  children,
  hint,
  danger,
  active,
  onSelect,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
  active?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const cls = [s.item, danger && s.danger, active && s.active].filter(Boolean).join(" ");
  return (
    <button type="button" role="menuitem" className={cls} onClick={onSelect} disabled={disabled}>
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={s.text}>{children}</span>
      {hint && <span className={s.hint}>{hint}</span>}
    </button>
  );
}

/** A row of icon buttons: quick dates, priority flags. */
export function MenuIconRow({ children }: { children: ReactNode }) {
  return <div className={s.iconRow}>{children}</div>;
}

export function MenuIconButton({
  title,
  color,
  active,
  onSelect,
  disabled,
  children,
}: {
  title: string;
  color?: string;
  active?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={active ? `${s.iconButton} ${s.active}` : s.iconButton}
      style={color ? { color } : undefined}
      title={title}
      aria-label={title}
      onClick={onSelect}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
