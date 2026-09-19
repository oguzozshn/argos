/**
 * Argos Telegram botu. Bilgisayar kapalıyken de çalışır.
 *
 *  POST /telegram        Telegram'ın webhook'u: komutlar ve düğmeler.
 *  PUT  /anlik           Argos'un gönderdiği plan görünümü (14 gün).
 *  GET  /kuyruk          Argos'un çekeceği bekleyen eklemeler.
 *  POST /kuyruk/sonuc    Argos'un "işledim / işleyemedim" cevabı.
 *  cron 05:00 UTC        Sabah özeti.
 *
 * Yerel plan dosyalarını görmez: Argos'un bıraktığı görünümü okur ve
 * yerele yazılacak eklemeleri kuyrukta bekletir. Kurallar Argos'ta.
 */

import {
  YARDIM_METNI,
  gunMesaji,
  komutCoz,
  kuyrukOnayi,
  kacis,
  tarihBasligi,
  type Anlik,
  type KuyrukKaydi,
  type KuyrukSonucu,
} from "../../src/ortak/bot.ts";
import { gunEkle } from "../../src/ortak/gun.ts";
import type { TodoistGorev } from "../../src/ortak/tipler.ts";
import { bugunVeGecikmis, hizliEkle, tarihAraligi } from "../../src/main/todoist-cekirdek.ts";
import { dugmeyiCevapla, duzenle, gonder, telegramTabani, type Klavye } from "./telegram.ts";

export interface Env {
  ARGOS: KVNamespace;
  TELEGRAM_TOKEN: string;
  /** setWebhook'ta verilen `secret_token`; Telegram her istekte başlıkta yollar. */
  TELEGRAM_GIZLI: string;
  /** Boşken bot yalnızca yazanın chat id'sini söyler (kurulum). */
  SAHIP_CHAT_ID?: string;
  TODOIST_TOKEN: string;
  /** Argos'un uç noktalara erişim anahtarı. */
  ARGOS_ANAHTARI: string;
  /** Yalnızca yerel deneme: Telegram API yerine sahte sunucu. */
  TELEGRAM_API?: string;
}

const KUYRUK = "kuyruk:";
const ANLIK = "anlik";

/** İstanbul'a göre bugün. Worker UTC'de çalışıyor; 00:00–03:00 arası yoksa dün sayılırdı. */
export const bugunIstanbul = (d = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);

export default {
  async fetch(istek: Request, env: Env): Promise<Response> {
    telegramTabani(env.TELEGRAM_API);
    const url = new URL(istek.url);
    try {
      if (url.pathname === "/telegram" && istek.method === "POST") return await telegram(istek, env);
      if (url.pathname === "/anlik" && istek.method === "PUT") return await yetkili(istek, env, anlikAl);
      if (url.pathname === "/kuyruk" && istek.method === "GET") return await yetkili(istek, env, kuyrukVer);
      if (url.pathname === "/kuyruk/sonuc" && istek.method === "POST") return await yetkili(istek, env, sonucAl);
      if (url.pathname === "/" && istek.method === "GET") return new Response("argos-bot\n");
      return new Response("yok\n", { status: 404 });
    } catch (e) {
      console.error("[bot]", e);
      return new Response("hata\n", { status: 500 });
    }
  },

  async scheduled(_olay: ScheduledController, env: Env): Promise<void> {
    telegramTabani(env.TELEGRAM_API);
    if (!env.SAHIP_CHAT_ID) return;
    const bugun = bugunIstanbul();
    await gonder(env.TELEGRAM_TOKEN, env.SAHIP_CHAT_ID, await gunMetni(env, bugun, bugun), gunKlavyesi(bugun, bugun));
  },
} satisfies ExportedHandler<Env>;

/* --- yetki --------------------------------------------------------------- */

/** Sabit süreli karşılaştırma: anahtar harf harf tahmin edilemesin. */
function esitMi(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.byteLength !== y.byteLength || x.byteLength === 0) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

async function yetkili(
  istek: Request,
  env: Env,
  f: (istek: Request, env: Env) => Promise<Response>,
): Promise<Response> {
  const baslik = istek.headers.get("Authorization") ?? "";
  if (!env.ARGOS_ANAHTARI || !esitMi(baslik, `Bearer ${env.ARGOS_ANAHTARI}`)) {
    return new Response("yetkisiz\n", { status: 401 });
  }
  return f(istek, env);
}

/* --- Argos uçları -------------------------------------------------------- */

async function anlikAl(istek: Request, env: Env): Promise<Response> {
  const a = (await istek.json().catch(() => null)) as Anlik | null;
  if (!a || typeof a.guncellendi !== "string" || typeof a.gunler !== "object" || a.gunler === null) {
    return new Response("geçersiz görünüm\n", { status: 400 });
  }
  await env.ARGOS.put(ANLIK, JSON.stringify(a));
  return new Response("tamam\n");
}

async function bekleyenler(env: Env): Promise<KuyrukKaydi[]> {
  const liste = await env.ARGOS.list({ prefix: KUYRUK });
  const kayitlar = await Promise.all(liste.keys.map((k) => env.ARGOS.get<KuyrukKaydi>(k.name, "json")));
  return kayitlar.filter((k): k is KuyrukKaydi => k !== null).sort((a, b) => (a.zaman < b.zaman ? -1 : 1));
}

async function kuyrukVer(_istek: Request, env: Env): Promise<Response> {
  return Response.json(await bekleyenler(env));
}

/**
 * Argos'un işleme sonucu. Reddedilen ya da notlu eklemeler Telegram'a
 * bildirilir — kullanıcı eklemenin plana düşmediğini başka türlü bilemez.
 */
async function sonucAl(istek: Request, env: Env): Promise<Response> {
  const g = (await istek.json().catch(() => null)) as { sonuclar?: KuyrukSonucu[] } | null;
  if (!Array.isArray(g?.sonuclar)) return new Response("geçersiz\n", { status: 400 });
  for (const s of g.sonuclar) {
    if (typeof s?.id !== "string") continue;
    const anahtar = KUYRUK + s.id;
    const k = await env.ARGOS.get<KuyrukKaydi>(anahtar, "json");
    if (!k) continue;
    const ad = k.tur === "slot" ? `${tarihBasligi(k.tarih)} ${k.saat} ${k.konu}` : k.metin;
    let mesaj: string | null = null;
    if (s.durum === "reddedildi") mesaj = `⚠️ Eklenemedi: ${kacis(ad)}\n${kacis(s.sebep)}`;
    else if (s.not) mesaj = `✅ Plana işlendi: ${kacis(ad)}\nℹ️ ${kacis(s.not)}`;
    if (mesaj && env.SAHIP_CHAT_ID) {
      await gonder(env.TELEGRAM_TOKEN, env.SAHIP_CHAT_ID, mesaj).catch((e) => console.error("[bot] bildirim", e));
    }
    await env.ARGOS.delete(anahtar);
  }
  return new Response("tamam\n");
}

/* --- Telegram ------------------------------------------------------------ */

interface Guncelleme {
  update_id: number;
  message?: { message_id: number; chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

/**
 * Telegram 200 almazsa aynı güncellemeyi yeniden yollar; o yüzden içerideki
 * hatalar yakalanıp kullanıcıya söylenir ve yine 200 dönülür. Yeniden
 * gönderilen güncelleme ayrıca `islendi:<update_id>` ile elenir — yoksa
 * aynı görev Todoist'e iki kez eklenirdi.
 */
async function telegram(istek: Request, env: Env): Promise<Response> {
  if (!esitMi(istek.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "", env.TELEGRAM_GIZLI ?? "")) {
    return new Response("yetkisiz\n", { status: 401 });
  }
  const g = (await istek.json().catch(() => null)) as Guncelleme | null;
  if (!g || typeof g.update_id !== "number") return new Response("tamam\n");

  const chatId = g.message?.chat.id ?? g.callback_query?.message?.chat.id;
  if (chatId === undefined) return new Response("tamam\n");

  // Kurulum: sahip henüz belli değilse yalnızca kimliği söyle.
  if (!env.SAHIP_CHAT_ID) {
    await gonder(env.TELEGRAM_TOKEN, chatId, `Chat id'n: <code>${chatId}</code>\nBunu SAHIP_CHAT_ID olarak gir.`);
    return new Response("tamam\n");
  }
  // Bot adını bulan herkes yazabilir; sahibinden başkasına cevap yok.
  if (String(chatId) !== env.SAHIP_CHAT_ID.trim()) return new Response("tamam\n");

  const islendi = `islendi:${g.update_id}`;
  if (await env.ARGOS.get(islendi)) return new Response("tamam\n");

  try {
    if (g.callback_query) await dugme(env, g.callback_query, chatId);
    else if (g.message?.text !== undefined) await mesaj(env, g.update_id, chatId, g.message.text);
  } catch (e) {
    console.error("[bot]", e);
    await gonder(env.TELEGRAM_TOKEN, chatId, `Bir şey ters gitti: ${kacis(e instanceof Error ? e.message : String(e))}`).catch(
      () => undefined,
    );
  }
  await env.ARGOS.put(islendi, "1", { expirationTtl: 86400 });
  return new Response("tamam\n");
}

async function mesaj(env: Env, updateId: number, chatId: number, metin: string): Promise<void> {
  const bugun = bugunIstanbul();
  const k = komutCoz(metin, bugun);
  const yaz = (m: string, klavye?: Klavye) => gonder(env.TELEGRAM_TOKEN, chatId, m, klavye);

  switch (k.tur) {
    case "yardim":
      await yaz(YARDIM_METNI);
      return;
    case "hata":
      await yaz(kacis(k.mesaj));
      return;
    case "gun":
      await yaz(await gunMetni(env, k.tarih, bugun), gunKlavyesi(k.tarih, bugun));
      return;
    case "todoist": {
      let gorev;
      try {
        gorev = await hizliEkle(env.TODOIST_TOKEN, k.metin);
      } catch (e) {
        await yaz(`❌ Todoist'e eklenemedi: ${kacis(e instanceof Error ? e.message : String(e))}`);
        return;
      }
      await yaz(`✅ Todoist'e eklendi: ${kacis(gorev.icerik)}${gorev.tarihMetni ? ` · ${kacis(gorev.tarihMetni)}` : ""}`);
      return;
    }
    case "slot":
    case "not": {
      // Kimlik güncellemeden türer: Telegram aynı mesajı yeniden yollarsa
      // aynı anahtara yazılır, kuyrukta çift kayıt olmaz.
      const id = `u${updateId}`;
      const zaman = new Date().toISOString();
      const kayit: KuyrukKaydi =
        k.tur === "slot"
          ? { id, tur: "slot", zaman, tarih: k.tarih, saat: k.saat, sureDk: k.sureDk, alan: k.alan, konu: k.konu }
          : { id, tur: "not", zaman, metin: k.metin };
      await env.ARGOS.put(KUYRUK + id, JSON.stringify(kayit));
      await yaz(kuyrukOnayi(kayit, bugun));
      return;
    }
  }
}

/** Düğme verisi `gun:<iso>`: mesaj o günle yerinde yenilenir. */
async function dugme(env: Env, q: NonNullable<Guncelleme["callback_query"]>, chatId: number): Promise<void> {
  const tarih = q.data?.startsWith("gun:") ? q.data.slice(4) : null;
  if (!tarih || !/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !q.message) {
    await dugmeyiCevapla(env.TELEGRAM_TOKEN, q.id);
    return;
  }
  const bugun = bugunIstanbul();
  await duzenle(env.TELEGRAM_TOKEN, chatId, q.message.message_id, await gunMetni(env, tarih, bugun), gunKlavyesi(tarih, bugun));
  await dugmeyiCevapla(env.TELEGRAM_TOKEN, q.id, "Güncellendi");
}

function gunKlavyesi(tarih: string, bugun: string): Klavye {
  const satir = [{ text: "🔄 Yenile", callback_data: `gun:${tarih}` }];
  if (tarih > bugun) satir.unshift({ text: "◀️ Önceki", callback_data: `gun:${gunEkle(tarih, -1)}` });
  satir.push({ text: "Sonraki ▶️", callback_data: `gun:${gunEkle(tarih, 1)}` });
  return [satir];
}

/** Bir günün mesajı: KV'deki görünüm + kuyruk + canlı Todoist. */
async function gunMetni(env: Env, tarih: string, bugun: string): Promise<string> {
  const [anlik, kuyruk, gorevler] = await Promise.all([
    env.ARGOS.get<Anlik>(ANLIK, "json"),
    bekleyenler(env),
    gununGorevleri(env, tarih, bugun),
  ]);
  return gunMesaji(tarih, bugun, anlik, gorevler, kuyruk);
}

/**
 * Bugün için bugün + gecikmişler (Argos'un Bugün kartıyla aynı süzgeç);
 * başka gün için yalnızca o güne düşenler. Todoist'in aralık süzgeci uçları
 * dışladığı için bir gün pay bırakılıp sonra elenir.
 */
async function gununGorevleri(env: Env, tarih: string, bugun: string): Promise<TodoistGorev[] | { hata: string }> {
  try {
    if (tarih === bugun) return await bugunVeGecikmis(env.TODOIST_TOKEN);
    const hepsi = await tarihAraligi(env.TODOIST_TOKEN, gunEkle(tarih, -1), gunEkle(tarih, 1));
    return hepsi.filter((g) => g.tarih?.slice(0, 10) === tarih);
  } catch (e) {
    return { hata: e instanceof Error ? e.message : String(e) };
  }
}
