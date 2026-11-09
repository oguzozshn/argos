/**
 * Sayfa ↔ Notion çevirisi: `node araclar/sayfa-notion-test.mts`
 *
 * Ağ yok: çeviri saf, iddialar Notion'ın gerçek yanıt gövdeleri üzerinden.
 */

import {
  fromNotionBlock,
  iconFromNotionPage,
  iconProperty,
  notionIsNewer,
  plainText,
  richTextForWrite,
  titleFromNotionPage,
  titleProperty,
  toNotionBlock,
  RICH_TEXT_LIMIT,
} from "../src/ortak/sayfa-notion.ts";
import { normalizeDoc, type Block, type PageMeta } from "../src/ortak/sayfalar.ts";

let passed = 0;
let failed = 0;

function eq(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
  }
}

/** Çevrilen bloğu dosyadaki hâline getirir: `fromNotionBlock` yeni blok girdisi veriyor. */
const asBlock = (input: ReturnType<typeof fromNotionBlock>, id = "b-1"): Block =>
  normalizeDoc({ blocks: [{ id, order: 0, parentId: null, collapsed: false, ...input }] }, "p-1").blocks[0]!;

/** Notion'ın bir paragraf yanıtı, okunur alanlarıyla birlikte. */
const notionParagraph = {
  object: "block",
  id: "1a2b",
  created_time: "2026-11-01T10:00:00.000Z",
  last_edited_time: "2026-11-02T10:00:00.000Z",
  has_children: false,
  archived: false,
  type: "paragraph",
  paragraph: {
    rich_text: [
      { type: "text", text: { content: "Düz " }, annotations: { bold: false }, plain_text: "Düz ", href: null },
      { type: "text", text: { content: "kalın" }, annotations: { bold: true }, plain_text: "kalın", href: null },
    ],
    color: "default",
  },
};

console.log("\nNotion → Argos");
const p = asBlock(fromNotionBlock(notionParagraph));
eq("paragraf tipi ve metni", [p.type, p.text], ["paragraph", "Düz kalın"]);
eq("Notion id saklandı", p.notionId, "1a2b");
eq("ham blok saklandı", (p.raw as { id: string }).id, "1a2b");

const todo = asBlock(
  fromNotionBlock({ id: "t1", type: "to_do", to_do: { rich_text: [{ plain_text: "süt al" }], checked: true } }),
);
eq("to_do işareti", [todo.type, todo.text, todo.checked], ["todo", "süt al", true]);

const kod = asBlock(fromNotionBlock({ id: "c1", type: "code", code: { rich_text: [{ plain_text: "x=1" }], language: "python" } }));
eq("kod bloğu dili", [kod.type, kod.lang], ["code", "python"]);

const basliklar = ["heading_1", "heading_2", "heading_3"].map((t) =>
  asBlock(fromNotionBlock({ id: t, type: t, [t]: { rich_text: [{ plain_text: "B" }] } })).type,
);
eq("başlık seviyeleri", basliklar, ["heading1", "heading2", "heading3"]);

const bilinmeyen = asBlock(
  fromNotionBlock({ id: "u1", type: "child_database", child_database: { title: "Görevler" } }),
);
eq("tanınmayan tip unknown olur", bilinmeyen.type, "unknown");
eq("tanınmayan bloğun hamı duruyor", (bilinmeyen.raw as { type: string }).type, "child_database");

console.log("\nArgos → Notion");
eq("ayraç", toNotionBlock(asBlock(fromNotionBlock({ id: "d", type: "divider", divider: {} }))), {
  object: "block",
  type: "divider",
  divider: {},
});

// Metne dokunulmadı: zengin metin aynen gidiyor, kalın yazı kayboluyor mu diye.
const degismeden = toNotionBlock(p) as { paragraph: { rich_text: { annotations?: { bold?: boolean } }[] } };
eq("dokunulmamış metnin biçimi korunur", degismeden.paragraph.rich_text.map((x) => x.annotations?.bold), [false, true]);
eq(
  "okunur alanlar geri gönderilmez",
  Object.keys(degismeden.paragraph.rich_text[0]!),
  ["type", "text", "annotations"],
);

// Metin değişti: biçim gider, metin kalır.
const degisti = toNotionBlock({ ...p, text: "Başka bir şey" }) as { paragraph: { rich_text: unknown[] } };
eq("değişen metin düz gider", degisti.paragraph.rich_text, [{ type: "text", text: { content: "Başka bir şey" } }]);

eq("to_do işareti yazılır", (toNotionBlock(todo) as { to_do: { checked: boolean } }).to_do.checked, true);
eq("dili boş kod bloğu düz metin", (toNotionBlock({ ...kod, lang: "", raw: undefined }) as { code: { language: string } }).code.language, "plain text");

const callout = toNotionBlock(asBlock(fromNotionBlock({ id: "k", type: "callout", callout: { rich_text: [{ plain_text: "not" }], icon: { type: "emoji", emoji: "⚠️" } } })));
eq("callout ikonu korunur", (callout as { callout: { icon: unknown } }).callout.icon, { type: "emoji", emoji: "⚠️" });

const geriYazilan = toNotionBlock(bilinmeyen) as Record<string, unknown>;
eq("tanınmayan blok aynen geri yazılır", geriYazilan["child_database"], { title: "Görevler" });
eq(
  "geri yazılırken okunur alanlar atılır",
  ["id", "created_time", "last_edited_time", "has_children", "archived"].filter((k) => k in geriYazilan),
  [],
);

const altli = toNotionBlock(asBlock(fromNotionBlock({ id: "b", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "üst" }] } })), [
  { object: "block", type: "paragraph", paragraph: { rich_text: [] } },
]);
eq("alt bloklar children'a girer", (altli as { bulleted_list_item: { children: unknown[] } }).bulleted_list_item.children.length, 1);

console.log("\nZengin metin sınırları");
const uzun = "a".repeat(RICH_TEXT_LIMIT + 10);
const bolunmus = richTextForWrite({ text: uzun, raw: undefined });
eq("2000 karakteri aşan metin bölünür", bolunmus.length, 2);
eq("bölünen parçalar birleşince aynı", plainText(bolunmus), uzun);
eq("boş metin boş dizi", richTextForWrite({ text: "", raw: undefined }), []);

console.log("\nSayfa başlığı ve ikonu");
eq("başlık özelliği", titleProperty("Kitaplar"), { title: { title: [{ type: "text", text: { content: "Kitaplar" } }] } });
eq(
  "başlık adı ne olursa olsun tipinden bulunur",
  titleFromNotionPage({ properties: { Ad: { type: "title", title: [{ plain_text: "Defter" }] }, Etiket: { type: "select" } } }),
  "Defter",
);
eq("başlıksız sayfa", titleFromNotionPage({ properties: {} }), "");
eq("emoji ikon okunur", iconFromNotionPage({ icon: { type: "emoji", emoji: "📘" } }), "📘");
eq("resim ikon atlanır", iconFromNotionPage({ icon: { type: "file", file: { url: "x" } } }), "");
eq("ikon yazımı", iconProperty("📘"), { type: "emoji", emoji: "📘" });
eq("ikonsuz sayfa", iconProperty(""), null);

console.log("\nBayatlık");
const sayfa = (notionSyncedAt?: string): PageMeta => ({
  id: "p-1",
  title: "T",
  icon: "",
  parentId: null,
  order: 0,
  createdAt: "",
  updatedAt: "",
  ...(notionSyncedAt ? { notionSyncedAt } : {}),
});
eq("hiç senkronlanmamış sayfa bayat", notionIsNewer(sayfa(), "2026-11-02T10:00:00.000Z"), true);
eq("Notion daha yeni", notionIsNewer(sayfa("2026-11-01T10:00:00.000Z"), "2026-11-02T10:00:00.000Z"), true);
eq("Notion daha eski", notionIsNewer(sayfa("2026-11-03T10:00:00.000Z"), "2026-11-02T10:00:00.000Z"), false);
eq("aynı damga değişmemiş sayılır", notionIsNewer(sayfa("2026-11-02T10:00:00.000Z"), "2026-11-02T10:00:00.000Z"), false);
eq("damgasız yanıt", notionIsNewer(sayfa("2026-11-02T10:00:00.000Z"), null), false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
