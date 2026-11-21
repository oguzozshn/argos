import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import s from "./programs.module.css";

/**
 * A field that saves on blur or Enter (Ctrl+Enter when it spans lines) and
 * puts the old value back on Esc. Saving per field keeps the file from being
 * written on every key.
 */
export function Field({
  value,
  onSave,
  label,
  placeholder,
  multiline = false,
  type = "text",
  className,
  autoFocus,
}: {
  value: string;
  onSave: (next: string) => void;
  /** Accessible name. */
  label: string;
  placeholder?: string;
  multiline?: boolean;
  type?: "text" | "number" | "date";
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  // The file changed elsewhere: show it unless this field is being edited.
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  const save = () => {
    const next = multiline ? text.replace(/\s+$/, "") : text.trim();
    if (next !== value) onSave(next);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setText(value);
      focused.current = false;
      // Blur after the reset lands, so the blur does not save the old edit.
      requestAnimationFrame(() => (e.target as HTMLElement).blur());
      e.stopPropagation();
    } else if (e.key === "Enter" && (!multiline || e.ctrlKey)) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };
  const common = {
    value: text,
    placeholder,
    "aria-label": label,
    title: label,
    autoFocus,
    className: [multiline ? s.fieldArea : s.field, className].filter(Boolean).join(" "),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      save();
    },
  };
  return multiline ? (
    <textarea
      {...common}
      rows={Math.min(10, Math.max(2, text.split("\n").length))}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={keys}
    />
  ) : (
    <input {...common} type={type} onChange={(e) => setText(e.target.value)} onKeyDown={keys} />
  );
}
