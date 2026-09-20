// Uzantılar açık: bu dosya düz Node ile de koşuyor (araclar/bot-argos-testi.mts).
import {
  anlikKur,
  durumKaydiniUygula,
  gunuBul,
  notKaydiniUygula,
  slotKaydiniUygula,
  type Anlik,
  type HatirlaDosyasi,
  type KuyrukKaydi,
  type KuyrukSonucu,
  type Uygulama,
} from "../ortak/bot.ts";
import type { Kurallar } from "../ortak/ozet.ts";
import type { Hafta } from "../ortak/plan.ts";
import { listele, oku, yaz } from "./veri-cekirdek.ts";

/**
 * Argos'un Telegram Worker'ıyla konuşan çekirdeği. Electron'a bağlı DEĞİL:
 * kök dizini ve Worker ayarını dışarıdan alır (veri-cekirdek, todoist-cekirdek
 * ile aynı kalıp). Zamanlama ve tetikleyiciler `bot.ts`'te.
 */

export interface BotAyari {
  url: string;
  anahtar: string;
}

export class BotHata extends Error {}

async function istek<T>(a: BotAyari, yol: string, yontem = "GET", govde?: unknown): Promise<T> {
  let cevap: Response;
  try {
    cevap = await fetch(a.url.replace(/\/+$/, "") + yol, {
      method: yontem,
      headers: {
        Authorization: `Bearer ${a.anahtar}`,
        ...(govde !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: govde !== undefined ? JSON.stringify(govde) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new BotHata(`Worker'a ulaşılamadı (${(e as Error).name === "TimeoutError" ? "zaman aşımı" : "bağlantı yok"})`);
  }
  if (cevap.status === 401) throw new BotHata("Worker anahtarı kabul etmedi");
  if (!cevap.ok) throw new BotHata(`Worker ${cevap.status}`);
  const metin = await cevap.text();
  return (yol === "/kuyruk" ? JSON.parse(metin) : metin) as T;
}

interface Kayit {
  kod: string;
  veri: Hafta;
  mtime: number | null;
}

async function haftalariOku(kok: string): Promise<Kayit[]> {
  const dosyalar = (await listele(kok, ".")).filter((d) => /^W\d{1,2}\.json$/.test(d));
  const okunan = await Promise.all(
    dosyalar.map(async (d) => {
      const o = await oku<Hafta>(kok, d);
      return o.veri ? { kod: d.slice(0, -5), veri: o.veri, mtime: o.mtime } : null;
    }),
  );
  return okunan.filter((x): x is Kayit => x !== null);
}

/** Kural ya da Hatırla dosyası bozuksa görünüm yine gider; o kısım boş kalır. */
async function sessizOku<T>(kok: string, yol: string): Promise<T | null> {
  try {
    return (await oku<T>(kok, yol)).veri;
  } catch {
    return null;
  }
}

export async function anlikUret(kok: string, bugun: string, simdi: string): Promise<Anlik> {
  const [haftalar, kurallar, hatirla] = await Promise.all([
    haftalariOku(kok),
    sessizOku<Kurallar>(kok, "kurallar.json"),
    sessizOku<HatirlaDosyasi>(kok, "hatirla.json"),
  ]);
  return anlikKur(
    haftalar,
    bugun,
    hatirla ? { maddeler: hatirla.maddeler ?? [], gunlukAdet: kurallar?.hatirla?.gunlukAdet ?? 3 } : null,
    simdi,
  );
}

export async function anlikGonder(kok: string, a: BotAyari, bugun: string, simdi: string): Promise<void> {
  await istek(a, "/anlik", "PUT", await anlikUret(kok, bugun, simdi));
}

export interface IslemSonucu {
  /** Yerel dosyaya yazılanların kısa adı: toast için. */
  eklenenler: string[];
  /** Bu turda işlenemeyip kuyrukta bırakılanlar (dosya kilitli vb.). */
  bekleyen: number;
  sonuclar: KuyrukSonucu[];
}

function kayitAdi(k: KuyrukKaydi): string {
  if (k.tur === "slot") return `${k.tarih.slice(8, 10)}.${k.tarih.slice(5, 7)} ${k.saat} ${k.konu}`;
  if (k.tur === "durum") return `${k.ad} ☑`;
  return `Hatırla: ${k.metin}`;
}

/**
 * Bir dosyaya uygulayıp yazar. Dosya okunduktan sonra dışarıdan değiştiyse
 * (arayüz, app.py) yeni hâl üzerinden bir kez daha denenir; olmazsa kayıt
 * kuyrukta kalır, sonraki turda yeniden gelir.
 */
async function uygulaVeYaz<T>(
  kok: string,
  yol: string,
  uygula: (veri: T | null) => Uygulama<T>,
): Promise<Uygulama<T> | { tur: "sonra"; sebep: string }> {
  let okuma = await oku<T>(kok, yol);
  for (let deneme = 0; deneme < 2; deneme++) {
    const u = uygula(okuma.veri);
    if (u.tur !== "eklendi") return u;
    const y = await yaz(kok, yol, u.veri, okuma.mtime);
    if (y.ok) return u;
    if (y.sebep === "hata") return { tur: "sonra", sebep: y.mesaj };
    okuma = y.guncel as typeof okuma;
  }
  return { tur: "sonra", sebep: `${yol} yazılırken iki kez değişti` };
}

/**
 * Kuyruğu çeker, her kaydı yerel dosyaya işler, sonucu Worker'a bildirir.
 *
 * Sıra önemli: önce dosyaya yazılır, sonra Worker'a "eklendi" denir. Arada
 * kapanırsa kayıt yeniden gelir; çekirdekteki "zaten var" denetimi ikinci
 * kez eklemeyi önler.
 */
export async function kuyruguIsle(kok: string, a: BotAyari, bugun: string): Promise<IslemSonucu> {
  const kayitlar = await istek<KuyrukKaydi[]>(a, "/kuyruk");
  const sonuc: IslemSonucu = { eklenenler: [], bekleyen: 0, sonuclar: [] };
  if (kayitlar.length === 0) return sonuc;

  const kurallar = await sessizOku<Kurallar>(kok, "kurallar.json");

  for (const k of kayitlar) {
    let u: Uygulama<unknown> | { tur: "sonra"; sebep: string };
    try {
      if (k.tur === "slot") {
        const hedef = gunuBul(await haftalariOku(kok), k.tarih);
        if (!hedef) {
          sonuc.sonuclar.push({ id: k.id, durum: "reddedildi", sebep: `${k.tarih} için hafta dosyası yok — önce haftayı kur` });
          continue;
        }
        u = await uygulaVeYaz<Hafta>(kok, `${hedef.kod}.json`, (v) =>
          v ? slotKaydiniUygula(v, k, kurallar?.alanlar) : { tur: "reddet", sebep: `${hedef.kod}.json okunamadı` },
        );
      } else if (k.tur === "durum") {
        const hedef = gunuBul(await haftalariOku(kok), k.tarih);
        if (!hedef) {
          sonuc.sonuclar.push({ id: k.id, durum: "reddedildi", sebep: `${k.tarih} için hafta dosyası yok` });
          continue;
        }
        u = await uygulaVeYaz<Hafta>(kok, `${hedef.kod}.json`, (v) =>
          v ? durumKaydiniUygula(v, k) : { tur: "reddet", sebep: `${hedef.kod}.json okunamadı` },
        );
      } else {
        u = await uygulaVeYaz<HatirlaDosyasi>(kok, "hatirla.json", (d) => notKaydiniUygula(d, k, bugun));
      }
    } catch (e) {
      u = { tur: "sonra", sebep: e instanceof Error ? e.message : String(e) };
    }

    if (u.tur === "sonra") {
      console.error(`[bot] ${k.id} bu tur işlenemedi: ${u.sebep}`);
      sonuc.bekleyen++;
    } else if (u.tur === "reddet") {
      sonuc.sonuclar.push({ id: k.id, durum: "reddedildi", sebep: u.sebep });
    } else {
      if (u.tur === "eklendi") sonuc.eklenenler.push(kayitAdi(k));
      sonuc.sonuclar.push({ id: k.id, durum: "eklendi", ...(u.tur === "eklendi" && u.not ? { not: u.not } : {}) });
    }
  }

  if (sonuc.sonuclar.length > 0) await istek(a, "/kuyruk/sonuc", "POST", { sonuclar: sonuc.sonuclar });
  return sonuc;
}
