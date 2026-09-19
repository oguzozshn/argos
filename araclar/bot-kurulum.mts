/**
 * Telegram botunu Worker'a bağlar: `npm run bot:kur`
 *
 * Bir kez çalıştırılır (Worker adresi değişirse yeniden). Değerler ortam
 * değişkeninden okunur, dosyaya ya da çıktıya yazılmaz:
 *   TELEGRAM_TOKEN   BotFather'ın verdiği anahtar
 *   TELEGRAM_GIZLI   Worker'a `wrangler secret put TELEGRAM_GIZLI` ile girilenin aynısı
 *   WORKER_URL       ör. https://argos-bot.<hesap>.workers.dev
 *
 * Yapılanlar: webhook'u gizli başlıkla kurar, komut menüsünü tanıtır,
 * webhook durumunu gösterir.
 */

import { KOMUTLAR } from "../src/ortak/bot.ts";

const token = process.env.TELEGRAM_TOKEN?.trim();
const gizli = process.env.TELEGRAM_GIZLI?.trim();
const worker = process.env.WORKER_URL?.trim().replace(/\/+$/, "");

if (!token || !gizli || !worker) {
  console.error("TELEGRAM_TOKEN, TELEGRAM_GIZLI ve WORKER_URL ortam değişkenleri gerekli.");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(gizli)) {
  // Telegram secret_token'da yalnızca bu karakterlere izin veriyor.
  console.error("TELEGRAM_GIZLI yalnızca harf, rakam, _ ve - içerebilir (en çok 256).");
  process.exit(1);
}

async function api(yontem: string, govde: unknown = {}): Promise<unknown> {
  const c = await fetch(`https://api.telegram.org/bot${token}/${yontem}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  const j = (await c.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!j.ok) throw new Error(`${yontem}: ${j.description}`);
  return j.result;
}

await api("setWebhook", {
  url: `${worker}/telegram`,
  secret_token: gizli,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
console.log("✓ webhook kuruldu");

await api("setMyCommands", { commands: KOMUTLAR.map((k) => ({ command: k.komut, description: k.aciklama })) });
console.log("✓ komut menüsü tanıtıldı");

const bilgi = (await api("getWebhookInfo")) as { url?: string; pending_update_count?: number; last_error_message?: string };
console.log(`  adres: ${bilgi.url}`);
console.log(`  bekleyen: ${bilgi.pending_update_count ?? 0}`);
if (bilgi.last_error_message) console.log(`  son hata: ${bilgi.last_error_message}`);
console.log("\nŞimdi bota /start yaz. SAHIP_CHAT_ID boşsa chat id'ni söyler.");
