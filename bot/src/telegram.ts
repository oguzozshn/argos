/**
 * Telegram Bot API'nin kullanılan birkaç çağrısı. Kütüphane yok: her çağrı
 * tek bir JSON POST.
 */

export interface Dugme {
  text: string;
  callback_data: string;
}

export type Klavye = Dugme[][];

export class TelegramHata extends Error {}

let taban = "https://api.telegram.org";

/** Yerel denemede Telegram yerine sahte bir sunucu (TELEGRAM_API). */
export function telegramTabani(url: string | undefined): void {
  taban = url?.trim().replace(/\/+$/, "") || "https://api.telegram.org";
}

async function api(token: string, yontem: string, govde: unknown): Promise<unknown> {
  const cevap = await fetch(`${taban}/bot${token}/${yontem}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(govde),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await cevap.json().catch(() => null)) as { ok?: boolean; description?: string; result?: unknown } | null;
  if (!j?.ok) throw new TelegramHata(`Telegram ${yontem}: ${j?.description ?? cevap.status}`);
  return j.result;
}

export const gonder = (token: string, chatId: string | number, metin: string, klavye?: Klavye) =>
  api(token, "sendMessage", {
    chat_id: chatId,
    text: metin,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(klavye ? { reply_markup: { inline_keyboard: klavye } } : {}),
  });

/**
 * Düğmeye basılınca mesaj yerinde güncellenir, sohbet uzamasın. İçerik
 * aynıysa Telegram "message is not modified" der — hata sayılmaz.
 */
export async function duzenle(
  token: string,
  chatId: string | number,
  mesajId: number,
  metin: string,
  klavye?: Klavye,
): Promise<void> {
  try {
    await api(token, "editMessageText", {
      chat_id: chatId,
      message_id: mesajId,
      text: metin,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(klavye ? { reply_markup: { inline_keyboard: klavye } } : {}),
    });
  } catch (e) {
    if (!String(e).includes("message is not modified")) throw e;
  }
}

/** Düğmedeki bekleme simgesini kapatır; metin verilirse kısa bir baloncuk gösterir. */
export const dugmeyiCevapla = (token: string, sorguId: string, metin?: string) =>
  api(token, "answerCallbackQuery", { callback_query_id: sorguId, ...(metin ? { text: metin } : {}) });
