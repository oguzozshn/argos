// Explicit .ts extensions: this file also runs under plain Node (araclar/sayfa-testi.mts).

/**
 * Sayfalar: Notion'daki gibi blok blok yazılan, iç içe geçebilen notlar.
 *
 * İki dosya düzeni var ve ayrı olmalarının sebebi şu: başlık ağacı her
 * ekranda duruyor, sayfanın gövdesi ise yalnızca açıkken. Hepsi tek dosyada
 * olsaydı her tuşa basışta bütün defter baştan yazılırdı — harcama defterinin
 * aya bölünme gerekçesinin aynısı.
 *
 *   pages/pages.json   ağaç: hangi sayfa nerede, adı ne  (PagesFile)
 *   pages/<id>.json    o sayfanın blokları               (PageDoc)
 *
 * Bloklar düz bir dizi; iç içelik `parentId` + `order` ile. Notion'ın kendi
 * modeli de iç içe, ama ağacı dosyada kurmak her düzenlemede derin kopya
 * demekti; düz dizi üzerinde girintileme tek alan değiştirmek.
 *
 * Buradaki her şey saf: dosyanın bir hâlinden sonraki hâline fonksiyon.
 * Okuma/yazma ekranların işi (`useDosya` çakışmayı kendi görür).
 */

export const PAGES_PATH = "pages/pages.json";

/** Bir sayfanın gövde dosyası. Id dosya adına giriyor: `tamYol` zaten kök dışına çıkmayı reddediyor. */
export const pageDocPath = (id: string): string => `pages/${sanitizeId(id)}.json`;

/** Dosya adına girecek id: harf, rakam, tire. Başka bir şey gelirse yol kurulmaz. */
function sanitizeId(id: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error(`geçersiz sayfa id: ${id}`);
  return id;
}

export const newPageId = (d = new Date()): string =>
  `p-${d.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const newBlockId = (d = new Date()): string =>
  `b-${d.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* --- ağaç ---------------------------------------------------------------- */

export interface PageMeta {
  id: string;
  title: string;
  /** Emoji ya da boş. Notion'ın sayfa ikonunun karşılığı. */
  icon: string;
  parentId: string | null;
  order: number;
  createdAt: string;
  /** Son düzenleme (ISO). Bugün kartı ve senkron sırası bunu okuyor. */
  updatedAt: string;
  /** Kenar çubuğunda alt sayfaları kapalı duruyor. */
  collapsed?: boolean;
  /** Notion'daki karşılığı — bağlanmamış sayfada yok. */
  notionId?: string;
  /** Son senkronda Notion'ın verdiği `last_edited_time`. */
  notionSyncedAt?: string;
}

export interface PagesFile {
  version: 1;
  pages: PageMeta[];
}

export const emptyPages = (): PagesFile => ({ version: 1, pages: [] });

export function normalizePages(raw: unknown): PagesFile {
  const pages = (raw as { pages?: Partial<PageMeta>[] } | null)?.pages;
  if (!Array.isArray(pages)) return emptyPages();
  const ok = pages.filter((p): p is Partial<PageMeta> & { id: string } => typeof p?.id === "string");
  const ids = new Set(ok.map((p) => p.id));
  return {
    version: 1,
    pages: ok.map((p, i) => ({
      id: p.id,
      title: typeof p.title === "string" ? p.title : "",
      icon: typeof p.icon === "string" ? p.icon : "",
      // Silinmiş bir üste bağlı kalan sayfa köke çıkar: ağaçtan düşüp
      // görünmez olmasındansa en üstte dursun.
      parentId: typeof p.parentId === "string" && p.parentId !== p.id && ids.has(p.parentId) ? p.parentId : null,
      order: typeof p.order === "number" ? p.order : i,
      createdAt: typeof p.createdAt === "string" ? p.createdAt : "",
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : (p.createdAt ?? ""),
      ...(p.collapsed === true ? { collapsed: true } : {}),
      ...(typeof p.notionId === "string" ? { notionId: p.notionId } : {}),
      ...(typeof p.notionSyncedAt === "string" ? { notionSyncedAt: p.notionSyncedAt } : {}),
    })),
  };
}

const nextOrder = (items: { order: number }[]): number => items.reduce((max, x) => Math.max(max, x.order), -1) + 1;

/** Bir üstün çocukları, sırasıyla. */
export const childPages = (f: PagesFile, parentId: string | null): PageMeta[] =>
  f.pages.filter((p) => p.parentId === parentId).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

/** Sayfa ve bütün altları — silmede ve döngü kontrolünde kullanılıyor. */
export function pageWithDescendants(f: PagesFile, id: string): string[] {
  const out: string[] = [];
  const walk = (x: string) => {
    out.push(x);
    for (const c of f.pages.filter((p) => p.parentId === x)) walk(c.id);
  };
  if (f.pages.some((p) => p.id === id)) walk(id);
  return out;
}

/** Kenar çubuğunun çizdiği düz liste: ağaç gezilmiş, derinlik hesaplanmış, kapalıların altı atlanmış. */
export function pageOutline(f: PagesFile): { page: PageMeta; depth: number; hasChildren: boolean }[] {
  const out: { page: PageMeta; depth: number; hasChildren: boolean }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const page of childPages(f, parentId)) {
      const kids = childPages(f, page.id);
      out.push({ page, depth, hasChildren: kids.length > 0 });
      if (kids.length > 0 && page.collapsed !== true) walk(page.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function addPage(
  f: PagesFile,
  input: { title?: string; icon?: string; parentId?: string | null },
  id: string,
  now: string,
): PagesFile {
  const parentId = input.parentId ?? null;
  const page: PageMeta = {
    id,
    title: input.title ?? "",
    icon: input.icon ?? "",
    parentId,
    order: nextOrder(f.pages.filter((p) => p.parentId === parentId)),
    createdAt: now,
    updatedAt: now,
  };
  return { ...f, pages: [...f.pages, page] };
}

export function updatePage(f: PagesFile, id: string, patch: Partial<Omit<PageMeta, "id">>, now: string): PagesFile {
  return {
    ...f,
    pages: f.pages.map((p) => (p.id === id ? { ...p, ...patch, id: p.id, updatedAt: patch.updatedAt ?? now } : p)),
  };
}

/**
 * Sayfayı başka bir üste taşır. Kendi altına taşımak ağacı koparırdı:
 * reddedilir, dosya olduğu gibi döner.
 */
export function movePage(f: PagesFile, id: string, parentId: string | null, now: string): PagesFile {
  if (id === parentId) return f;
  if (parentId !== null && pageWithDescendants(f, id).includes(parentId)) return f;
  if (!f.pages.some((p) => p.id === id)) return f;
  const order = nextOrder(f.pages.filter((p) => p.parentId === parentId && p.id !== id));
  return updatePage(f, id, { parentId, order }, now);
}

/** Sayfayı ve altındaki her şeyi ağaçtan çıkarır. Gövde dosyalarını çağıran siler. */
export function deletePage(f: PagesFile, id: string): { file: PagesFile; removed: string[] } {
  const removed = pageWithDescendants(f, id);
  return { file: { ...f, pages: f.pages.filter((p) => !removed.includes(p.id)) }, removed };
}

/** Başlıksız sayfa listede "Adsız sayfa" görünür; dosyada boş kalır. */
export const pageTitle = (p: { title: string }): string => (p.title.trim() === "" ? "Adsız sayfa" : p.title);

/* --- bloklar ------------------------------------------------------------- */

/**
 * Argos'un tanıdığı blok tipleri — hepsi Notion'da birebir karşılığı olanlar.
 * Notion'dan gelen başka bir tip `unknown` olur: ham hâliyle saklanır,
 * değiştirilmez ve aynen geri yazılır. Kural bu olmazsa senkron, Argos'un
 * bilmediği her şeyi (database, synced block, embed) silmeye başlar.
 */
export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "unknown";

export const EDITABLE_TYPES: BlockType[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted",
  "numbered",
  "todo",
  "toggle",
  "quote",
  "callout",
  "code",
];

/** Alt blok alabilen tipler — Notion da yalnızca bunların altına çocuk koyuyor. */
export const CONTAINER_TYPES: BlockType[] = ["paragraph", "bulleted", "numbered", "todo", "toggle", "quote", "callout"];

export interface Block {
  id: string;
  parentId: string | null;
  order: number;
  type: BlockType;
  /** Düz metin. Biçimlendirme (kalın, bağlantı) `raw` içinde durur. */
  text: string;
  /** `todo` için. */
  checked: boolean;
  /** `code` için dil adı, Notion'ın yazdığı gibi ("typescript"). */
  lang: string;
  /** Katlanmış `toggle` — görünüm durumu, Notion da dosyasında tutuyor. */
  collapsed: boolean;
  notionId?: string;
  /**
   * Notion'ın verdiği blok, olduğu gibi. İki işi var: tanınmayan tip aynen
   * geri yazılır, tanınan tipin metni değişmediyse zengin metni (kalın,
   * bağlantı, mention) korunur.
   */
  raw?: unknown;
}

export interface PageDoc {
  version: 1;
  id: string;
  blocks: Block[];
}

export const emptyDoc = (id: string): PageDoc => ({ version: 1, id, blocks: [] });

const BLOCK_TYPES = new Set<string>([...EDITABLE_TYPES, "divider", "unknown"]);

export function normalizeDoc(raw: unknown, id: string): PageDoc {
  const blocks = (raw as { blocks?: Partial<Block>[] } | null)?.blocks;
  if (!Array.isArray(blocks)) return emptyDoc(id);
  const ok = blocks.filter((b): b is Partial<Block> & { id: string } => typeof b?.id === "string");
  const ids = new Set(ok.map((b) => b.id));
  return {
    version: 1,
    id,
    blocks: ok.map((b, i) => ({
      id: b.id,
      parentId: typeof b.parentId === "string" && b.parentId !== b.id && ids.has(b.parentId) ? b.parentId : null,
      order: typeof b.order === "number" ? b.order : i,
      type: BLOCK_TYPES.has(b.type as string) ? (b.type as BlockType) : "paragraph",
      text: typeof b.text === "string" ? b.text : "",
      checked: b.checked === true,
      lang: typeof b.lang === "string" ? b.lang : "",
      collapsed: b.collapsed === true,
      ...(typeof b.notionId === "string" ? { notionId: b.notionId } : {}),
      ...(b.raw === undefined ? {} : { raw: b.raw }),
    })),
  };
}

export const childBlocks = (d: PageDoc, parentId: string | null): Block[] =>
  d.blocks.filter((b) => b.parentId === parentId).sort((a, b) => a.order - b.order);

/**
 * Ekranın çizdiği sıra: ağaç gezilmiş, derinlik ve numaralı liste sayacı
 * hesaplanmış. Katlanmış toggle'ın altı listeye girmez — klavye gezinmesi de
 * bu listeyi kullandığı için görünmeyen bloğa imleç gitmez.
 */
export function blockOutline(d: PageDoc): { block: Block; depth: number; number: number; hasChildren: boolean }[] {
  const out: { block: Block; depth: number; number: number; hasChildren: boolean }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    let numbered = 0;
    for (const block of childBlocks(d, parentId)) {
      numbered = block.type === "numbered" ? numbered + 1 : 0;
      const kids = childBlocks(d, block.id);
      out.push({ block, depth, number: numbered, hasChildren: kids.length > 0 });
      if (kids.length > 0 && !(block.type === "toggle" && block.collapsed)) walk(block.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function blockWithDescendants(d: PageDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (x: string) => {
    out.push(x);
    for (const c of d.blocks.filter((b) => b.parentId === x)) walk(c.id);
  };
  if (d.blocks.some((b) => b.id === id)) walk(id);
  return out;
}

export interface NewBlock {
  type?: BlockType;
  text?: string;
  checked?: boolean;
  lang?: string;
  parentId?: string | null;
  notionId?: string;
  raw?: unknown;
}

const makeBlock = (id: string, order: number, input: NewBlock): Block => ({
  id,
  parentId: input.parentId ?? null,
  order,
  type: input.type ?? "paragraph",
  text: input.text ?? "",
  checked: input.checked === true,
  lang: input.lang ?? "",
  collapsed: false,
  ...(input.notionId === undefined ? {} : { notionId: input.notionId }),
  ...(input.raw === undefined ? {} : { raw: input.raw }),
});

/** Sayfanın sonuna blok ekler. */
export function appendBlock(d: PageDoc, input: NewBlock, id: string): PageDoc {
  const parentId = input.parentId ?? null;
  const order = nextOrder(d.blocks.filter((b) => b.parentId === parentId));
  return { ...d, blocks: [...d.blocks, makeBlock(id, order, input)] };
}

/**
 * Verilen bloğun hemen ardına ekler — Enter'ın yaptığı. Araya girdiği için
 * aynı üstteki sonraki bloklar bir kayar; sıra numaraları seyrek değil ardışık
 * kalsın diye yeniden numaralandırmak yerine yalnızca sonrakiler artırılıyor.
 */
export function insertBlockAfter(d: PageDoc, afterId: string, input: NewBlock, id: string): PageDoc {
  const after = d.blocks.find((b) => b.id === afterId);
  if (!after) return appendBlock(d, input, id);
  const parentId = input.parentId === undefined ? after.parentId : input.parentId;
  const order = parentId === after.parentId ? after.order + 1 : nextOrder(d.blocks.filter((b) => b.parentId === parentId));
  const shifted = d.blocks.map((b) => (b.parentId === parentId && b.order >= order ? { ...b, order: b.order + 1 } : b));
  return { ...d, blocks: [...shifted, makeBlock(id, order, { ...input, parentId })] };
}

export function updateBlock(d: PageDoc, id: string, patch: Partial<Omit<Block, "id">>): PageDoc {
  return { ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b)) };
}

/**
 * Bloğu siler. Çocukları silinmez, bir üst seviyeye çıkar: yazarken yanlışlıkla
 * silinen bir başlık bütün alt maddelerini götürmesin.
 */
export function deleteBlock(d: PageDoc, id: string): PageDoc {
  const block = d.blocks.find((b) => b.id === id);
  if (!block) return d;
  return {
    ...d,
    blocks: d.blocks
      .filter((b) => b.id !== id)
      .map((b) => (b.parentId === id ? { ...b, parentId: block.parentId, order: block.order + b.order / 1000 } : b)),
  };
}

/** Bloğu ve altını birden siler — "blok sil" menüsünün yaptığı. */
export function deleteBlockTree(d: PageDoc, id: string): PageDoc {
  const gone = new Set(blockWithDescendants(d, id));
  return { ...d, blocks: d.blocks.filter((b) => !gone.has(b.id)) };
}

/**
 * Tab: blok bir üstteki kardeşinin altına girer. İlk kardeşin girintisi
 * yoktur (üstünde kimse yok), `divider` da girintilenmez.
 */
export function indentBlock(d: PageDoc, id: string): PageDoc {
  const block = d.blocks.find((b) => b.id === id);
  if (!block || block.type === "divider") return d;
  const siblings = childBlocks(d, block.parentId);
  const i = siblings.findIndex((b) => b.id === id);
  const target = i > 0 ? siblings[i - 1] : undefined;
  if (!target || !CONTAINER_TYPES.includes(target.type)) return d;
  const order = nextOrder(d.blocks.filter((b) => b.parentId === target.id));
  return updateBlock(d, id, { parentId: target.id, order });
}

/** Shift+Tab: blok üstünün kardeşi olur, hemen onun ardına. */
export function outdentBlock(d: PageDoc, id: string): PageDoc {
  const block = d.blocks.find((b) => b.id === id);
  if (!block?.parentId) return d;
  const parent = d.blocks.find((b) => b.id === block.parentId);
  if (!parent) return d;
  const order = parent.order + 1;
  const shifted = d.blocks.map((b) => (b.parentId === parent.parentId && b.order >= order ? { ...b, order: b.order + 1 } : b));
  return { ...d, blocks: shifted.map((b) => (b.id === id ? { ...b, parentId: parent.parentId, order } : b)) };
}

/** Bloğu kardeşleri arasında bir yukarı / bir aşağı taşır. */
export function moveBlock(d: PageDoc, id: string, delta: -1 | 1): PageDoc {
  const block = d.blocks.find((b) => b.id === id);
  if (!block) return d;
  const siblings = childBlocks(d, block.parentId);
  const i = siblings.findIndex((b) => b.id === id);
  const other = siblings[i + delta];
  if (!other) return d;
  return {
    ...d,
    blocks: d.blocks.map((b) =>
      b.id === block.id ? { ...b, order: other.order } : b.id === other.id ? { ...b, order: block.order } : b,
    ),
  };
}

/**
 * Markdown kısayolu: satır başında yazılan işaret bloğun tipini değiştirir ve
 * kendisi silinir. Notion'ın yaptığı; alışkanlık buradan geliyor.
 */
export function markdownShortcut(text: string): { type: BlockType; text: string } | null {
  const m = /^(#{1,3}|[-*]|\d+\.|\[\]|\[ \]|>|```|---)\s$/.exec(text) ?? /^(```|---)$/.exec(text);
  if (!m) return null;
  const mark = m[1]!;
  if (mark === "#") return { type: "heading1", text: "" };
  if (mark === "##") return { type: "heading2", text: "" };
  if (mark === "###") return { type: "heading3", text: "" };
  if (mark === "-" || mark === "*") return { type: "bulleted", text: "" };
  if (/^\d+\.$/.test(mark)) return { type: "numbered", text: "" };
  if (mark === "[]" || mark === "[ ]") return { type: "todo", text: "" };
  if (mark === ">") return { type: "toggle", text: "" };
  if (mark === "```") return { type: "code", text: "" };
  if (mark === "---") return { type: "divider", text: "" };
  return null;
}

/**
 * Enter'a basılan bloğun ardına ne gelmeli: liste maddesinden liste maddesi,
 * başlıktan düz paragraf. Notion'ın davranışı.
 */
export const typeAfterEnter = (type: BlockType): BlockType =>
  type === "bulleted" || type === "numbered" || type === "todo" ? type : "paragraph";

/** Dosyaya yazmadan önce: boş başlıksız sayfanın tek boş paragrafı da gereksiz. */
export const docIsEmpty = (d: PageDoc): boolean => d.blocks.every((b) => b.text.trim() === "" && b.type !== "divider");

/** Sayfanın ilk satırları — kenar çubuğu ve Bugün kartı önizleme için okuyor. */
export function docPreview(d: PageDoc, limit = 120): string {
  const text = blockOutline(d)
    .map(({ block }) => block.text.trim())
    .filter((t) => t !== "")
    .join(" · ");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
