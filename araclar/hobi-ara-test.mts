/**
 * Search in a Hobiler list (issue #34): `node araclar/hobi-ara-test.mts`
 */

import { matches, plain } from "../src/ortak/hobi-ara.ts";

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

const e = (ad: string, not = "", notlar: string[] = []) => ({ ad, not, notlar: notlar.map((metin) => ({ metin })) });

eq("Turkish letters to plain", plain("IŞIK Şeytan Çağrı Öğün Ü"), "isik seytan cagri ogun u");
eq("other accents", plain("Pokémon"), "pokemon");
eq("case-insensitive name", matches(e("Elden Ring"), "elden"), true);
eq("plain query finds Turkish name", matches(e("Şeytan ve 3 Opera"), "seytan"), true);
eq("Turkish query finds plain name", matches(e("Sekiro"), "şekiro"), true);
eq("dotted capital İ", matches(e("İkilem"), "ikilem"), true);
eq("searches the note", matches(e("Hades", "Supergiant, roguelike"), "roguelike"), true);
eq("searches the notes list", matches(e("Dark Souls", "", ["2. bölümde kaldım"]), "bolumde"), true);
eq("every word must match", matches(e("Red Dead Redemption 2"), "red 2"), true);
eq("a missing word fails", matches(e("Red Dead Redemption 2"), "red 3"), false);
eq("empty query matches all", matches(e("x"), "   "), true);
eq("no match", matches(e("Celeste"), "zelda"), false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
