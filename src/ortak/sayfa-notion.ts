// Explicit .ts extensions: this file also runs under plain Node (araclar/sayfa-notion-test.mts).
import { fromSegments, toSegments, type Mark, type Segment } from "./sayfa-marks.ts";
import type { Block, BlockType, NewBlock, PageMeta } from "./sayfalar.ts";

/**
 * Argos sayfaları ↔ Notion blokları. Yalnızca çeviri: ağ yok, durum yok,
 * her şey saf fonksiyon. Senkronun ağ tarafı ileride bunun üstüne gelir.
 *
 * Çevirinin tek zor kuralı şu: Notion'ın modeli Argos'unkinden büyük.
 * 50'yi aşkın blok tipi, zengin metin (kalın, bağlantı, mention, formül),
 * database'ler, synced block'lar var. Hepsini anlamaya çalışmak yerine
 * anlamadığını bozmamak esas alındı:
 *
 *   - Tanınmayan blok `unknown` olur, ham JSON'u `raw`'da durur, geri
 *     yazılırken aynen gönderilir.
 *   - Tanınan bloğun metni Argos'ta değişmediyse zengin metni de `raw`'dan
 *     aynen gider — kalın yazı ve bağlantılar düz metne çevrilip kaybolmaz.
 *   - Metin değiştiyse biçim gider, metin kalır. Düz metin editörünün
 *     dürüst karşılığı bu; sessizce eski biçimi yeni metne giydirmek
 *     yanlış yere kalın yazı koyardı.
 *
 * Since the editor learned inline formatting, the third rule is narrower:
 * bold, italic, strikethrough, inline code and links travel both ways as
 * `marks`. What Argos still cannot draw (colour, underline, mentions,
 * equations) survives only while the block is left untouched.
 */

/** Argos tipi → Notion tipi. İki yöne de aynı tablodan bakılıyor. */
const TO_NOTION: Partial<Record<BlockType, string>> = {
  paragraph: "paragraph",
  heading1: "heading_1",
  heading2: "heading_2",
  heading3: "heading_3",
  bulleted: "bulleted_list_item",
  numbered: "numbered_list_item",
  todo: "to_do",
  toggle: "toggle",
  quote: "quote",
  callout: "callout",
  code: "code",
  divider: "divider",
};

const FROM_NOTION = new Map<string, BlockType>(
  Object.entries(TO_NOTION).map(([argos, notion]) => [notion!, argos as BlockType]),
);

/** Notion'ın tek bir zengin metin parçasına koyduğu üst sınır. */
export const RICH_TEXT_LIMIT = 2000;

interface RichItem {
  type?: string;
  text?: { content?: string; link?: { url: string } | null };
  plain_text?: string;
  href?: string | null;
  annotations?: unknown;
  [k: string]: unknown;
}

interface NotionBlock {
  object?: string;
  id?: string;
  type?: string;
  has_children?: boolean;
  [k: string]: unknown;
}

const body = (b: NotionBlock): Record<string, unknown> =>
  (typeof b.type === "string" ? (b[b.type] as Record<string, unknown> | undefined) : undefined) ?? {};

const richOf = (b: NotionBlock): RichItem[] => {
  const r = body(b)["rich_text"];
  return Array.isArray(r) ? (r as RichItem[]) : [];
};

/** Zengin metnin düz hâli — Notion'ın `plain_text`'i varsa o, yoksa içerik. */
export const plainText = (rich: RichItem[]): string =>
  rich.map((x) => x.plain_text ?? x.text?.content ?? "").join("");

/**
 * Yazmaya giderken okunur alanlar temizlenir: `plain_text` ve `href`'i
 * Notion kendi üretiyor, geri göndermek gereksiz.
 */
function cleanRich(item: RichItem): RichItem {
  const { plain_text: _p, href: _h, ...rest } = item;
  return rest;
}

/** 2000 karakterlik sınır: uzun metin tek parça gönderilemiyor, bölünüyor. */
function asRichText(text: string): RichItem[] {
  if (text === "") return [];
  const out: RichItem[] = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_LIMIT) {
    out.push({ type: "text", text: { content: text.slice(i, i + RICH_TEXT_LIMIT) } });
  }
  return out;
}

/** The formatting Argos understands, read off Notion's rich text. */
export function marksFromRich(rich: RichItem[]): Mark[] {
  const segments: Segment[] = rich.map((x) => {
    const a = (x.annotations ?? {}) as { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
    const link = x.text?.link?.url ?? x.href ?? "";
    return {
      text: x.plain_text ?? x.text?.content ?? "",
      ...(a.bold ? { bold: true as const } : {}),
      ...(a.italic ? { italic: true as const } : {}),
      ...(a.strikethrough ? { strike: true as const } : {}),
      ...(a.code ? { code: true as const } : {}),
      ...(link ? { link } : {}),
    };
  });
  return fromSegments(segments).marks;
}

/** Formatted text as Notion rich text items; a plain piece carries no annotations at all. */
function segmentsAsRichText(segments: Segment[]): RichItem[] {
  const out: RichItem[] = [];
  for (const s of segments) {
    const annotations = {
      ...(s.bold ? { bold: true } : {}),
      ...(s.italic ? { italic: true } : {}),
      ...(s.strike ? { strikethrough: true } : {}),
      ...(s.code ? { code: true } : {}),
    };
    for (const item of asRichText(s.text)) {
      out.push({
        ...item,
        text: { ...item.text, ...(s.link ? { link: { url: s.link } } : {}) },
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      });
    }
  }
  return out;
}

/**
 * Bloğun Notion'a gidecek zengin metni. Metin dokunulmamışsa Notion'dan
 * geldiği gibi, değiştiyse düz metin olarak.
 *
 * "Untouched" covers the formatting too: the raw rich text goes back only if
 * both the text and the marks still match what Notion sent.
 */
export function richTextForWrite(block: Pick<Block, "text" | "raw" | "marks">): RichItem[] {
  const raw = block.raw as NotionBlock | undefined;
  const marks = block.marks ?? [];
  if (raw) {
    const rich = richOf(raw);
    if (
      rich.length > 0 &&
      plainText(rich) === block.text &&
      JSON.stringify(marksFromRich(rich)) === JSON.stringify(fromSegments(toSegments(block.text, marks)).marks)
    ) {
      return rich.map(cleanRich);
    }
  }
  return segmentsAsRichText(toSegments(block.text, marks));
}

/**
 * Notion'ın verdiği bloğu Argos bloğuna çevirir. Tanınmayan tip `unknown`
 * olur; metni yalnızca ekranda bir şey görünsün diye okunur, yazarken
 * kullanılmaz.
 */
export function fromNotionBlock(raw: unknown): NewBlock {
  const b = (raw ?? {}) as NotionBlock;
  const type = FROM_NOTION.get(b.type ?? "");
  const d = body(b);
  const common = { notionId: typeof b.id === "string" ? b.id : undefined, raw };
  if (!type) return { ...common, type: "unknown", text: plainText(richOf(b)) };
  if (type === "divider") return { ...common, type, text: "" };
  // Code blocks stay plain: Notion highlights them itself and the editor draws no marks there.
  const marks = type === "code" ? [] : marksFromRich(richOf(b));
  return {
    ...common,
    type,
    text: plainText(richOf(b)),
    ...(marks.length > 0 ? { marks } : {}),
    checked: d["checked"] === true,
    lang: typeof d["language"] === "string" ? d["language"] : "",
  };
}

/**
 * Argos bloğunu Notion'ın beklediği gövdeye çevirir. `children` verilirse
 * iç içe yazılır — Notion alt blokları ya bu alanda ya da ayrı bir
 * "append children" çağrısında alıyor.
 *
 * `unknown` blok kendi ham hâliyle döner: Argos onu kurmadı, bozmaya da
 * hakkı yok.
 */
export function toNotionBlock(block: Block, children?: unknown[]): Record<string, unknown> {
  if (block.type === "unknown") return stripReadOnly(block.raw);
  const type = TO_NOTION[block.type];
  if (!type) return stripReadOnly(block.raw);
  const kids = children && children.length > 0 ? { children } : {};
  if (type === "divider") return { object: "block", type, divider: {} };
  const d: Record<string, unknown> = { rich_text: richTextForWrite(block), ...kids };
  if (type === "to_do") d["checked"] = block.checked;
  if (type === "code") {
    // Notion dili zorunlu tutuyor ve bilmediği adı reddediyor; boşsa düz metin.
    d["language"] = block.lang || "plain text";
    delete d["children"];
  }
  if (type === "callout") {
    const icon = (body(block.raw as NotionBlock) as { icon?: unknown })["icon"];
    d["icon"] = icon ?? { type: "emoji", emoji: "💡" };
  }
  return { object: "block", type, [type]: d };
}

/**
 * Notion'ın döndürdüğü ama kabul etmediği alanları atar. Ham bloğu geri
 * yazarken gerekiyor: `id`, `created_time`, `last_edited_by` gibi alanlarla
 * gönderilen istek doğrulama hatası veriyor.
 */
function stripReadOnly(raw: unknown): Record<string, unknown> {
  const b = { ...((raw ?? {}) as NotionBlock) };
  for (const k of [
    "id",
    "created_time",
    "created_by",
    "last_edited_time",
    "last_edited_by",
    "has_children",
    "archived",
    "in_trash",
    "parent",
    "request_id",
  ]) {
    delete b[k];
  }
  return { object: "block", ...b };
}

/* --- sayfa başlığı ve ikonu --------------------------------------------- */

/** Notion sayfasının başlık özelliği, yazmaya hazır. */
export const titleProperty = (title: string): Record<string, unknown> => ({
  title: { title: asRichText(title) },
});

/**
 * Notion sayfasının başlığı. Başlık özelliğinin adı veritabanına göre
 * değişiyor (çoğu "title", kimi "Name"), bu yüzden ada değil tipine bakılır.
 */
export function titleFromNotionPage(page: unknown): string {
  const props = ((page ?? {}) as { properties?: Record<string, { type?: string; title?: RichItem[] }> }).properties ?? {};
  for (const p of Object.values(props)) {
    if (p?.type === "title" && Array.isArray(p.title)) return plainText(p.title);
  }
  return "";
}

/** Notion ikonu → Argos'un sakladığı emoji. Yüklenen resim ikonlar atlanır. */
export function iconFromNotionPage(page: unknown): string {
  const icon = ((page ?? {}) as { icon?: { type?: string; emoji?: string } }).icon;
  return icon?.type === "emoji" && typeof icon.emoji === "string" ? icon.emoji : "";
}

export const iconProperty = (icon: string): Record<string, unknown> | null =>
  icon === "" ? null : { type: "emoji", emoji: icon };

/**
 * Sayfa Notion'a göre bayat mı: Notion'ın `last_edited_time`'ı son senkronda
 * görülenden yeniyse o taraf değişmiş demektir.
 *
 * Notion ETag ya da sürüm numarası vermiyor, elde yalnızca saniye
 * hassasiyetinde bu damga var. Aynı saniyede iki tarafın da yazdığı hâli
 * ayırt edemiyoruz — çözüm blok düzeyinde son-yazan-kazanır olmak zorunda.
 */
export function notionIsNewer(page: PageMeta, lastEditedTime: string | null | undefined): boolean {
  if (!lastEditedTime) return false;
  if (!page.notionSyncedAt) return true;
  return lastEditedTime > page.notionSyncedAt;
}
