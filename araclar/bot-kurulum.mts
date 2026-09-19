/**
 * Telegram botunun tek komutluk kurulumu: `npm run bot:kur`
 *
 * Kullanıcıdan yalnızca BotFather token'ını ve bota bir `/start` mesajını
 * ister. Gerisini kendisi yapar:
 *   1. Token'ı Telegram'a sorup doğrular (bot adı görünür).
 *   2. `/start` yazan sohbetin kimliğini alır → SAHIP_CHAT_ID.
 *   3. Rastgele TELEGRAM_GIZLI ve ARGOS_ANAHTARI üretir; Todoist anahtarını
 *      gizli.json'dan okur. Beşini de `wrangler secret put` ile Worker'a girer.
 *   4. gizli.json'a Worker adresini ve Argos anahtarını ekler.
 *   5. Webhook'u gizli başlıkla kurar, komut menüsünü tanıtır.
 *
 * Gizli değerler ekrana yazılmaz, dosyaya yalnızca gizli.json'a yazılır.
 * Yeniden çalıştırılabilir: gizli.json'da anahtar varsa korunur.
 *
 * Worker önceden yüklenmiş olmalı (`npm run bot:yukle`). Adres
 * WORKER_URL ile değiştirilebilir.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { KOMUTLAR } from "../src/ortak/bot.ts";
import { gizliYolu } from "./yol.mts";

const WORKER = (process.env.WORKER_URL ?? "https://argos-bot.oguz-argos.workers.dev").replace(/\/+$/, "");
const soru = createInterface({ input: process.stdin, output: process.stdout });

function dur(mesaj: string): never {
  console.error(`\n✗ ${mesaj}`);
  soru.close();
  process.exit(1);
}

async function telegram<T>(token: string, yontem: string, govde: unknown = {}): Promise<T> {
  const c = await fetch(`https://api.telegram.org/bot${token}/${yontem}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  const j = (await c.json()) as { ok: boolean; description?: string; result?: T };
  if (!j.ok) throw new Error(`${yontem}: ${j.description}`);
  return j.result as T;
}

/** Değer komut satırına değil standart girdiye verilir: süreç listesinde görünmesin. */
function sirGir(ad: string, deger: string): void {
  // Tek metin: Windows'ta npx bir .cmd, kabuk gerekiyor. Ad sabit, kaçış sorunu yok.
  const r = spawnSync(`npx wrangler secret put ${ad} -c bot/wrangler.toml`, {
    input: deger,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (r.status !== 0) dur(`${ad} girilemedi:\n${(r.stderr || r.stdout).trim().split("\n").slice(-5).join("\n")}`);
  console.log(`  ✓ ${ad}`);
}

// --- gizli.json ---------------------------------------------------------------
const gizliDosya = gizliYolu();
let gizli: Record<string, unknown>;
try {
  gizli = JSON.parse(readFileSync(gizliDosya, "utf8").replace(/^﻿/, ""));
} catch {
  dur(`${gizliDosya} okunamadı`);
}
const todoist = String(gizli.todoistToken ?? "").trim();
if (!todoist) dur(`${gizliDosya} içinde todoistToken yok`);

// --- 1. token -----------------------------------------------------------------
console.log("Argos Telegram botu kurulumu\n");
const token = (await soru.question("BotFather'ın verdiği token'ı yapıştır ve Enter'a bas:\n> ")).trim();
if (!/^\d+:[\w-]{30,}$/.test(token)) dur("Bu bir bot token'ına benzemiyor (örnek biçim: 123456789:AA...)");
let botAdi: string;
try {
  botAdi = (await telegram<{ username: string }>(token, "getMe")).username;
} catch (e) {
  dur(`Telegram token'ı kabul etmedi: ${(e as Error).message}`);
}
console.log(`  ✓ bot bulundu: @${botAdi}`);

// --- 2. sahip -----------------------------------------------------------------
// Webhook kuruluysa getUpdates çalışmaz; önce kaldırılır (yeniden kurulumda).
await telegram(token, "deleteWebhook", { drop_pending_updates: true });
await soru.question(`\nTelegram'da @${botAdi} sohbetini aç, /start yaz ve gönder.\nGönderdikten sonra burada Enter'a bas.`);
let chatId: number | null = null;
for (let deneme = 0; deneme < 5 && chatId === null; deneme++) {
  const g = await telegram<{ message?: { chat: { id: number; type: string } } }[]>(token, "getUpdates", { timeout: 5 });
  const son = g.filter((x) => x.message?.chat.type === "private").at(-1);
  chatId = son?.message?.chat.id ?? null;
}
if (chatId === null) dur(`@${botAdi}'a gelen mesaj görünmedi. /start yazıp gönderdiğinden emin ol ve komutu yeniden çalıştır.`);
console.log(`  ✓ sohbet bulundu`);

// --- 3. Worker gizli değerleri -------------------------------------------------
const telegramGizli = randomUUID();
const argosAnahtari = String(gizli.argosBotAnahtari ?? "").trim() || randomUUID();
console.log("\nWorker'a gizli değerler giriliyor (her biri birkaç saniye sürer)…");
sirGir("TELEGRAM_TOKEN", token);
sirGir("TODOIST_TOKEN", todoist);
sirGir("TELEGRAM_GIZLI", telegramGizli);
sirGir("ARGOS_ANAHTARI", argosAnahtari);
sirGir("SAHIP_CHAT_ID", String(chatId));

// --- 4. gizli.json --------------------------------------------------------------
gizli.argosBotUrl = WORKER;
gizli.argosBotAnahtari = argosAnahtari;
const gecici = `${gizliDosya}.${process.pid}.tmp`;
writeFileSync(gecici, JSON.stringify(gizli, null, 2) + "\n", "utf8");
renameSync(gecici, gizliDosya);
console.log(`\n  ✓ ${gizliDosya} güncellendi (Worker adresi ve Argos anahtarı)`);

// --- 5. webhook ---------------------------------------------------------------
await telegram(token, "setWebhook", {
  url: `${WORKER}/telegram`,
  secret_token: telegramGizli,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
await telegram(token, "setMyCommands", {
  commands: KOMUTLAR.map((k) => ({ command: k.komut, description: k.aciklama })),
});
console.log("  ✓ webhook ve komut menüsü kuruldu");

await telegram(token, "sendMessage", {
  chat_id: chatId,
  text: "✅ Argos botu kuruldu. /bugun yazarak dene.\n\nPlan kısmı, yeni Argos sürümü açılıp planı gönderince dolacak.",
});
console.log(`\nBitti. Telegram'da @${botAdi}'a /bugun yaz.`);
soru.close();
