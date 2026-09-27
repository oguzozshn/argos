/**
 * One-line task entry: `node araclar/quick-add-test.mts`
 */

import { splitQuickAdd } from "../src/ortak/quick-add.ts";

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

const TODAY = "2026-09-27";
const q = (line: string) => splitQuickAdd(line, TODAY);

eq("plain title", q("Portfolyo güncelle"), { title: "Portfolyo güncelle", dateText: null, priority: null, important: false });
eq("date at the end", q("IELTS kaydı yarın 18:00"), { title: "IELTS kaydı", dateText: "yarın 18:00", priority: null, important: false });
eq("everything", q("IELTS kaydı yarın 18:00 p1 @önemli"), { title: "IELTS kaydı", dateText: "yarın 18:00", priority: 1, important: true });
eq("markers anywhere", q("p2 @Önemli fatura öde cuma"), { title: "fatura öde", dateText: "cuma", priority: 2, important: true });
eq("date in the middle", q("haftaya salı hocayla görüş"), { title: "hocayla görüş", dateText: "haftaya salı", priority: null, important: false });
eq("recurring phrase", q("Esneme her gün 07:00"), { title: "Esneme", dateText: "her gün 07:00", priority: null, important: false });
eq("a lone day name is the title, not a date", q("Pazar"), { title: "Pazar", dateText: null, priority: null, important: false });
eq("other labels stay in the title", q("süt al @market"), { title: "süt al @market", dateText: null, priority: null, important: false });
eq("extra spaces collapse", q("  kitap   oku  yarın "), { title: "kitap oku", dateText: "yarın", priority: null, important: false });
eq("p5 is not a priority", q("p5 notu"), { title: "p5 notu", dateText: null, priority: null, important: false });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
