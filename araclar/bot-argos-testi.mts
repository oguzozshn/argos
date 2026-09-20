/**
 * Argos'un Worker'la eşitleme çekirdeği testi: `node araclar/bot-argos-testi.mts`
 *
 * Geçici bir veri klasörü kurulur, `fetch` sahte Worker'a çevrilir. Gerçek
 * veri klasörüne ve ağa dokunulmaz.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BotHata, anlikGonder, kuyruguIsle } from "../src/main/bot-cekirdek.ts";
import type { Anlik, KuyrukKaydi, KuyrukSonucu } from "../src/ortak/bot.ts";
import type { Hafta } from "../src/ortak/plan.ts";

let gecen = 0;
let kalan = 0;
function kontrol(ad: string, kosul: unknown, ek = ""): void {
  if (kosul) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}${ek ? " — " + ek : ""}`);
  }
}

const BUGUN = "2026-09-19";
const kok = mkdtempSync(join(tmpdir(), "argos-bot-"));
const hafta: Hafta = {
  hafta: 38,
  yil: 2026,
  baslik: "",
  gunler: [1, 2, 3, 4, 5, 6, 7].map((no) => ({ no, ad: "", tarih: "", isoTarih: `2026-09-${String(13 + no).padStart(2, "0")}` })),
  slotlar: [{ id: "W38-D6-09", gun: 6, saat: "09:00", sureDk: 60, alan: "Tez", konu: "Okuma", durum: "planli" }],
  kullanilmisIdler: ["W38-D6-09"],
};
writeFileSync(join(kok, "W38.json"), JSON.stringify(hafta));
writeFileSync(join(kok, "kurallar.json"), JSON.stringify({ alanlar: ["Tez", "Spor"], hatirla: { gunlukAdet: 2 } }));
writeFileSync(join(kok, "hatirla.json"), JSON.stringify({ maddeler: [{ id: "h1", metin: "Eski not", eklendi: BUGUN }] }));

// Sahte Worker.
let kuyruk: KuyrukKaydi[] = [];
let sonAnlik: Anlik | null = null;
let gelenSonuclar: KuyrukSonucu[] = [];
let yanitKodu = 200;
const asil = globalThis.fetch;
globalThis.fetch = (async (girdi: string | URL | Request, secenek?: RequestInit) => {
  const url = new URL(String(girdi));
  const yetkili = (secenek?.headers as Record<string, string>)?.Authorization === "Bearer anahtar";
  if (yanitKodu !== 200 || !yetkili) return new Response("x", { status: yetkili ? yanitKodu : 401 });
  if (url.pathname === "/anlik") sonAnlik = JSON.parse(String(secenek?.body));
  if (url.pathname === "/kuyruk") return Response.json(kuyruk);
  if (url.pathname === "/kuyruk/sonuc") gelenSonuclar = JSON.parse(String(secenek?.body)).sonuclar;
  return new Response("tamam");
}) as typeof fetch;

const AYAR = { url: "https://worker.test/", anahtar: "anahtar" };
const haftaOku = (): Hafta => JSON.parse(readFileSync(join(kok, "W38.json"), "utf8"));
const hatirlaOku = () => JSON.parse(readFileSync(join(kok, "hatirla.json"), "utf8"));

try {
  console.log("\ngörünüm");
  await anlikGonder(kok, AYAR, BUGUN, "2026-09-19T06:00:00.000Z");
  // Sahte fetch içinde atanıyor; TS bunu göremiyor.
  const gelen = sonAnlik as Anlik | null;
  kontrol("gönderildi, iki gün (Cmt, Paz)", gelen && Object.keys(gelen.gunler).length === 2);
  kontrol("Hatırla adedi kurallardan", gelen?.gunler[BUGUN]?.hatirla.length === 1);

  console.log("\nkuyruk");
  kuyruk = [
    { id: "u1", tur: "slot", zaman: "2026-09-19T07:00:00.000Z", tarih: "2026-09-20", saat: "16:00", sureDk: 30, alan: "spor", konu: "Koşu" },
    { id: "u2", tur: "not", zaman: "2026-09-19T07:01:00.000Z", metin: "Faturayı sor" },
    { id: "u3", tur: "slot", zaman: "2026-09-19T07:02:00.000Z", tarih: "2026-09-28", saat: "10:00", sureDk: 60, alan: null, konu: "Uzak" },
    { id: "u4", tur: "slot", zaman: "2026-09-19T07:03:00.000Z", tarih: BUGUN, saat: "09:30", sureDk: 60, alan: null, konu: "Çakışan" },
  ];
  const s1 = await kuyruguIsle(kok, AYAR, BUGUN);
  const h = haftaOku();
  const kosu = h.slotlar.find((x) => x.konu === "Koşu");
  kontrol("slot doğru güne, doğru kimlikle", kosu?.gun === 7 && kosu.id === "W38-D7-16" && kosu.alan === "Spor", JSON.stringify(kosu));
  kontrol("kimlik kullanılmışlara eklendi", h.kullanilmisIdler?.includes("W38-D7-16"));
  kontrol("not Hatırla'ya", hatirlaOku().maddeler.some((m: { metin: string }) => m.metin === "Faturayı sor"));
  kontrol("eklenen adları", s1.eklenenler.length === 3, JSON.stringify(s1.eklenenler));
  const r3 = gelenSonuclar.find((x) => x.id === "u3");
  kontrol("haftası olmayan reddedildi", r3?.durum === "reddedildi");
  const r4 = gelenSonuclar.find((x) => x.id === "u4");
  kontrol("çakışma notu Worker'a gitti", r4?.durum === "eklendi" && (r4.not ?? "").includes("09:00 Okuma"), JSON.stringify(r4));
  kontrol("dört sonuç bildirildi", gelenSonuclar.length === 4);
  kontrol(".bak yedeği bırakıldı", readFileSync(join(kok, "W38.json.bak"), "utf8").length > 0);

  console.log("\nyeniden gelen kayıtlar");
  kuyruk = kuyruk.filter((k) => k.id !== "u3");
  const s2 = await kuyruguIsle(kok, AYAR, BUGUN);
  kontrol("ikinci kez eklenmez", haftaOku().slotlar.filter((x) => x.konu === "Koşu").length === 1);
  kontrol("not ikinci kez eklenmez", hatirlaOku().maddeler.filter((m: { metin: string }) => m.metin === "Faturayı sor").length === 1);
  kontrol("yine de 'eklendi' bildirilir, toast yok", s2.eklenenler.length === 0 && gelenSonuclar.every((x) => x.durum === "eklendi"));

  console.log("\ndurum işareti");
  kuyruk = [
    { id: "u5", tur: "durum", zaman: "2026-09-19T08:00:00.000Z", tarih: BUGUN, slotId: "W38-D6-09", durum: "yapildi", ad: "09:00 Okuma" },
    { id: "u6", tur: "durum", zaman: "2026-09-19T08:00:00.000Z", tarih: BUGUN, slotId: "yok", durum: "yapildi", ad: "hayalet" },
  ];
  const sd = await kuyruguIsle(kok, AYAR, BUGUN);
  kontrol("slot yapıldı olarak yazıldı", haftaOku().slotlar.find((x) => x.id === "W38-D6-09")?.durum === "yapildi");
  kontrol("işaret toast'a düşer", sd.eklenenler.some((x) => x.includes("09:00 Okuma")));
  kontrol("olmayan slot reddedilir", gelenSonuclar.find((x) => x.id === "u6")?.durum === "reddedildi");
  kontrol("ikinci kez yazılmaz", (await kuyruguIsle(kok, AYAR, BUGUN)).eklenenler.length === 0);
  kuyruk = [];

  console.log("\nhatalar");
  kuyruk = [];
  const bos = await kuyruguIsle(kok, AYAR, BUGUN);
  kontrol("boş kuyruk sessiz", bos.sonuclar.length === 0);
  let hata: unknown = null;
  try {
    await kuyruguIsle(kok, { ...AYAR, anahtar: "yanlis" }, BUGUN);
  } catch (e) {
    hata = e;
  }
  kontrol("yanlış anahtar anlaşılır hata", hata instanceof BotHata && hata.message.includes("anahtarı kabul etmedi"));
  yanitKodu = 503;
  hata = null;
  try {
    await anlikGonder(kok, AYAR, BUGUN, "x");
  } catch (e) {
    hata = e;
  }
  kontrol("Worker hatası anlaşılır", hata instanceof BotHata && hata.message === "Worker 503");
} finally {
  globalThis.fetch = asil;
  rmSync(kok, { recursive: true, force: true });
}

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
