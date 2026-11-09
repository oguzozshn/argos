import { Check, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { markdownShortcut, type Block } from "@ortak/sayfalar";
import s from "./sayfalar.module.css";

/**
 * Tek blok satırı. Her blok kendi `textarea`'sı: tek bir contentEditable
 * gövde yerine blok başına alan tutmak, Notion'ın da yaptığı gibi, imleç ve
 * geri alma işini tarayıcıya bırakıyor.
 *
 * Metin satırın kendi durumunda duruyor ve dosyaya gecikmeli yazılıyor:
 * her tuşa basışta sayfa dosyasını baştan yazmak, OneDrive'ın izlediği bir
 * klasörde yazarken takılmaya yol açardı.
 */

/** Yazarken dosyaya yazma gecikmesi. Enter, Tab ve odak kaybı beklemeden yazar. */
const YAZMA_GECIKMESI = 400;

export interface BlokEylemleri {
  yaz: (id: string, patch: Partial<Block>) => void;
  /** Enter: imlecin solu bu blokta kalır, sağı yeni bloğa geçer. */
  enter: (id: string, once: string, sonra: string) => void;
  /** Boş blokta Backspace. */
  sil: (id: string) => void;
  girintile: (id: string) => void;
  cikar: (id: string) => void;
  tasi: (id: string, delta: -1 | 1) => void;
  odakKomsu: (id: string, delta: -1 | 1) => void;
  menu: (id: string, x: number, y: number) => void;
}

const YER_TUTUCU: Partial<Record<Block["type"], string>> = {
  paragraph: "Yazmaya başla, '/' yerine markdown: # başlık, - madde, [] yapılacak",
  heading1: "Başlık",
  heading2: "Başlık",
  heading3: "Başlık",
  code: "kod",
  toggle: "Katlanır başlık",
  callout: "Not",
  quote: "Alıntı",
};

export function BlokSatiri({
  block,
  depth,
  number,
  hasChildren,
  odakli,
  eylem,
  onOdaklandi,
}: {
  block: Block;
  depth: number;
  number: number;
  hasChildren: boolean;
  /** Bu bloğa odaklanılmalı (yeni eklendi, komşudan gelindi). */
  odakli: boolean;
  eylem: BlokEylemleri;
  onOdaklandi: () => void;
}) {
  const [text, setText] = useState(block.text);
  const alan = useRef<HTMLTextAreaElement>(null);
  const zaman = useRef<number | undefined>(undefined);
  // En son yazılan metin: gecikmeli yazma tetiklendiğinde state bayat olabilir.
  const sonMetin = useRef(block.text);
  // Eylemler her çizimde yeni nesne; etkiler onlara bağlanırsa her çizimde
  // yeniden kurulur. Güncel hâli ref üstünden okunuyor.
  const eylemRef = useRef(eylem);
  eylemRef.current = eylem;
  const idRef = useRef(block.id);
  idRef.current = block.id;

  // Dosya dışarıdan değiştiyse (başka pencere, eşitleme) satır onu alır —
  // ama kullanıcı o sırada yazıyorsa değil: yazdığı silinmesin.
  useEffect(() => {
    if (document.activeElement !== alan.current) {
      setText(block.text);
      sonMetin.current = block.text;
    }
  }, [block.text]);

  useLayoutEffect(() => {
    const el = alan.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, block.type]);

  const odakAlindiRef = useRef(onOdaklandi);
  odakAlindiRef.current = onOdaklandi;

  useEffect(() => {
    if (!odakli) return;
    const el = alan.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    odakAlindiRef.current();
  }, [odakli]);

  const yazNow = (metin: string) => {
    window.clearTimeout(zaman.current);
    zaman.current = undefined;
    if (metin !== block.text) eylem.yaz(block.id, { text: metin });
  };

  const yazGecikmeli = (metin: string) => {
    window.clearTimeout(zaman.current);
    zaman.current = window.setTimeout(() => {
      zaman.current = undefined;
      eylemRef.current.yaz(idRef.current, { text: metin });
    }, YAZMA_GECIKMESI);
  };

  // Satır ekrandan kalkarken bekleyen yazma kaybolmasın. Yalnızca sökülmede:
  // bağımlılığı olan bir etki her çizimde yazar ve kendini tetiklerdi.
  useEffect(
    () => () => {
      if (zaman.current === undefined) return;
      window.clearTimeout(zaman.current);
      zaman.current = undefined;
      eylemRef.current.yaz(idRef.current, { text: sonMetin.current });
    },
    [],
  );

  const degisti = (metin: string) => {
    // Markdown kısayolu: işaret silinir, blok tip değiştirir.
    const kisayol = block.type === "code" ? null : markdownShortcut(metin);
    if (kisayol) {
      window.clearTimeout(zaman.current);
      zaman.current = undefined;
      setText(kisayol.text);
      sonMetin.current = kisayol.text;
      eylem.yaz(block.id, { type: kisayol.type, text: kisayol.text });
      return;
    }
    setText(metin);
    sonMetin.current = metin;
    yazGecikmeli(metin);
  };

  const tuslar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const bas = el.selectionStart;
    const son = el.selectionEnd;

    // Kod bloğunda Enter satır atlar: kodun içinde yeni blok açmak anlamsız.
    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
      e.preventDefault();
      yazNow(text.slice(0, bas));
      eylem.enter(block.id, text.slice(0, bas), text.slice(son));
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      yazNow(text);
      if (e.shiftKey) eylem.cikar(block.id);
      else eylem.girintile(block.id);
      return;
    }
    if (e.key === "Backspace" && bas === 0 && son === 0) {
      // Girintili blok önce bir seviye çıkar — Notion'ın davranışı; boş blok silinir.
      if (depth > 0) {
        e.preventDefault();
        eylem.cikar(block.id);
        return;
      }
      if (text === "") {
        e.preventDefault();
        eylem.sil(block.id);
        return;
      }
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      yazNow(text);
      eylem.tasi(block.id, e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    // Yukarı/aşağı: metnin ilk/son satırındaysak komşu bloğa geçilir.
    if (e.key === "ArrowUp" && bas === 0) {
      e.preventDefault();
      yazNow(text);
      eylem.odakKomsu(block.id, -1);
    }
    if (e.key === "ArrowDown" && bas === text.length) {
      e.preventDefault();
      yazNow(text);
      eylem.odakKomsu(block.id, 1);
    }
  };

  const menu = (e: MouseEvent) => {
    e.preventDefault();
    eylem.menu(block.id, e.clientX, e.clientY);
  };

  if (block.type === "divider") {
    return (
      <div className={s.satir} style={{ paddingLeft: depth * 24 }} onContextMenu={menu}>
        <Tutamak onClick={(e) => eylem.menu(block.id, e.clientX, e.clientY)} />
        <hr className={s.ayrac} />
      </div>
    );
  }

  if (block.type === "unknown") {
    const tur = (block.raw as { type?: string } | undefined)?.type ?? "bilinmeyen";
    return (
      <div className={s.satir} style={{ paddingLeft: depth * 24 }} onContextMenu={menu}>
        <Tutamak onClick={(e) => eylem.menu(block.id, e.clientX, e.clientY)} />
        <div className={s.bilinmeyen} title="Argos bu blok tipini çizmiyor; Notion'daki hâli olduğu gibi korunuyor">
          <code>{tur}</code>
          {block.text && <span>{block.text}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={s.satir} style={{ paddingLeft: depth * 24 }} onContextMenu={menu}>
      <Tutamak onClick={(e) => eylem.menu(block.id, e.clientX, e.clientY)} />
      {block.type === "toggle" && (
        <button
          type="button"
          className={s.katla}
          aria-expanded={!block.collapsed}
          aria-label={block.collapsed ? "Aç" : "Kapat"}
          onClick={() => eylem.yaz(block.id, { collapsed: !block.collapsed })}
        >
          {block.collapsed || !hasChildren ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
      {block.type === "bulleted" && <span className={s.madde}>•</span>}
      {block.type === "numbered" && <span className={s.madde}>{number}.</span>}
      {block.type === "todo" && (
        <button
          type="button"
          className={block.checked ? `${s.kutucuk} ${s.kutucukDolu}` : s.kutucuk}
          aria-label={block.checked ? "İşareti kaldır" : "Tamamlandı işaretle"}
          aria-pressed={block.checked}
          onClick={() => eylem.yaz(block.id, { checked: !block.checked })}
        >
          <Check size={11} strokeWidth={3} />
        </button>
      )}
      {block.type === "callout" && <span className={s.calloutIkon}>💡</span>}
      <textarea
        ref={alan}
        rows={1}
        spellCheck={false}
        className={`${s.alan} ${s[block.type] ?? ""} ${block.type === "todo" && block.checked ? s.bitti : ""}`}
        value={text}
        placeholder={YER_TUTUCU[block.type] ?? ""}
        onChange={(e) => degisti(e.target.value)}
        onBlur={() => yazNow(text)}
        onKeyDown={tuslar}
      />
    </div>
  );
}

/** Satırın solundaki tutamak: menüyü açar. Sol boşlukta durur, hover'da görünür. */
function Tutamak({ onClick }: { onClick: (e: MouseEvent) => void }) {
  return (
    <button type="button" className={s.tutamak} aria-label="Blok menüsü" title="Blok menüsü" onClick={onClick}>
      <GripVertical size={14} />
    </button>
  );
}
