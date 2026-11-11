/**
 * Inline formatting runs: `node araclar/sayfa-marks-test.mts`
 */

import {
  concatMarks,
  fromSegments,
  inlineShortcut,
  linkAt,
  normalizeMarks,
  rangeHas,
  setLink,
  sliceMarks,
  spliceText,
  toSegments,
  toggleMark,
} from "../src/ortak/sayfa-marks.ts";
import { normalizeDoc } from "../src/ortak/sayfalar.ts";

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

console.log("\nNormalize");
eq("not an array", normalizeMarks("x", 5), []);
eq("clipped to the text", normalizeMarks([{ start: 3, end: 99, bold: true }], 5), [{ start: 3, end: 5, bold: true }]);
eq("empty and plain runs dropped", normalizeMarks([{ start: 2, end: 2, bold: true }, { start: 0, end: 3 }], 5), []);
eq(
  "touching runs with one format merge",
  normalizeMarks([{ start: 0, end: 2, bold: true }, { start: 2, end: 4, bold: true }], 5),
  [{ start: 0, end: 4, bold: true }],
);
eq(
  "overlap splits into three runs",
  normalizeMarks([{ start: 0, end: 4, bold: true }, { start: 2, end: 6, italic: true }], 6),
  [
    { start: 0, end: 2, bold: true },
    { start: 2, end: 4, bold: true, italic: true },
    { start: 4, end: 6, italic: true },
  ],
);

console.log("\nToggle");
const kalin = toggleMark([], 0, 5, "bold", 11);
eq("bold on", kalin, [{ start: 0, end: 5, bold: true }]);
eq("bold off when the whole range has it", toggleMark(kalin, 0, 5, "bold", 11), []);
eq("partly bold range turns fully bold", toggleMark(kalin, 3, 8, "bold", 11), [{ start: 0, end: 8, bold: true }]);
eq("bold off in the middle", toggleMark(kalin, 1, 3, "bold", 11), [
  { start: 0, end: 1, bold: true },
  { start: 3, end: 5, bold: true },
]);
eq("collapsed range changes nothing", toggleMark(kalin, 2, 2, "italic", 11), kalin);
eq("rangeHas whole", rangeHas(kalin, 1, 4, "bold"), true);
eq("rangeHas partial", rangeHas(kalin, 3, 7, "bold"), false);

console.log("\nLinks");
const bagli = setLink(kalin, 2, 7, "https://a.dev", 11);
eq("link over a bold edge", bagli, [
  { start: 0, end: 2, bold: true },
  { start: 2, end: 5, bold: true, link: "https://a.dev" },
  { start: 5, end: 7, link: "https://a.dev" },
]);
eq("link under the caret", linkAt(bagli, 6, 6), "https://a.dev");
eq("no link there", linkAt(bagli, 9, 9), "");
eq("link removed, bold stays", setLink(bagli, 0, 11, "", 11), kalin);

console.log("\nSegments");
eq("plain text is one piece", toSegments("merhaba", []), [{ text: "merhaba" }]);
eq("pieces around a run", toSegments("bir iki üç", [{ start: 4, end: 7, italic: true }]), [
  { text: "bir " },
  { text: "iki", italic: true },
  { text: " üç" },
]);
const gidisDonus = fromSegments(toSegments("bir iki üç", bagli));
eq("round trip", [gidisDonus.text, gidisDonus.marks], ["bir iki üç", normalizeMarks(bagli, 10)]);

console.log("\nSplit and join");
const iki = [{ start: 2, end: 8, bold: true as const }];
eq("left half", sliceMarks(iki, 0, 5), [{ start: 2, end: 5, bold: true }]);
eq("right half rebased", sliceMarks(iki, 5, 10), [{ start: 0, end: 3, bold: true }]);
eq("joined back", concatMarks(sliceMarks(iki, 0, 5), 5, sliceMarks(iki, 5, 10)), iki);

console.log("\nSplice");
eq("typing before a run shifts it", spliceText("ab", [{ start: 1, end: 2, bold: true }], 0, 0, "xx"), {
  text: "xxab",
  marks: [{ start: 3, end: 4, bold: true }],
});
eq("inserted text inherits the format before it", spliceText("ab", [{ start: 0, end: 2, bold: true }], 1, 1, "\n"), {
  text: "a\nb",
  marks: [{ start: 0, end: 3, bold: true }],
});
eq("text inserted at the edge of a run stays plain", spliceText("ab", [{ start: 0, end: 2, link: "x" }], 2, 2, "\n"), {
  text: "ab\n",
  marks: [{ start: 0, end: 2, link: "x" }],
});
eq("deleting a run removes its mark", spliceText("abcd", [{ start: 1, end: 3, code: true }], 1, 3, ""), { text: "ad", marks: [] });

console.log("\nInline markdown");
eq("**bold**", inlineShortcut("bu **kalın**", [], 12), { text: "bu kalın", marks: [{ start: 3, end: 8, bold: true }], caret: 8 });
eq("`code`", inlineShortcut("`x=1` son", [], 5), { text: "x=1 son", marks: [{ start: 0, end: 3, code: true }], caret: 3 });
eq("~~strike~~", inlineShortcut("~~eski~~", [], 8), { text: "eski", marks: [{ start: 0, end: 4, strike: true }], caret: 4 });
eq("*italic*", inlineShortcut("bir *iki*", [], 9), { text: "bir iki", marks: [{ start: 4, end: 7, italic: true }], caret: 7 });
eq("_italic_", inlineShortcut("_iki_", [], 5), { text: "iki", marks: [{ start: 0, end: 3, italic: true }], caret: 3 });
eq("first closing star of a bold pair is not italic", inlineShortcut("**kalın*", [], 8), null);
eq("snake_case is not italic", inlineShortcut("a_b_", [], 4), null);
eq("spaces inside the markers do not count", inlineShortcut("2 * 3 *", [], 7), null);
eq("marks after the caret shift left", inlineShortcut("**a** b", [{ start: 6, end: 7, italic: true }], 5), {
  text: "a b",
  marks: [
    { start: 0, end: 1, bold: true },
    { start: 2, end: 3, italic: true },
  ],
  caret: 1,
});

console.log("\nIn the page file");
const okunan = normalizeDoc(
  { blocks: [{ id: "a", text: "kalın", marks: [{ start: 0, end: 99, bold: true }] }, { id: "b", text: "düz", marks: [] }] },
  "p-1",
);
eq("marks clipped on read", okunan.blocks[0]!.marks, [{ start: 0, end: 5, bold: true }]);
eq("plain block has no marks field", "marks" in okunan.blocks[1]!, false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
