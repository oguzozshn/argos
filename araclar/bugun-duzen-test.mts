/**
 * Bugün layout (issue #48): `node araclar/bugun-duzen-test.mts`
 */

import { altSinir, ayniDuzen, kartEkle, kartKaldir, normalizeDuzen, okumaSirasi, sinirla, varsayilanDuzen } from "../src/ortak/bugun-duzen.ts";

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

const kartlar = [
  { id: "yapilacak:ust", ust: true },
  { id: "asistan:ozet", ust: false },
  { id: "yapilacak:ozet", ust: false },
  { id: "hobiler:ozet", ust: false },
];
const ids = kartlar.map((k) => k.id);
const d = varsayilanDuzen(kartlar);

eq("default: strip on top, full width", d[0], { id: "yapilacak:ust", x: 0, y: 0, w: 12, h: 5 });
eq("default: cards two per row", d.slice(1).map((k) => [k.id, k.x, k.y]), [["asistan:ozet", 0, 5], ["yapilacak:ozet", 6, 5], ["hobiler:ozet", 0, 14]]);
eq("no saved file: null (default is used)", normalizeDuzen(null, ids), null);
eq("saved layout read back", normalizeDuzen({ version: 1, kartlar: [{ id: "hobiler:ozet", x: 3, y: 2, w: 4, h: 6 }] }, ids), [{ id: "hobiler:ozet", w: 4, h: 6, x: 3, y: 2 }]);
eq("cards of removed modules dropped", normalizeDuzen({ kartlar: [{ id: "eski:ozet", x: 0, y: 0, w: 6, h: 6 }] }, ids), []);
eq("a card listed twice keeps its first place", normalizeDuzen({ kartlar: [{ id: "asistan:ozet", x: 0, y: 0, w: 6, h: 6 }, { id: "asistan:ozet", x: 6, y: 0, w: 6, h: 6 }] }, ids)!.length, 1);
eq("too wide / off the edge is pulled in", sinirla({ id: "a", x: 10, y: -2, w: 6, h: 1 }), { id: "a", w: 6, h: 3, x: 6, y: 0 });
eq("narrower than a third is widened", sinirla({ id: "a", x: 0, y: 0, w: 1, h: 5 }).w, 3);
eq("removing a card", kartKaldir(d, "asistan:ozet").map((k) => k.id), ["yapilacak:ust", "yapilacak:ozet", "hobiler:ozet"]);
const without = kartKaldir(d, "hobiler:ozet");
eq("adding it back goes below everything", kartEkle(without, { id: "hobiler:ozet", ust: false }).at(-1), { id: "hobiler:ozet", x: 0, y: altSinir(without), w: 6, h: 9 });
eq("adding a strip back: full width", kartEkle(kartKaldir(d, "yapilacak:ust"), { id: "yapilacak:ust", ust: true }).at(-1)?.w, 12);
eq("adding a card already there changes nothing", kartEkle(d, { id: "asistan:ozet", ust: false }), d);
eq("reading order: top to bottom, left to right", okumaSirasi([{ id: "b", x: 6, y: 0, w: 6, h: 3 }, { id: "c", x: 0, y: 4, w: 6, h: 3 }, { id: "a", x: 0, y: 0, w: 6, h: 3 }]).map((k) => k.id), ["a", "b", "c"]);
eq("same layout in another order", ayniDuzen(d, [...d].reverse()), true);
eq("a moved card is a change", ayniDuzen(d, d.map((k, i) => (i === 1 ? { ...k, x: 3 } : k))), false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
