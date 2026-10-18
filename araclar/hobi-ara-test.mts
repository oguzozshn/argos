/**
 * Search in a Hobiler list (issue #34): `node araclar/hobi-ara-test.mts`
 */

import { existingMatches, matches, plain } from "../src/ortak/hobi-ara.ts";

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

console.log("Existing entries while adding (#38)");
const list = [{ ad: "Metro 2033" }, { ad: "Metro: Last Light" }, { ad: "Şeytan ve 3 Opera" }, { ad: "Hades" }];
const names = (typed: string) => existingMatches(list, typed).map((m) => m.entry.ad + (m.exact ? " (exact)" : ""));
eq("'Metro' shows both Metro games", names("Metro"), ["Metro 2033", "Metro: Last Light"]);
eq("'metro 20' narrows to 2033", names("metro 20"), ["Metro 2033"]);
eq("'metro e' (Exodus) shows nothing", names("metro e"), []);
eq("exact name is marked and first", names("metro last light"), ["Metro: Last Light (exact)"]);
eq("Turkish letters typed plain", names("seytan"), ["Şeytan ve 3 Opera"]);
eq("'#category' words are ignored", names("hades #Roguelike"), ["Hades (exact)"]);
eq("words must start a word, not sit inside one", names("etro"), []);
eq("nothing before the first letter", names("   "), []);
eq("at most five", existingMatches(Array.from({ length: 8 }, (_, i) => ({ ad: `Metro ${i}` })), "metro").length, 5);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
