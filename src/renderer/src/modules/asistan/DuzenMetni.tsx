import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import s from "./duzen.module.css";

/**
 * Text edited in place (issue #56): it reads like text and saves on blur
 * or Enter (Ctrl+Enter when it spans lines); Esc puts the old text back.
 * Saving per field keeps a file from being written on every key.
 */
export function DuzenMetni({
  deger,
  onKaydet,
  cokSatir = false,
  placeholder,
  etiket,
  className,
}: {
  deger: string;
  onKaydet: (yeni: string) => void;
  cokSatir?: boolean;
  placeholder?: string;
  /** Accessible name. */
  etiket: string;
  className?: string;
}) {
  const [metin, setMetin] = useState(deger);
  const odakta = useRef(false);
  // The file changed (another screen, the old app): show it unless being edited.
  useEffect(() => {
    if (!odakta.current) setMetin(deger);
  }, [deger]);

  const kaydet = () => {
    const yeni = cokSatir ? metin.replace(/\s+$/, "") : metin.trim();
    if (yeni !== deger) onKaydet(yeni);
  };
  const ortak = {
    value: metin,
    placeholder,
    "aria-label": etiket,
    className: [cokSatir ? s.metinAlani : s.metinSatiri, className].filter(Boolean).join(" "),
    onFocus: () => {
      odakta.current = true;
    },
    onBlur: () => {
      odakta.current = false;
      kaydet();
    },
  };
  const tus = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setMetin(deger);
      odakta.current = false;
      // Blur after the reset lands, so the blur does not save the old edit.
      requestAnimationFrame(() => (e.target as HTMLElement).blur());
      e.stopPropagation();
    } else if (e.key === "Enter" && (!cokSatir || e.ctrlKey)) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };

  return cokSatir ? (
    <textarea {...ortak} rows={Math.min(8, Math.max(2, metin.split("\n").length))} onChange={(e) => setMetin(e.target.value)} onKeyDown={tus} />
  ) : (
    <input {...ortak} onChange={(e) => setMetin(e.target.value)} onKeyDown={tus} />
  );
}
