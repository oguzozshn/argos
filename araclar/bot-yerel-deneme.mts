/**
 * Worker'ın yerel uçtan uca denemesi. `npm test`'e girmez: çalışan bir
 * `wrangler dev` ister.
 *
 *   1. bot/.dev.vars.ornek → bot/.dev.vars
 *   2. npm run bot:dev -- --test-scheduled
 *   3. node araclar/bot-yerel-deneme.mts
 *
 * Telegram yerine bu betiğin açtığı sahte sunucu (8788) cevap verir; Worker'ın
 * Telegram'a ne yolladığı oradan okunur. Todoist anahtarı sahte olduğu için
 * görev satırları "alınamadı" der — beklenen bu.
 *
 * Yerel KV'ye yazar (.wrangler/); kuyruğu sonunda boşaltır.
 */

import http from "node:http";
import { anlikKur } from "../src/ortak/bot.ts";
import { gunEkle, haftaninGunu } from "../src/ortak/gun.ts";
import { bugunIso, type Hafta } from "../src/ortak/plan.ts";

const W = process.env.WORKER_URL ?? "http://127.0.0.1:8787";
const GIZLI = "yerel-gizli";
const YETKI = { Authorization: "Bearer yerel-anahtar", "Content-Type": "application/json" };

interface Cagri {
  yol: string;
  govde: Record<string, any>;
}
let cagrilar: Cagri[] = [];
let mesajNo = 1000;
const sunucu = http
  .createServer((q, r) => {
    let b = "";
    q.on("data", (c) => (b += c));
    q.on("end", () => {
      cagrilar.push({ yol: (q.url ?? "").replace(/\/bot[^/]+/, ""), govde: JSON.parse(b || "{}") });
      r.setHeader("Content-Type", "application/json");
      r.end(JSON.stringify({ ok: true, result: { message_id: ++mesajNo } }));
    });
  })
  .listen(8788, "127.0.0.1");

let gecen = 0;
let kalan = 0;
function kontrol(ad: string, kosul: unknown): void {
  if (kosul) gecen++;
  else kalan++;
  console.log(`  ${kosul ? "✓" : "✗"} ${ad}`);
}
const metinler = () => cagrilar.filter((c) => c.govde.text).map((c) => String(c.govde.text));

let uid = Date.now() % 1_000_000;
const tg = (metin: string, o: { chat?: number; gizli?: string; id?: number } = {}) =>
  fetch(`${W}/telegram`, {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": o.gizli ?? GIZLI, "Content-Type": "application/json" },
    body: JSON.stringify({
      update_id: o.id ?? ++uid,
      message: { message_id: 1, chat: { id: o.chat ?? 42 }, text: metin },
    }),
  });

const bugun = bugunIso();
const pzt = gunEkle(bugun, -haftaninGunu(bugun));
const hafta: Hafta = {
  hafta: 1,
  yil: 2026,
  baslik: "",
  gunler: [1, 2, 3, 4, 5, 6, 7].map((no) => ({ no, ad: "", tarih: "", isoTarih: gunEkle(pzt, no - 1) })),
  slotlar: [
    { id: "a", gun: haftaninGunu(bugun) + 1, saat: "09:00", sureDk: 90, alan: "Tez", konu: "Literatür <okuma>", durum: "planli" },
  ],
  gunlukAliskanliklar: [{ ad: "Okuma" }],
};

try {
  console.log("\nyetki");
  kontrol("yanlış gizli başlık 401", (await tg("/bugun", { gizli: "yanlis" })).status === 401);
  kontrol("yabancı chat'e cevap yok", (await tg("/bugun", { chat: 7 })).status === 200 && cagrilar.length === 0);
  kontrol("anahtarsız /anlik 401", (await fetch(`${W}/anlik`, { method: "PUT", body: "{}" })).status === 401);
  kontrol("anahtarsız /kuyruk 401", (await fetch(`${W}/kuyruk`)).status === 401);

  console.log("\n/bugun");
  const anlik = anlikKur([{ veri: hafta }], bugun, null, new Date().toISOString());
  kontrol("görünüm yüklendi", (await fetch(`${W}/anlik`, { method: "PUT", headers: YETKI, body: JSON.stringify(anlik) })).ok);
  await tg("/bugun");
  const m = metinler().at(-1) ?? "";
  console.log(m.replace(/^/gm, "    | "));
  kontrol("plan satırı, HTML kaçışlı", m.includes("09:00  Literatür &lt;okuma&gt;"));
  kontrol("düğmeler", JSON.stringify(cagrilar.at(-1)?.govde.reply_markup ?? "").includes("gun:"));

  console.log("\nkuyruk");
  cagrilar = [];
  const ayniId = ++uid;
  await tg("/ekle yarın 16:00 Deneme 30dk #tez", { id: ayniId });
  await tg("/ekle yarın 16:00 Deneme 30dk #tez", { id: ayniId });
  await tg("/not faturayı sor");
  await tg("/ekle 16:00");
  for (const t of metinler()) console.log(`    → ${t.replace(/\n/g, " | ")}`);
  kontrol("yeniden yollanan güncelleme tek cevap alır", cagrilar.length === 3);

  console.log("\n/kapat");
  cagrilar = [];
  await tg("/kapat literatür");
  await tg("/kapat olmayan iş");
  for (const t of metinler()) console.log(`    → ${t.replace(/\n/g, " | ")}`);
  kontrol("slot kuyruğa işaretlenir", (metinler()[0] ?? "").includes("Literatür"));
  kontrol("eşleşmeyen söylenir", (metinler()[1] ?? "").includes("açık bir iş yok"));

  const kuyruk = (await (await fetch(`${W}/kuyruk`, { headers: YETKI })).json()) as { id: string; tur: string }[];
  kontrol(
    "kuyrukta slot, not ve durum",
    ["slot", "not", "durum"].every((t) => kuyruk.some((k) => k.tur === t)),
  );

  console.log("\ndüğme");
  cagrilar = [];
  await fetch(`${W}/telegram`, {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": GIZLI },
    body: JSON.stringify({
      update_id: ++uid,
      callback_query: { id: "cq", data: `gun:${gunEkle(bugun, 1)}`, message: { message_id: 77, chat: { id: 42 } } },
    }),
  });
  kontrol("mesaj yerinde düzenlenir", cagrilar.some((c) => c.yol.endsWith("editMessageText") && c.govde.message_id === 77));
  kontrol("düğme cevaplanır", cagrilar.some((c) => c.yol.endsWith("answerCallbackQuery")));

  console.log("\nsonuç");
  cagrilar = [];
  await fetch(`${W}/kuyruk/sonuc`, {
    method: "POST",
    headers: YETKI,
    body: JSON.stringify({
      // Yalnız notlu ve reddedilen bildirim doğurur; durum kaydı sessizce siliniyor.
      sonuclar: kuyruk.map((k) =>
        k.tur === "slot"
          ? { id: k.id, durum: "eklendi", not: "09:00 Literatür ile çakışıyor" }
          : k.tur === "not"
            ? { id: k.id, durum: "reddedildi", sebep: "hatirla.json okunamadı" }
            : { id: k.id, durum: "eklendi" },
      ),
    }),
  });
  for (const t of metinler()) console.log(`    → ${t.replace(/\n/g, " | ")}`);
  kontrol("notlu ve reddedilen bildirilir", metinler().length === 2);
  const kalanKuyruk = (await (await fetch(`${W}/kuyruk`, { headers: YETKI })).json()) as unknown[];
  kontrol("kuyruk boşaldı", kalanKuyruk.length === 0);

  console.log("\nsabah");
  cagrilar = [];
  await fetch(`${W}/cdn-cgi/handler/scheduled?cron=0+5+*+*+*`);
  kontrol("sabah özeti sahibine gider", cagrilar.some((c) => c.yol.endsWith("sendMessage") && c.govde.chat_id === "42"));
  const menu = cagrilar.find((c) => c.yol.endsWith("setMyCommands"));
  kontrol("komut menüsü tazelenir", menu !== undefined);
  kontrol(
    "menüde /kapat var",
    (menu?.govde.commands ?? []).some((k: { command: string }) => k.command === "kapat"),
  );
} finally {
  sunucu.close();
}

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
