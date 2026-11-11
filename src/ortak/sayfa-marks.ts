/**
 * Inline formatting for page blocks: bold, italic, strikethrough, inline code
 * and links.
 *
 * A block keeps its text plain and carries the formatting beside it, as runs
 * over character offsets. Keeping the text plain is deliberate: previews, the
 * Today card and the Notion comparison all read `text` and none of them has
 * to know formatting exists.
 *
 * Everything here is pure. A mark list is always normalized: runs sorted, not
 * overlapping, never empty, and two touching runs with the same format merged.
 */

export interface MarkFormat {
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  /** Link target; the run is a link when this is set. */
  link?: string;
}

export interface Mark extends MarkFormat {
  /** First character of the run. */
  start: number;
  /** One past the last character. */
  end: number;
}

export type ToggleKey = "bold" | "italic" | "strike" | "code";

/** A stretch of text with one format — what the editor draws and what Notion calls a rich text item. */
export interface Segment extends MarkFormat {
  text: string;
}

const formatOf = (m: MarkFormat): MarkFormat => ({
  ...(m.bold ? { bold: true as const } : {}),
  ...(m.italic ? { italic: true as const } : {}),
  ...(m.strike ? { strike: true as const } : {}),
  ...(m.code ? { code: true as const } : {}),
  ...(typeof m.link === "string" && m.link !== "" ? { link: m.link } : {}),
});

const isPlain = (f: MarkFormat): boolean => !f.bold && !f.italic && !f.strike && !f.code && !f.link;

const sameFormat = (a: MarkFormat, b: MarkFormat): boolean =>
  !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic &&
  !!a.strike === !!b.strike &&
  !!a.code === !!b.code &&
  (a.link ?? "") === (b.link ?? "");

/** The format in force at every character, then folded back into runs. */
function fromPerChar(formats: MarkFormat[]): Mark[] {
  const out: Mark[] = [];
  for (let i = 0; i < formats.length; i++) {
    const f = formats[i]!;
    if (isPlain(f)) continue;
    const last = out[out.length - 1];
    if (last && last.end === i && sameFormat(last, f)) last.end = i + 1;
    else out.push({ start: i, end: i + 1, ...formatOf(f) });
  }
  return out;
}

function toPerChar(marks: readonly Mark[], length: number): MarkFormat[] {
  const formats: MarkFormat[] = Array.from({ length }, () => ({}));
  for (const m of marks) {
    const f = formatOf(m);
    for (let i = Math.max(0, m.start); i < Math.min(length, m.end); i++) formats[i] = { ...formats[i], ...f };
  }
  return formats;
}

/** Repairs whatever was read from disk: bad offsets clipped, overlaps and empty runs gone. */
export function normalizeMarks(raw: unknown, length: number): Mark[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.filter(
    (m): m is Mark =>
      typeof m === "object" && m !== null && Number.isInteger((m as Mark).start) && Number.isInteger((m as Mark).end),
  );
  return fromPerChar(toPerChar(ok, length));
}

/** Text and marks as drawable pieces. An unformatted text is a single piece. */
export function toSegments(text: string, marks: readonly Mark[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of normalizeMarks(marks, text.length)) {
    if (m.start > at) out.push({ text: text.slice(at, m.start) });
    out.push({ text: text.slice(m.start, m.end), ...formatOf(m) });
    at = m.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** The inverse of `toSegments`: what the editor reads back from the screen. */
export function fromSegments(segments: readonly Segment[]): { text: string; marks: Mark[] } {
  let text = "";
  const marks: Mark[] = [];
  for (const s of segments) {
    if (s.text === "") continue;
    const f = formatOf(s);
    if (!isPlain(f)) marks.push({ start: text.length, end: text.length + s.text.length, ...f });
    text += s.text;
  }
  return { text, marks: normalizeMarks(marks, text.length) };
}

/** Whether the whole range already carries the format — decides if a toggle adds or removes. */
export function rangeHas(marks: readonly Mark[], start: number, end: number, key: ToggleKey | "link"): boolean {
  if (end <= start) return false;
  const formats = toPerChar(marks, end);
  for (let i = start; i < end; i++) if (!formats[i]![key]) return false;
  return true;
}

/** Ctrl+B and friends: on if any part of the range lacks the format, off if all of it has it. */
export function toggleMark(marks: readonly Mark[], start: number, end: number, key: ToggleKey, length: number): Mark[] {
  if (end <= start) return normalizeMarks(marks, length);
  const on = !rangeHas(marks, start, end, key);
  const formats = toPerChar(marks, length);
  for (let i = start; i < Math.min(end, length); i++) {
    const { [key]: _old, ...rest } = formats[i]!;
    formats[i] = on ? { ...rest, [key]: true } : rest;
  }
  return fromPerChar(formats);
}

/** Sets or, with an empty url, removes the link on a range. */
export function setLink(marks: readonly Mark[], start: number, end: number, url: string, length: number): Mark[] {
  const formats = toPerChar(marks, length);
  for (let i = start; i < Math.min(end, length); i++) {
    const { link: _old, ...rest } = formats[i]!;
    formats[i] = url === "" ? rest : { ...rest, link: url };
  }
  return fromPerChar(formats);
}

/** The link under a position, if any — the toolbar shows it for editing. */
export function linkAt(marks: readonly Mark[], start: number, end: number): string {
  for (const m of marks) if (m.link && m.start < Math.max(end, start + 1) && m.end > start) return m.link;
  return "";
}

/** Marks of `text.slice(from, to)`, offsets rebased to the slice. Enter splits a block with this. */
export function sliceMarks(marks: readonly Mark[], from: number, to: number): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    const start = Math.max(m.start, from);
    const end = Math.min(m.end, to);
    if (end > start) out.push({ start: start - from, end: end - from, ...formatOf(m) });
  }
  return out;
}

/** Marks of two texts joined: Backspace merging a block into the one above. */
export function concatMarks(first: readonly Mark[], firstLength: number, second: readonly Mark[]): Mark[] {
  const shifted = second.map((m) => ({ ...m, start: m.start + firstLength, end: m.end + firstLength }));
  const length = shifted.reduce((max, m) => Math.max(max, m.end), firstLength);
  return normalizeMarks([...first, ...shifted], length);
}

/**
 * Replaces `[start, end)` with plain text and keeps the marks on both sides in
 * place. Paste and Shift+Enter go through here. Text inserted strictly inside
 * a run takes that run's format, so a line break in the middle of bold text
 * does not cut the bold in two; at the edge of a run it stays plain, so a
 * link does not grow over what is pasted after it.
 */
export function spliceText(
  text: string,
  marks: readonly Mark[],
  start: number,
  end: number,
  insert: string,
): { text: string; marks: Mark[] } {
  const formats = toPerChar(marks, text.length);
  const before = start > 0 ? formats[start - 1]! : null;
  const after = end < text.length ? formats[end]! : null;
  const inherited = before && after && sameFormat(before, after) ? before : {};
  const next = [
    ...formats.slice(0, start),
    ...Array.from({ length: insert.length }, () => inherited),
    ...formats.slice(end),
  ];
  return { text: text.slice(0, start) + insert + text.slice(end), marks: fromPerChar(next) };
}

/**
 * Inline markdown, as Notion does it: closing a `**bold**`, `*italic*`,
 * `~~strike~~` or `` `code` `` pair turns the wrapped text into that format
 * and drops the markers. Checked right after a character is typed, against
 * the text left of the caret.
 */
const INLINE_PATTERNS: { re: RegExp; key: ToggleKey; marker: number }[] = [
  { re: /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, key: "bold", marker: 2 },
  { re: /~~([^~\s](?:[^~]*[^~\s])?)~~$/, key: "strike", marker: 2 },
  { re: /`([^`]+)`$/, key: "code", marker: 1 },
  { re: /(?<![*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, key: "italic", marker: 1 },
  { re: /(?<![_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, key: "italic", marker: 1 },
];

export function inlineShortcut(
  text: string,
  marks: readonly Mark[],
  caret: number,
): { text: string; marks: Mark[]; caret: number } | null {
  const before = text.slice(0, caret);
  for (const { re, key, marker } of INLINE_PATTERNS) {
    const m = re.exec(before);
    if (!m) continue;
    const inner = m[1]!;
    const open = m.index + (m[0].length - inner.length - 2 * marker);
    // Drop the closing marker first so the opening offsets stay valid.
    const closed = spliceText(text, marks, caret - marker, caret, "");
    const opened = spliceText(closed.text, closed.marks, open, open + marker, "");
    const formats = toPerChar(opened.marks, opened.text.length);
    for (let i = open; i < open + inner.length; i++) formats[i] = { ...formats[i], [key]: true };
    return { text: opened.text, marks: fromPerChar(formats), caret: open + inner.length };
  }
  return null;
}

/** Strips every format from a range. The editor uses it to step out of a run that an inline shortcut just closed. */
export function clearMarks(marks: readonly Mark[], start: number, end: number, length: number): Mark[] {
  const formats = toPerChar(marks, length);
  for (let i = Math.max(0, start); i < Math.min(end, length); i++) formats[i] = {};
  return fromPerChar(formats);
}
