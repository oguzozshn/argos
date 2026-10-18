/**
 * Bugün layout (issues #48 and the card types after it): `node araclar/bugun-duzen-test.mts`
 */

import {
  altSinir,
  ayniDuzen,
  kartAyarla,
  kartEkle,
  kartKaldir,
  normalizeDuzen,
  okumaSirasi,
  sinirla,
  varsayilanDuzen,
} from "../src/ortak/bugun-duzen.ts";

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
  { id: "hobiler:liste", ust: false, coklu: true, w: 4, h: 10 },
];
const turler = kartlar.map((k) => k.id);
const d = varsayilanDuzen(kartlar);
const liste = kartlar[4]!;

console.log("Default and reading back");
eq("default: strip on top, full width", d[0], { id: "yapilacak:ust", tur: "yapilacak:ust", x: 0, y: 0, w: 12, h: 5 });
eq("default: one-of-a-kind cards two per row", d.slice(1).map((k) => [k.id, k.x, k.y]), [["asistan:ozet", 0, 5], ["yapilacak:ozet", 6, 5], ["hobiler:ozet", 0, 14]]);
eq("default leaves cards with settings out (added by choice)", d.some((k) => k.tur === "hobiler:liste"), false);
eq("no saved file: null (default is used)", normalizeDuzen(null, turler), null);
eq("layout saved before card types: id is the type", normalizeDuzen({ version: 1, kartlar: [{ id: "hobiler:ozet", x: 3, y: 2, w: 4, h: 6 }] }, turler), [{ id: "hobiler:ozet", tur: "hobiler:ozet", w: 4, h: 6, x: 3, y: 2 }]);
eq("a copy with settings read back", normalizeDuzen({ kartlar: [{ id: "hobiler:liste#a", tur: "hobiler:liste", ayar: { liste: "dizi", bad: 3 }, x: 0, y: 0, w: 4, h: 10 }] }, turler), [{ id: "hobiler:liste#a", tur: "hobiler:liste", ayar: { liste: "dizi" }, w: 4, h: 10, x: 0, y: 0 }]);
eq("cards of removed types dropped", normalizeDuzen({ kartlar: [{ id: "eski:ozet", x: 0, y: 0, w: 6, h: 6 }] }, turler), []);
eq("an id listed twice keeps its first place", normalizeDuzen({ kartlar: [{ id: "asistan:ozet", x: 0, y: 0, w: 6, h: 6 }, { id: "asistan:ozet", x: 6, y: 0, w: 6, h: 6 }] }, turler)!.length, 1);

console.log("\nSize limits");
eq("too wide / off the edge is pulled in", sinirla({ id: "a", tur: "a", x: 10, y: -2, w: 6, h: 1 }), { id: "a", tur: "a", w: 6, h: 3, x: 6, y: 0 });
eq("narrower than a quarter is widened", sinirla({ id: "a", tur: "a", x: 0, y: 0, w: 1, h: 5 }).w, 3);

console.log("\nAdding, removing, settings");
eq("removing a card", kartKaldir(d, "asistan:ozet").map((k) => k.id), ["yapilacak:ust", "yapilacak:ozet", "hobiler:ozet"]);
const without = kartKaldir(d, "hobiler:ozet");
eq("adding it back goes below everything", kartEkle(without, kartlar[3]!).at(-1), { id: "hobiler:ozet", tur: "hobiler:ozet", x: 0, y: altSinir(without), w: 6, h: 9 });
eq("adding a strip back: full width", kartEkle(kartKaldir(d, "yapilacak:ust"), kartlar[0]!).at(-1)?.w, 12);
eq("a one-of-a-kind card already there is not added twice", kartEkle(d, kartlar[1]!), d);
const iki = kartEkle(kartEkle(d, liste, "hobiler:liste#a", { liste: "dizi" }), liste, "hobiler:liste#b", { liste: "oyunlar" });
eq("a card with settings can be added more than once", iki.filter((k) => k.tur === "hobiler:liste").map((k) => [k.id, k.ayar?.liste, k.w, k.h]), [["hobiler:liste#a", "dizi", 4, 10], ["hobiler:liste#b", "oyunlar", 4, 10]]);
eq("the same copy id is not added twice", kartEkle(iki, liste, "hobiler:liste#a", { liste: "x" }).length, iki.length);
const ayarli = kartAyarla(iki, "hobiler:liste#b", { liste: "kitaplar" });
eq("changing a copy's settings keeps its place", [ayarli.at(-1)?.ayar, ayarli.at(-1)?.y], [{ liste: "kitaplar" }, iki.at(-1)?.y]);
eq("a settings change is a change", ayniDuzen(iki, ayarli), false);

console.log("\nOrder and comparison");
eq("reading order: top to bottom, left to right", okumaSirasi([{ id: "b", tur: "b", x: 6, y: 0, w: 6, h: 3 }, { id: "c", tur: "c", x: 0, y: 4, w: 6, h: 3 }, { id: "a", tur: "a", x: 0, y: 0, w: 6, h: 3 }]).map((k) => k.id), ["a", "b", "c"]);
eq("same layout in another order", ayniDuzen(d, [...d].reverse()), true);
eq("a moved card is a change", ayniDuzen(d, d.map((k, i) => (i === 1 ? { ...k, x: 3 } : k))), false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
