/**
 * Sayfa ağacı ve blok modeli: `node araclar/sayfa-testi.mts`
 */

import {
  addPage,
  appendBlock,
  blockOutline,
  childPages,
  deleteBlock,
  deleteBlockTree,
  deletePage,
  docPreview,
  emptyDoc,
  emptyPages,
  indentBlock,
  insertBlockAfter,
  insertBlockBefore,
  markdownShortcut,
  moveBlock,
  moveBlockTo,
  movePage,
  normalizeDoc,
  normalizePages,
  outdentBlock,
  pageDocPath,
  pageOutline,
  pageTitle,
  pageWithDescendants,
  typeAfterEnter,
  updateBlock,
  updatePage,
  type PageDoc,
  type PagesFile,
} from "../src/ortak/sayfalar.ts";

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

function throws(name: string, f: () => unknown): void {
  try {
    f();
    failed++;
    console.log(`  ✗ ${name}: hata beklenirken geçti`);
  } catch {
    passed++;
    console.log(`  ✓ ${name}`);
  }
}

const NOW = "2026-11-09T10:00:00.000Z";
const LATER = "2026-11-09T11:00:00.000Z";

/* --- ağaç ---------------------------------------------------------------- */

console.log("\nSayfa ağacı");

let f: PagesFile = emptyPages();
f = addPage(f, { title: "Kitaplar" }, "p-1", NOW);
f = addPage(f, { title: "Notlar" }, "p-2", NOW);
f = addPage(f, { title: "2026", parentId: "p-1" }, "p-3", NOW);
f = addPage(f, { title: "2025", parentId: "p-1" }, "p-4", NOW);

eq("kökte iki sayfa, eklenme sırasıyla", childPages(f, null).map((p) => p.id), ["p-1", "p-2"]);
eq("alt sayfalar kendi sırasında", childPages(f, "p-1").map((p) => p.id), ["p-3", "p-4"]);
eq(
  "anahat derinlik veriyor",
  pageOutline(f).map((x) => [x.page.id, x.depth, x.hasChildren]),
  [["p-1", 0, true], ["p-3", 1, false], ["p-4", 1, false], ["p-2", 0, false]],
);

const kapali = updatePage(f, "p-1", { collapsed: true }, LATER);
eq("kapalı sayfanın altı anahatta yok", pageOutline(kapali).map((x) => x.page.id), ["p-1", "p-2"]);
eq("düzenleme damgası güncellendi", kapali.pages.find((p) => p.id === "p-1")!.updatedAt, LATER);

eq("kendi altına taşıma reddedilir", movePage(f, "p-1", "p-3", LATER).pages.find((p) => p.id === "p-1")!.parentId, null);
eq("kendine taşıma reddedilir", movePage(f, "p-1", "p-1", LATER), f);
eq("başka üste taşıma", movePage(f, "p-4", "p-2", LATER).pages.find((p) => p.id === "p-4")!.parentId, "p-2");

eq("sayfa ve altları", pageWithDescendants(f, "p-1"), ["p-1", "p-3", "p-4"]);
const silindi = deletePage(f, "p-1");
eq("silme altları da götürür", silindi.removed, ["p-1", "p-3", "p-4"]);
eq("geriye kalan", silindi.file.pages.map((p) => p.id), ["p-2"]);

eq("başlıksız sayfa", pageTitle({ title: "  " }), "Adsız sayfa");
eq("gövde dosyası yolu", pageDocPath("p-1"), "pages/p-1.json");
throws("yol kuralı dışı id reddedilir", () => pageDocPath("../gizli"));

console.log("\nSayfa dosyası onarımı");
eq("bozuk dosya boş ağaç", normalizePages({ nope: 1 }), emptyPages());
const onarilan = normalizePages({
  pages: [
    { id: "a", title: "A", parentId: "yok" },
    { id: "b", parentId: "a", order: "x" },
    { nope: true },
  ],
});
eq(
  "olmayan üst köke çıkar, eksik alanlar dolar, id'siz satır düşer",
  onarilan.pages.map((p) => [p.id, p.parentId, p.title, p.order]),
  [["a", null, "A", 0], ["b", "a", "", 1]],
);

/* --- bloklar ------------------------------------------------------------- */

console.log("\nBloklar");

let d: PageDoc = emptyDoc("p-1");
d = appendBlock(d, { type: "heading1", text: "Başlık" }, "b-1");
d = appendBlock(d, { type: "bulleted", text: "bir" }, "b-2");
d = appendBlock(d, { type: "bulleted", text: "iki" }, "b-3");

eq("sırayla eklendi", blockOutline(d).map((x) => x.block.id), ["b-1", "b-2", "b-3"]);

d = insertBlockAfter(d, "b-2", { type: "bulleted", text: "bir buçuk" }, "b-4");
eq("araya giren blok yerinde", blockOutline(d).map((x) => x.block.id), ["b-1", "b-2", "b-4", "b-3"]);

d = indentBlock(d, "b-4");
eq(
  "girintilenen blok üstünün altına geçti",
  blockOutline(d).map((x) => [x.block.id, x.depth]),
  [["b-1", 0], ["b-2", 0], ["b-4", 1], ["b-3", 0]],
);
eq("ilk kardeş girintilenemez", indentBlock(d, "b-1"), d);

d = outdentBlock(d, "b-4");
eq("geri çıkan blok üstünün ardına", blockOutline(d).map((x) => [x.block.id, x.depth]), [
  ["b-1", 0],
  ["b-2", 0],
  ["b-4", 0],
  ["b-3", 0],
]);

d = moveBlock(d, "b-4", -1);
eq("bir yukarı taşındı", blockOutline(d).map((x) => x.block.id), ["b-1", "b-4", "b-2", "b-3"]);
eq("en üstteki daha yukarı gitmez", moveBlock(d, "b-1", -1), d);

let numarali = emptyDoc("p-2");
numarali = appendBlock(numarali, { type: "numbered", text: "a" }, "n-1");
numarali = appendBlock(numarali, { type: "numbered", text: "b" }, "n-2");
numarali = appendBlock(numarali, { type: "paragraph", text: "ara" }, "n-3");
numarali = appendBlock(numarali, { type: "numbered", text: "c" }, "n-4");
eq("numaralandırma araya giren paragrafta sıfırlanır", blockOutline(numarali).map((x) => x.number), [1, 2, 0, 1]);

let katli = emptyDoc("p-3");
katli = appendBlock(katli, { type: "toggle", text: "aç" }, "t-1");
katli = appendBlock(katli, { type: "paragraph", text: "içerik", parentId: "t-1" }, "t-2");
eq("açık toggle'ın altı görünür", blockOutline(katli).map((x) => x.block.id), ["t-1", "t-2"]);
eq("katlı toggle'ın altı görünmez", blockOutline(updateBlock(katli, "t-1", { collapsed: true })).map((x) => x.block.id), ["t-1"]);

console.log("\nBlok silme");
let silme = emptyDoc("p-4");
silme = appendBlock(silme, { type: "bulleted", text: "üst" }, "s-1");
silme = appendBlock(silme, { type: "bulleted", text: "alt", parentId: "s-1" }, "s-2");
silme = appendBlock(silme, { type: "bulleted", text: "son" }, "s-3");
eq(
  "silinen bloğun çocuğu bir seviye çıkar, kaybolmaz",
  blockOutline(deleteBlock(silme, "s-1")).map((x) => [x.block.id, x.depth]),
  [["s-2", 0], ["s-3", 0]],
);
eq("ağaç silme hepsini götürür", blockOutline(deleteBlockTree(silme, "s-1")).map((x) => x.block.id), ["s-3"]);

console.log("\nMarkdown kısayolları");
eq("# başlık", markdownShortcut("# "), { type: "heading1", text: "" });
eq("### başlık", markdownShortcut("### "), { type: "heading3", text: "" });
eq("- madde", markdownShortcut("- "), { type: "bulleted", text: "" });
eq("1. numaralı", markdownShortcut("1. "), { type: "numbered", text: "" });
eq("[] yapılacak", markdownShortcut("[] "), { type: "todo", text: "" });
eq("[ ] yapılacak", markdownShortcut("[ ] "), { type: "todo", text: "" });
eq("--- çizgi", markdownShortcut("---"), { type: "divider", text: "" });
eq("``` kod", markdownShortcut("```"), { type: "code", text: "" });
eq('" alıntı', markdownShortcut('" '), { type: "quote", text: "" });
eq("düz metin kısayol değil", markdownShortcut("merhaba "), null);
eq("satır ortasındaki işaret kısayol değil", markdownShortcut("a - "), null);

eq("madde Enter'dan madde", typeAfterEnter("bulleted"), "bulleted");
eq("başlık Enter'dan paragraf", typeAfterEnter("heading2"), "paragraph");

console.log("\nDosya onarımı ve önizleme");
eq("bozuk gövde boş sayfa", normalizeDoc(null, "p-9"), emptyDoc("p-9"));
const onarilanDoc = normalizeDoc({ blocks: [{ id: "x", type: "uydurma", text: 5 }, { type: "paragraph" }] }, "p-9");
eq(
  "bilinmeyen tip paragrafa döner, id'siz satır düşer",
  onarilanDoc.blocks.map((b) => [b.id, b.type, b.text]),
  [["x", "paragraph", ""]],
);
eq("önizleme blokları birleştirir", docPreview(silme), "üst · alt · son");

console.log("\nDrag and drop");
let surukle: PageDoc = emptyDoc("p-8");
surukle = appendBlock(surukle, { text: "a" }, "a");
surukle = appendBlock(surukle, { text: "b" }, "b");
surukle = appendBlock(surukle, { text: "b1", parentId: "b" }, "b1");
surukle = appendBlock(surukle, { text: "c" }, "c");
const sira = (x: PageDoc) => blockOutline(x).map(({ block, depth }) => `${block.id}:${depth}`);
eq("drop before the first block", sira(moveBlockTo(surukle, "c", "a", "before")), ["c:0", "a:0", "b:0", "b1:1"]);
eq("drop after a block", sira(moveBlockTo(surukle, "a", "c", "after")), ["b:0", "b1:1", "c:0", "a:0"]);
eq("subtree moves with its parent", sira(moveBlockTo(surukle, "b", "a", "before")), ["b:0", "b1:1", "a:0", "c:0"]);
eq("drop next to a nested block adopts its parent", sira(moveBlockTo(surukle, "c", "b1", "after")), ["a:0", "b:0", "b1:1", "c:1"]);
eq("a block cannot drop into its own subtree", moveBlockTo(surukle, "b", "b1", "after"), surukle);
eq("dropping on itself changes nothing", moveBlockTo(surukle, "a", "a", "before"), surukle);
eq(
  "insert before keeps the rest in order",
  sira(insertBlockBefore(surukle, "b", { text: "yeni" }, "y")),
  ["a:0", "y:0", "b:0", "b1:1", "c:0"],
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
