/**
 * Order of the Hobiler lists (issue #37): `node araclar/hobi-sira-test.mts`
 */

import { moveList, normalizeSira, orderLists, stepList } from "../src/ortak/hobi-sira.ts";

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

// File-name order, as the folder listing gives it.
const lists = ["dizi", "kitaplar", "oyunlar"].map((slug) => ({ slug }));
const slugs = (xs: { slug: string }[]) => xs.map((x) => x.slug);

eq("no saved order: file-name order", slugs(orderLists(lists, [])), ["dizi", "kitaplar", "oyunlar"]);
eq("saved order is followed", slugs(orderLists(lists, ["oyunlar", "dizi", "kitaplar"])), ["oyunlar", "dizi", "kitaplar"]);
eq("a list added later goes to the end", slugs(orderLists(lists, ["oyunlar", "dizi"])), ["oyunlar", "dizi", "kitaplar"]);
eq("a deleted list leaves no gap", slugs(orderLists(lists, ["filmler", "oyunlar", "dizi", "kitaplar"])), ["oyunlar", "dizi", "kitaplar"]);
eq("drop Oyunlar above Dizi", moveList(["dizi", "kitaplar", "oyunlar"], "oyunlar", "dizi", true), ["oyunlar", "dizi", "kitaplar"]);
eq("drop Dizi below Oyunlar", moveList(["dizi", "kitaplar", "oyunlar"], "dizi", "oyunlar", false), ["kitaplar", "oyunlar", "dizi"]);
eq("drop on itself: unchanged", moveList(["dizi", "oyunlar"], "dizi", "dizi", true), ["dizi", "oyunlar"]);
eq("unknown target: unchanged", moveList(["dizi", "oyunlar"], "dizi", "filmler", true), ["dizi", "oyunlar"]);
eq("Alt+↑", stepList(["dizi", "kitaplar", "oyunlar"], "oyunlar", true), ["dizi", "oyunlar", "kitaplar"]);
eq("Alt+↓", stepList(["dizi", "kitaplar", "oyunlar"], "dizi", false), ["kitaplar", "dizi", "oyunlar"]);
eq("Alt+↑ at the top: unchanged", stepList(["dizi", "oyunlar"], "dizi", true), ["dizi", "oyunlar"]);
eq("bad file content reads as no order", normalizeSira({ sira: "x" }), []);
eq("non-string entries dropped", normalizeSira({ version: 1, sira: ["dizi", 3, null] }), ["dizi"]);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
