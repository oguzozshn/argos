/**
 * Telegram botunun saf çekirdeği. İki taraf kullanıyor:
 *  - Argos (ana süreç): planın görünümünü üretir (`anlikKur`), Telegram'dan
 *    gelen eklemeleri yerel dosyalara uygular (`slotKaydiniUygula`,
 *    `notKaydiniUygula`).
 *  - Worker (`bot/`): komutu çözer (`komutCoz`), mesajı yazar (`gunMesaji`).
 *
 * Kural mantığı Argos tarafında kalır: slot kimliği, alışkanlık günleri,
 * alan seçimi. Worker yalnızca hazırlanmış görünümü okur — yerel dosyaları
 * görmüyor, kuralları bilmesi iki kopya demek olurdu.
 *
 * Electron'a da Worker'a da bağlı değil; `araclar/bot-testi.mts` sınıyor.
 */

import { AY_TAM, GUN_ADLARI, gunEkle, haftaninGunu, kSirala } from "./gun.ts";
import { metinPuani, sadelestir } from "./komut-ara.ts";
import { dakika, yeniSlotId } from "./kural.ts";
import { aliskanlikBekleniyor } from "./plan-islem.ts";
import { DURUM_ISARETI, hatirlaBugun, yeniHatirlaId, type Hafta, type HatirlaMaddesi, type Slot } from "./plan.ts";
import type { TodoistGorev } from "./tipler.ts";

/* --- görünüm (Argos → Worker) ------------------------------------------- */

export interface AnlikSlot {
  /** Hafta dosyasındaki slot kimliği; Telegram düğmesi bununla işaretliyor. */
  id: string;
  saat: string;
  sureDk: number;
  alan: string;
  konu: string;
  durum: string;
}

export interface AnlikGun {
  slotlar: AnlikSlot[];
  aliskanliklar: { ad: string; yapildi: boolean }[];
  /** Hatırla'nın o gün öne çıkardıkları; Hatırla ekranıyla aynı seçim. */
  hatirla: string[];
}

export interface Anlik {
  /** ISO zaman damgası: mesajdaki "plan son güncelleme" satırı. */
  guncellendi: string;
  gunler: Record<string, AnlikGun>;
}

export const ANLIK_GUN_SAYISI = 14;

/**
 * Bugünden başlayarak `gunSayisi` günün görünümü. Hafta dosyası olmayan
 * günler görünüme girmez; mesaj "plan yüklenmemiş" der.
 *
 * Taşınmış slotlar gösterilmez — başka güne gitmişler, orada görünüyorlar.
 * Alışkanlık beklentisi takvimle aynı: `beklenenGunler` yoksa her gün.
 */
export function anlikKur(
  haftalar: { veri: Hafta }[],
  bugun: string,
  hatirla: { maddeler: HatirlaMaddesi[]; gunlukAdet: number } | null,
  simdi: string,
  gunSayisi = ANLIK_GUN_SAYISI,
): Anlik {
  const gunler: Record<string, AnlikGun> = {};
  for (let i = 0; i < gunSayisi; i++) {
    const iso = gunEkle(bugun, i);
    const bulunan = gunuBul(haftalar, iso);
    if (!bulunan) continue;
    const { veri: v, no } = bulunan;
    const slotlar = (v.slotlar ?? [])
      .filter((s) => s.gun === no && s.durum !== "tasindi")
      .sort((a, b) => kSirala(a.saat, b.saat))
      .map((s) => ({ id: s.id, saat: s.saat, sureDk: s.sureDk, alan: s.alan, konu: s.konu, durum: s.durum }));
    const aliskanliklar = (v.gunlukAliskanliklar ?? [])
      .filter((a) => aliskanlikBekleniyor(a, no))
      .map((a) => ({ ad: a.ad, yapildi: Boolean((a.gunler ?? {})[String(no)]) }));
    const hatirlaGunu = hatirla
      ? hatirlaBugun(hatirla.maddeler, hatirla.gunlukAdet, yerelGun(iso)).map((m) => m.metin)
      : [];
    gunler[iso] = { slotlar, aliskanliklar, hatirla: hatirlaGunu };
  }
  return { guncellendi: simdi, gunler };
}

/** `hatirlaBugun` yerel tarih bileşenlerini okuyor; ISO günü yerel öğlene çevrilir. */
const yerelGun = (iso: string): Date =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12);

/** Tarihi içeren hafta ve o günün numarası. */
export function gunuBul<T extends { veri: Hafta }>(
  haftalar: T[],
  iso: string,
): (T & { no: number }) | null {
  for (const h of haftalar) {
    const g = (h.veri.gunler ?? []).find((x) => x.isoTarih === iso);
    if (g) return { ...h, no: g.no };
  }
  return null;
}

/* --- kuyruk (Worker → Argos) -------------------------------------------- */

export type KuyrukKaydi =
  | {
      id: string;
      tur: "slot";
      /** Worker'ın kaydı aldığı an, ISO. */
      zaman: string;
      tarih: string;
      saat: string;
      sureDk: number;
      /** Kullanıcının yazdığı alan (#Tez); Argos kurallardaki adla eşler. */
      alan: string | null;
      konu: string;
    }
  | { id: string; tur: "not"; zaman: string; metin: string }
  | {
      id: string;
      tur: "durum";
      zaman: string;
      tarih: string;
      slotId: string;
      /** Şimdilik yalnız "yapildi"; Telegram'dan başka durum verilmiyor. */
      durum: string;
      /** Bildirimde okunaklı olsun diye slotun adı. */
      ad: string;
    };

export type KuyrukSonucu =
  | { id: string; durum: "eklendi"; not?: string }
  | { id: string; durum: "reddedildi"; sebep: string };

export type Uygulama<T> =
  | { tur: "eklendi"; veri: T; not?: string }
  | { tur: "zatenVar" }
  | { tur: "reddet"; sebep: string };

/**
 * Telegram'dan gelen slotu hafta dosyasına ekler. Hafta ekranındaki
 * `slotEkle` ile aynı kurallar: kimlik `yeniSlotId`, bir kez verilen kimlik
 * `kullanilmisIdler`'e yazılır.
 *
 * Aynı gün, saat ve konu zaten varsa eklenmez: Argos dosyayı yazıp Worker'a
 * haber veremeden kapanırsa kayıt bir sonraki açılışta yeniden gelir.
 * Saat çakışması eklemeyi durdurmaz — Hafta ekranı da durdurmuyor — ama
 * not olarak söylenir.
 */
export function slotKaydiniUygula(
  v: Hafta,
  k: Extract<KuyrukKaydi, { tur: "slot" }>,
  alanlar: string[] | undefined,
): Uygulama<Hafta> {
  const gun = (v.gunler ?? []).find((g) => g.isoTarih === k.tarih);
  if (!gun) return { tur: "reddet", sebep: `${k.tarih} bu hafta dosyasında yok` };

  const konu = k.konu.trim();
  const ayni = (v.slotlar ?? []).some(
    (s) => s.gun === gun.no && s.saat === k.saat && s.konu.trim().toLocaleLowerCase("tr") === konu.toLocaleLowerCase("tr"),
  );
  if (ayni) return { tur: "zatenVar" };

  const notlar: string[] = [];
  const varsayilan = alanlar?.[0] ?? "Serbest";
  let alan = varsayilan;
  if (k.alan) {
    const bulunan = alanEsle(k.alan, alanlar ?? []);
    if (bulunan) alan = bulunan;
    else notlar.push(`"${k.alan}" diye bir alan yok, ${varsayilan} kullanıldı`);
  }

  const bas = dakika(k.saat);
  const son = bas + k.sureDk;
  const cakisan = (v.slotlar ?? []).filter(
    (s) =>
      s.gun === gun.no &&
      s.durum !== "tasindi" &&
      dakika(s.saat) < son &&
      bas < dakika(s.saat) + s.sureDk,
  );
  if (cakisan.length > 0) {
    notlar.push(`${cakisan.map((s) => `${s.saat} ${s.konu || s.alan}`).join(", ")} ile çakışıyor`);
  }

  const id = yeniSlotId(v, gun.no, k.saat);
  const yeni: Slot = {
    id,
    gun: gun.no,
    saat: k.saat,
    sureDk: k.sureDk,
    alan,
    konu,
    durum: "planli",
  };
  return {
    tur: "eklendi",
    veri: {
      ...v,
      slotlar: [...(v.slotlar ?? []), yeni],
      kullanilmisIdler: [...(v.kullanilmisIdler ?? []), id],
    },
    ...(notlar.length ? { not: notlar.join("; ") } : {}),
  };
}

/**
 * Telegram'dan gelen "yapıldı" işareti. Yalnızca slotun durumu değişir —
 * Bugün panosu ve Hafta ekranıyla aynı davranış; süre, roadmap ve Todoist'e
 * dokunulmaz. Slot zaten o durumdaysa dosya yeniden yazılmaz.
 */
export function durumKaydiniUygula(
  v: Hafta,
  k: Extract<KuyrukKaydi, { tur: "durum" }>,
): Uygulama<Hafta> {
  const slot = (v.slotlar ?? []).find((x) => x.id === k.slotId);
  if (!slot) return { tur: "reddet", sebep: `${k.slotId} bu hafta dosyasında yok` };
  if (slot.durum === k.durum) return { tur: "zatenVar" };
  return {
    tur: "eklendi",
    veri: { ...v, slotlar: v.slotlar.map((x) => (x.id === k.slotId ? { ...x, durum: k.durum } : x)) },
  };
}

/** Büyük/küçük harf ve Türkçe karakter farkı gözetmeden; tek bir ön ek eşleşmesi de kabul. */
export function alanEsle(yazilan: string, alanlar: string[]): string | null {
  const sade = (x: string) => x.trim().toLocaleLowerCase("tr");
  const y = sade(yazilan);
  const tam = alanlar.find((a) => sade(a) === y);
  if (tam) return tam;
  const onEk = alanlar.filter((a) => sade(a).startsWith(y));
  return onEk.length === 1 ? onEk[0]! : null;
}

export interface HatirlaDosyasi {
  maddeler: HatirlaMaddesi[];
}

/**
 * Telegram'dan gelen notu Hatırla'ya ekler. Aynı metin zaten açıkta
 * duruyorsa eklenmez (yeniden gelen kayıt). Kimlik kaydın alındığı andan
 * türer; aynı milisaniyeye düşen iki kayıt için ek harf verilir.
 */
export function notKaydiniUygula(
  dosya: HatirlaDosyasi | null,
  k: Extract<KuyrukKaydi, { tur: "not" }>,
  bugun: string,
): Uygulama<HatirlaDosyasi> {
  const maddeler = dosya?.maddeler ?? [];
  const metin = k.metin.trim();
  if (!metin) return { tur: "reddet", sebep: "not boş" };
  if (maddeler.some((m) => !m.arsiv && m.metin.trim() === metin)) return { tur: "zatenVar" };

  const kullanilan = new Set(maddeler.map((m) => m.id));
  const kok = yeniHatirlaId(new Date(k.zaman));
  let id = kok;
  for (let i = 0; kullanilan.has(id); i++) id = kok + String.fromCharCode(97 + (i % 26)) + (i >= 26 ? i : "");
  return {
    tur: "eklendi",
    veri: { ...(dosya ?? {}), maddeler: [...maddeler, { id, metin, eklendi: bugun, arsiv: false }] },
  };
}

/* --- komutlar ------------------------------------------------------------ */

export type Komut =
  | { tur: "gun"; tarih: string }
  | { tur: "slot"; tarih: string; saat: string; sureDk: number; alan: string | null; konu: string }
  | { tur: "not"; metin: string }
  | { tur: "kapat"; metin: string }
  | { tur: "todoist"; metin: string }
  | { tur: "yardim" }
  | { tur: "hata"; mesaj: string };

export const VARSAYILAN_SURE_DK = 60;

export const KOMUTLAR = [
  { komut: "bugun", aciklama: "Bugünün planı ve görevleri" },
  { komut: "yarin", aciklama: "Yarının planı ve görevleri" },
  { komut: "ekle", aciklama: "Plana slot ekle: /ekle yarın 16:00 Tez okuma 90dk" },
  { komut: "kapat", aciklama: "Bugünün görevini/slotunu kapat: /kapat evden çık" },
  { komut: "not", aciklama: "Hatırla'ya not ekle" },
  { komut: "yardim", aciklama: "Komutlar" },
];

export const YARDIM_METNI = [
  "<b>Komutlar</b>",
  "/bugun — bugünün planı ve görevleri",
  "/yarin — yarının planı",
  "/ekle [gün] SS:DD konu [süre] [#alan] — plana slot",
  "   örn. <code>/ekle yarın 16:00 Tez okuma 90dk #Tez</code>",
  "   gün: bugün, yarın, pzt…paz ya da 25.09; süre: 45dk, 1.5sa (varsayılan 60dk)",
  "/kapat ad — bugünün slotunu ya da Todoist görevini kapatır",
  "   örn. <code>/kapat evden çık</code>, <code>/kapat 15:00</code>",
  "   adın bir parçası yeter; birden çok iş eşleşirse bot sorar",
  "/not metin — Hatırla'ya not",
  "Düz yazı — Todoist'e görev (tarih, #proje, p1 anlaşılır)",
  "",
  "Plana ve Hatırla'ya eklenenler Argos açılınca bilgisayara işlenir.",
].join("\n");

const GUN_SOZCUKLERI: Record<string, number> = {
  pzt: 0, pazartesi: 0,
  sal: 1, sali: 1, salı: 1,
  çar: 2, car: 2, çarşamba: 2, carsamba: 2,
  per: 3, perşembe: 3, persembe: 3,
  cum: 4, cuma: 4,
  cmt: 5, cumartesi: 5,
  paz: 6, pazar: 6,
};

/**
 * Bir sözcüğü tarihe çevirir: bugün, yarın, gün adı (bugün dahil en yakın
 * gelecek o gün), GG.AA ya da GG.AA.YYYY. GG.AA geçmişte kalıyorsa gelecek yıl.
 */
export function tarihSozcugu(s: string, bugun: string): string | null {
  const x = s.toLocaleLowerCase("tr");
  if (x === "bugün" || x === "bugun") return bugun;
  if (x === "yarın" || x === "yarin") return gunEkle(bugun, 1);
  if (x in GUN_SOZCUKLERI) {
    const fark = (GUN_SOZCUKLERI[x]! - haftaninGunu(bugun) + 7) % 7;
    return gunEkle(bugun, fark);
  }
  const e = x.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/);
  if (!e) return null;
  const g = Number(e[1]);
  const a = Number(e[2]);
  if (g < 1 || g > 31 || a < 1 || a > 12) return null;
  let yil = e[3] ? Number(e[3]) : Number(bugun.slice(0, 4));
  const iso = (y: number) => `${y}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
  // 31.02 gibi olmayan günler: Date taşırıp başka güne çevirir, yakalanır.
  if (gunEkle(iso(yil), 0) !== iso(yil)) return null;
  if (!e[3] && iso(yil) < bugun) yil += 1;
  return iso(yil);
}

function saatSozcugu(s: string): string | null {
  const e = s.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!e) return null;
  const sa = Number(e[1]);
  const dk = Number(e[2]);
  if (sa > 23 || dk > 59) return null;
  return `${String(sa).padStart(2, "0")}:${String(dk).padStart(2, "0")}`;
}

function sureSozcugu(s: string): number | null {
  const e = s.toLocaleLowerCase("tr").match(/^(\d+(?:[.,]\d+)?)\s*(dk|dakika|sa|saat)$/);
  if (!e) return null;
  const n = Number(e[1]!.replace(",", "."));
  const dk = e[2]!.startsWith("s") ? Math.round(n * 60) : Math.round(n);
  return dk >= 5 && dk <= 12 * 60 ? dk : null;
}

/**
 * Telegram mesajını komuta çevirir. `/komut@BotAdı` biçimi de kabul
 * (gruplarda Telegram böyle yollar).
 *
 * `/ekle` sözdizimi: önce isteğe bağlı gün, sonra zorunlu saat; sondaki süre
 * ve #alan her sırada. Kalan sözcükler konu. Gün yalnızca en başta aranır:
 * "/ekle 10:00 Cuma sunumu" konusundaki "Cuma" tarihe dönüşmesin.
 */
export function komutCoz(ham: string, bugun: string): Komut {
  const metin = ham.trim();
  if (!metin) return { tur: "yardim" };
  if (!metin.startsWith("/")) return { tur: "todoist", metin };

  const [bas, ...kalan] = metin.split(/\s+/);
  const komut = bas!.slice(1).split("@")[0]!.toLocaleLowerCase("tr");
  const govde = kalan.join(" ");

  switch (komut) {
    case "start":
    case "yardim":
    case "yardım":
    case "help":
      return { tur: "yardim" };
    case "bugun":
    case "bugün":
      return { tur: "gun", tarih: bugun };
    case "yarin":
    case "yarın":
      return { tur: "gun", tarih: gunEkle(bugun, 1) };
    case "gun":
    case "gün": {
      const t = tarihSozcugu(govde, bugun);
      return t ? { tur: "gun", tarih: t } : { tur: "hata", mesaj: "Gün anlaşılmadı. Örnek: /gun cuma ya da /gun 25.09" };
    }
    case "not":
      return govde.trim()
        ? { tur: "not", metin: govde.trim() }
        : { tur: "hata", mesaj: "Not boş. Örnek: /not faturayı sor" };
    case "kapat":
      return govde.trim()
        ? { tur: "kapat", metin: govde.trim() }
        : { tur: "hata", mesaj: "Ne kapatılacak? Örnek: /kapat evden çık" };
    case "ekle":
      return ekleCoz(kalan, bugun);
    default:
      return { tur: "hata", mesaj: `/${komut} bilinmiyor. /yardim yaz.` };
  }
}

function ekleCoz(sozcukler: string[], bugun: string): Komut {
  const s = [...sozcukler];
  let tarih: string | null = null;
  let saat: string | null = null;

  // Gün yalnızca en başta, saat ondan hemen sonra.
  const t0 = s.length > 0 ? tarihSozcugu(s[0]!, bugun) : null;
  if (t0) {
    tarih = t0;
    s.shift();
  }
  const sa0 = s.length > 0 ? saatSozcugu(s[0]!) : null;
  if (sa0) {
    saat = sa0;
    s.shift();
  }

  let sureDk: number | null = null;
  let alan: string | null = null;
  while (s.length > 0) {
    const son = s[s.length - 1]!;
    const sure: number | null = sureDk === null ? sureSozcugu(son) : null;
    if (sure !== null) {
      sureDk = sure;
      s.pop();
      continue;
    }
    if (alan === null && /^#\S+$/.test(son)) {
      alan = son.slice(1);
      s.pop();
      continue;
    }
    break;
  }

  const ORNEK = "Örnek: /ekle yarın 16:00 Tez okuma 90dk";
  if (!saat) return { tur: "hata", mesaj: `Saat yok. ${ORNEK}` };
  const konu = s.join(" ").trim();
  if (!konu) return { tur: "hata", mesaj: `Konu yok. ${ORNEK}` };
  const t = tarih ?? bugun;
  if (t < bugun) return { tur: "hata", mesaj: "Geçmiş bir güne eklenemez." };
  return { tur: "slot", tarih: t, saat, sureDk: sureDk ?? VARSAYILAN_SURE_DK, alan, konu };
}

/* --- kapatma ------------------------------------------------------------- */

export interface KapatHedefi {
  tur: "slot" | "gorev";
  id: string;
  /** Kullanıcıya gösterilecek ad; slotta saat de var. */
  ad: string;
}

export type KapatSonucu =
  | { tur: "yok" }
  | { tur: "tek"; hedef: KapatHedefi }
  | { tur: "belirsiz"; adaylar: KapatHedefi[] };

/**
 * `/kapat <ad>` için hedefi arar: günün açık slotları ve Todoist görevleri
 * tek listede yarışır. Puanlama komut paletiyle aynı (`metinPuani`): tam ad >
 * baştan > sözcük başı > içinde geçme. Slotun saati de aranır: "/kapat 15:00".
 *
 * `slotlar` yalnızca açık olanlar olmalı — kapatılmış ya da kuyrukta
 * işaretlenmiş olan çağıran tarafında elenir.
 *
 * En yüksek puan tek başınaysa hedef odur; berabere kalanlar kullanıcıya
 * sorulur: yanlış görevi kapatmak Telegram'dan geri alınamıyor.
 */
export function kapatCoz(sorgu: string, slotlar: AnlikSlot[], gorevler: TodoistGorev[]): KapatSonucu {
  const q = sadelestir(sorgu);
  if (!q) return { tur: "yok" };

  const adaylar = [
    ...slotlar.map((s) => ({
      hedef: { tur: "slot" as const, id: s.id, ad: `${s.saat} ${s.konu || s.alan}` },
      puan: Math.max(metinPuani(q, s.konu || s.alan), metinPuani(q, s.saat)),
    })),
    ...gorevler.map((g) => ({
      hedef: { tur: "gorev" as const, id: g.id, ad: g.icerik },
      puan: metinPuani(q, g.icerik),
    })),
  ]
    .filter((a) => a.puan > 0)
    .sort((a, b) => b.puan - a.puan);

  if (adaylar.length === 0) return { tur: "yok" };
  const enIyi = adaylar[0]!.puan;
  const basta = adaylar.filter((a) => a.puan === enIyi);
  return basta.length > 1
    ? { tur: "belirsiz", adaylar: basta.map((a) => a.hedef) }
    : { tur: "tek", hedef: adaylar[0]!.hedef };
}

/** `/kapat` eşleşmediğinde ya da birden çok işe uyduğunda verilen cevap. */
export function kapatCevabi(sonuc: Extract<KapatSonucu, { tur: "yok" | "belirsiz" }>, sorgu: string): string {
  if (sonuc.tur === "yok") return `🤔 "${kacis(sorgu)}" diye açık bir iş yok. /bugun ile listeye bak.`;
  return [
    `🤔 "${kacis(sorgu)}" birden çok işe uyuyor:`,
    ...sonuc.adaylar.map((h) => `${h.tur === "slot" ? "☐" : "📋"} ${kacis(h.ad)}`),
    "Daha uzun yaz.",
  ].join("\n");
}

/* --- mesaj --------------------------------------------------------------- */

/** Telegram HTML kipi yalnızca bu üçünü kaçış ister. */
export const kacis = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function tarihBasligi(iso: string): string {
  const gun = GUN_ADLARI[haftaninGunu(iso)];
  return `${gun} ${Number(iso.slice(8, 10))} ${AY_TAM[Number(iso.slice(5, 7)) - 1]}`;
}

const sureMetni = (dk: number): string =>
  dk % 60 === 0 ? `${dk / 60} sa` : dk > 60 ? `${Math.floor(dk / 60)} sa ${dk % 60} dk` : `${dk} dk`;

/** "2026-09-18T21:14:00Z" → "18 Eyl 21:14"; bugünse yalnız saat. İstanbul saatiyle. */
export function guncellemeMetni(zaman: string, bugun: string): string {
  const d = new Date(zaman);
  if (Number.isNaN(d.getTime())) return "bilinmiyor";
  const parca = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const al = (t: string) => parca.find((p) => p.type === t)?.value ?? "";
  const iso = `${al("year")}-${al("month")}-${al("day")}`;
  const saat = `${al("hour")}:${al("minute")}`;
  if (iso === bugun) return `bugün ${saat}`;
  if (iso === gunEkle(bugun, -1)) return `dün ${saat}`;
  return `${Number(al("day"))} ${AY_TAM[Number(al("month")) - 1]} ${saat}`;
}

/**
 * Bir günün Telegram mesajı (HTML kipi).
 *
 * `gorevler` o güne düşen Todoist görevleri; bugünse gecikmişler de gelir
 * ve işaretlenir. `bekleyenler` Worker kuyruğunda duran, Argos'a henüz
 * geçmemiş eklemeler — plana katılıp ⏳ ile gösterilir.
 */
export function gunMesaji(
  tarih: string,
  bugun: string,
  anlik: Anlik | null,
  gorevler: TodoistGorev[] | { hata: string },
  bekleyenler: KuyrukKaydi[],
): string {
  const gun = anlik?.gunler[tarih];
  const satirlar: string[] = [`<b>${tarih === bugun ? "☀️ " : ""}${tarihBasligi(tarih)}</b>`];

  const bekleyenSlot = bekleyenler.filter(
    (k): k is Extract<KuyrukKaydi, { tur: "slot" }> => k.tur === "slot" && k.tarih === tarih,
  );
  // Telegram'dan işaretlenmiş ama Argos'a henüz geçmemiş slotlar.
  const bekleyenDurum = new Map(
    bekleyenler
      .filter((k): k is Extract<KuyrukKaydi, { tur: "durum" }> => k.tur === "durum" && k.tarih === tarih)
      .map((k) => [k.slotId, k.durum]),
  );
  const planSatirlari = [
    ...(gun?.slotlar ?? []).map((s) => {
      const bekleyen = bekleyenDurum.get(s.id);
      return {
        saat: s.saat,
        metin: `${bekleyen ? `${DURUM_ISARETI[bekleyen] ?? "☑"}⏳` : (DURUM_ISARETI[s.durum] ?? "☐")} ${s.saat}  ${kacis(
          s.konu || s.alan,
        )}${s.konu && s.alan ? ` <i>${kacis(s.alan)}</i>` : ""} · ${sureMetni(s.sureDk)}`,
      };
    }),
    ...bekleyenSlot.map((k) => ({
      saat: k.saat,
      metin: `⏳ ${k.saat}  ${kacis(k.konu)} · ${sureMetni(k.sureDk)}`,
    })),
  ].sort((a, b) => kSirala(a.saat, b.saat));

  satirlar.push("", "<b>📅 Plan</b>");
  if (!gun && planSatirlari.length === 0) satirlar.push("Bu günün planı yüklenmemiş.");
  else if (planSatirlari.length === 0) satirlar.push("Planlı slot yok.");
  else satirlar.push(...planSatirlari.map((p) => p.metin));
  if (bekleyenSlot.length > 0) satirlar.push("<i>⏳ Argos açılınca plana işlenecek</i>");

  if (gun && gun.aliskanliklar.length > 0) {
    satirlar.push(
      "",
      "<b>🔁 Alışkanlıklar</b>",
      gun.aliskanliklar.map((a) => `${a.yapildi ? "☑" : "☐"} ${kacis(a.ad)}`).join("  "),
    );
  }

  satirlar.push("", "<b>📋 Todoist</b>");
  if ("hata" in gorevler) {
    satirlar.push(`Görevler alınamadı: ${kacis(gorevler.hata)}`);
  } else if (gorevler.length === 0) {
    satirlar.push("Görev yok.");
  } else {
    const sirali = [...gorevler].sort(
      (a, b) => kSirala(a.tarih ?? "", b.tarih ?? "") || b.oncelik - a.oncelik,
    );
    for (const g of sirali) {
      const gTarih = g.tarih?.slice(0, 10) ?? "";
      const gecikmis = gTarih !== "" && gTarih < tarih;
      const saat = g.tarih && g.tarih.length > 10 ? `${g.tarih.slice(11, 16)} ` : "";
      const onem = g.oncelik >= 4 ? "‼️ " : g.oncelik === 3 ? "❗ " : "";
      satirlar.push(`• ${onem}${saat}${kacis(g.icerik)}${gecikmis ? " <i>(gecikmiş)</i>" : ""}`);
    }
  }

  const bekleyenNot = bekleyenler.filter((k) => k.tur === "not");
  if ((gun && gun.hatirla.length > 0) || bekleyenNot.length > 0) {
    satirlar.push("", "<b>💭 Hatırla</b>");
    for (const h of gun?.hatirla ?? []) satirlar.push(`• ${kacis(h)}`);
    for (const k of bekleyenNot) if (k.tur === "not") satirlar.push(`⏳ ${kacis(k.metin)}`);
  }

  satirlar.push(
    "",
    anlik ? `<i>Plan son güncelleme: ${guncellemeMetni(anlik.guncellendi, bugun)}</i>` : "<i>Argos henüz plan göndermedi.</i>",
  );
  return satirlar.join("\n");
}

/** Kuyruğa alınan eklemenin onay mesajı. */
export function kuyrukOnayi(k: KuyrukKaydi, bugun: string): string {
  if (k.tur === "durum") return `⏳ ${kacis(k.ad)} işaretlendi — Argos açılınca plana işlenecek.`;
  if (k.tur === "not") return `⏳ Not kaydedildi, Argos açılınca Hatırla'ya işlenecek:\n${kacis(k.metin)}`;
  const gun = k.tarih === bugun ? "bugün" : k.tarih === gunEkle(bugun, 1) ? "yarın" : tarihBasligi(k.tarih);
  return `⏳ Kaydedildi: ${gun} ${k.saat} ${kacis(k.konu)} · ${sureMetni(k.sureDk)}${
    k.alan ? ` #${kacis(k.alan)}` : ""
  }\nArgos açılınca plana işlenecek.`;
}
