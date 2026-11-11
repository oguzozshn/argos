import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import { fromSegments, spliceText, toSegments, type Mark, type MarkFormat, type Segment } from "@ortak/sayfa-marks";
import s from "./sayfalar.module.css";

/**
 * One block's text box, with inline formatting.
 *
 * A textarea cannot draw bold or links, so this is a `contentEditable`. The
 * browser still does what it is good at — typing, deleting, the caret, IME —
 * and everything else goes through the model: the DOM is read back into plain
 * text plus mark runs after every input, and written from them whenever the
 * value coming in differs from what is on screen.
 *
 * `plaintext-only` keeps the browser from inventing markup of its own: no
 * native Ctrl+B, no pasted HTML, no `<div>` per line. The only elements in
 * here are the spans this file writes.
 */

export interface RichValue {
  text: string;
  marks: Mark[];
}

export interface TextRange {
  start: number;
  end: number;
}

export interface RichTextHandle {
  el: HTMLDivElement | null;
  focus: () => void;
  /** The selection as text offsets; null when it is not inside this box. */
  selection: () => TextRange | null;
  select: (start: number, end?: number) => void;
  /**
   * A model edit from outside (toolbar, shortcuts): gets the current value and
   * selection, returns the new value and where the selection should end up.
   */
  edit: (f: (value: RichValue, range: TextRange) => { value: RichValue; range: TextRange } | null) => void;
  /** Replaces the selection with plain text: Shift+Enter's line break. */
  insert: (text: string) => void;
}

// While the mouse button is down the selection is still being dragged out;
// reporting it then would make the format toolbar chase the pointer. One pair
// of listeners for the whole document, not one per block.
let pointerDown = false;
if (typeof document !== "undefined") {
  const release = () => {
    pointerDown = false;
    document.dispatchEvent(new Event("selectionchange"));
  };
  document.addEventListener("pointerdown", () => (pointerDown = true), true);
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true);
}

const keyOf = (v: RichValue): string => `${v.text}\u0000${JSON.stringify(v.marks)}`;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toHtml(value: RichValue): string {
  const html = toSegments(value.text, value.marks)
    .map((seg) => {
      const attrs = [
        seg.bold && "data-b",
        seg.italic && "data-i",
        seg.strike && "data-s",
        seg.code && "data-c",
        seg.link && `data-a="${escapeHtml(seg.link)}" title="${escapeHtml(seg.link)} — Ctrl+tık ile aç"`,
      ].filter(Boolean);
      const text = escapeHtml(seg.text);
      return attrs.length === 0 ? text : `<span ${attrs.join(" ")}>${text}</span>`;
    })
    .join("");
  // A trailing line break draws no line of its own; the extra <br> gives the caret somewhere to sit.
  return value.text.endsWith("\n") ? `${html}<br>` : html;
}

function fromDom(root: HTMLElement): RichValue {
  const segments: Segment[] = [];
  const walk = (node: Node, format: MarkFormat) => {
    if (node.nodeType === Node.TEXT_NODE) {
      segments.push({ text: (node as Text).data, ...format });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      segments.push({ text: "\n", ...format });
      return;
    }
    const link = node.getAttribute("data-a");
    const inner: MarkFormat = {
      ...format,
      ...(node.hasAttribute("data-b") ? { bold: true as const } : {}),
      ...(node.hasAttribute("data-i") ? { italic: true as const } : {}),
      ...(node.hasAttribute("data-s") ? { strike: true as const } : {}),
      ...(node.hasAttribute("data-c") ? { code: true as const } : {}),
      ...(link ? { link } : {}),
    };
    node.childNodes.forEach((child) => walk(child, inner));
  };
  root.childNodes.forEach((child) => walk(child, {}));
  const value = fromSegments(segments);
  // The placeholder <br> (ours, or the one the browser leaves in an emptied box) is not text.
  if (root.lastChild?.nodeName === "BR" && value.text.endsWith("\n")) {
    return spliceText(value.text, value.marks, value.text.length - 1, value.text.length, "");
  }
  return value;
}

const lengthOf = (node: Node): number => {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data.length;
  if (node.nodeName === "BR") return 1;
  let n = 0;
  node.childNodes.forEach((child) => (n += lengthOf(child)));
  return n;
};

/** A DOM position inside the box as a text offset. */
function offsetOf(root: HTMLElement, target: Node, targetOffset: number): number {
  let total = 0;
  let found = false;
  const walk = (node: Node) => {
    if (found) return;
    if (node === target) {
      found = true;
      if (node.nodeType === Node.TEXT_NODE) total += targetOffset;
      else for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) total += lengthOf(node.childNodes[i]!);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) total += (node as Text).data.length;
    else if (node.nodeName === "BR") total += 1;
    else node.childNodes.forEach(walk);
  };
  walk(root);
  return total;
}

/**
 * A text offset as a DOM position. On a boundary between two pieces the end
 * of the earlier one wins, so typing right after bold text stays bold — the
 * same choice every editor makes.
 */
function locate(root: HTMLElement, offset: number): { node: Node; offset: number } {
  let left = offset;
  let hit: { node: Node; offset: number } | null = null;
  const walk = (node: Node) => {
    if (hit) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const n = (node as Text).data.length;
      if (left <= n) hit = { node, offset: left };
      else left -= n;
      return;
    }
    if (node.nodeName === "BR") {
      if (left === 0) hit = { node: node.parentNode!, offset: Array.prototype.indexOf.call(node.parentNode!.childNodes, node) };
      else left -= 1;
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return hit ?? { node: root, offset: root.childNodes.length };
}

function readSelection(root: HTMLElement): TextRange | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const a = offsetOf(root, sel.anchorNode, sel.anchorOffset);
  const b = offsetOf(root, sel.focusNode, sel.focusOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function writeSelection(root: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const from = locate(root, start);
  const to = end === start ? from : locate(root, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function RichText({
  ref,
  value,
  plain,
  className,
  placeholder,
  onChange,
  onKeyDown,
  onBlur,
  onSelection,
}: {
  ref?: Ref<RichTextHandle>;
  value: RichValue;
  /** Code blocks: marks are neither drawn nor kept. */
  plain?: boolean;
  className?: string;
  placeholder?: string;
  /** `caret` is where the caret stands after the change. */
  onChange: (value: RichValue, caret: number) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
  /** Fires as the selection moves inside the box; null once it leaves. */
  onSelection?: (range: TextRange | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  // What the DOM currently shows. Input updates it without touching the DOM,
  // so the browser's own edit is never overwritten by an identical render.
  const shown = useRef<string | null>(null);
  // Where the selection should land after the next write; set by model edits.
  const wanted = useRef<TextRange | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;

  const clean = (v: RichValue): RichValue => (plain ? { text: v.text, marks: [] } : v);

  useLayoutEffect(() => {
    const root = el.current;
    if (!root) return;
    const next = clean(value);
    const key = keyOf(next);
    const range = wanted.current;
    wanted.current = null;
    if (key !== shown.current) {
      const focused = document.activeElement === root;
      const before = range ?? (focused ? readSelection(root) : null);
      root.innerHTML = toHtml(next);
      shown.current = key;
      if (before && (focused || range)) {
        const n = next.text.length;
        writeSelection(root, Math.min(before.start, n), Math.min(before.end, n));
      }
    } else if (range) {
      writeSelection(root, range.start, range.end);
    }
  });

  useEffect(() => {
    const changed = () => {
      const root = el.current;
      if (!root || !onSelectionRef.current) return;
      if (document.activeElement !== root) return;
      onSelectionRef.current(pointerDown ? null : readSelection(root));
    };
    document.addEventListener("selectionchange", changed);
    return () => document.removeEventListener("selectionchange", changed);
  }, []);

  /** Pushes a model edit: the parent stores it, the next render writes it and places the selection. */
  const commit = (next: RichValue, range: TextRange) => {
    wanted.current = range;
    onChangeRef.current(clean(next), range.end);
  };

  const insert = (text: string) => {
    const root = el.current;
    if (!root) return;
    const current = fromDom(root);
    const range = readSelection(root) ?? { start: current.text.length, end: current.text.length };
    const next = spliceText(current.text, current.marks, range.start, range.end, text);
    const at = range.start + text.length;
    commit(next, { start: at, end: at });
  };

  useImperativeHandle(ref, () => ({
    get el() {
      return el.current;
    },
    focus: () => el.current?.focus(),
    selection: () => (el.current ? readSelection(el.current) : null),
    select: (start, end = start) => {
      const root = el.current;
      if (!root) return;
      const n = lengthOf(root);
      writeSelection(root, Math.min(start, n), Math.min(end, n));
    },
    edit: (f) => {
      const root = el.current;
      if (!root) return;
      const current = valueRef.current;
      const range = readSelection(root) ?? { start: current.text.length, end: current.text.length };
      const result = f(current, range);
      if (!result) return;
      root.focus();
      commit(result.value, result.range);
    },
    insert,
  }));

  const input = () => {
    const root = el.current;
    if (!root) return;
    const next = clean(fromDom(root));
    // An emptied box keeps a stray <br>; without clearing it the placeholder would not show.
    if (next.text === "" && root.firstChild) root.innerHTML = "";
    shown.current = keyOf(next);
    wanted.current = null;
    onChangeRef.current(next, readSelection(root)?.start ?? next.text.length);
  };

  const paste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (text !== "") insert(text);
  };

  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const link = (e.target as HTMLElement).closest?.("[data-a]")?.getAttribute("data-a");
    if (!link) return;
    e.preventDefault();
    window.open(link, "_blank", "noopener");
  };

  return (
    <div
      ref={el}
      className={className ? `${s.rich} ${className}` : s.rich}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      spellCheck={false}
      data-placeholder={placeholder}
      onInput={input}
      onPaste={paste}
      onClick={click}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      // Dragged text would arrive as markup-free text too, but a block drag must not land in here.
      onDrop={(e) => e.preventDefault()}
    />
  );
}
