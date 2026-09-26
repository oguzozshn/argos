/**
 * Todoist istemcisi testi. Electron gerektirmez: `node araclar/todoist-testi.mts`
 *
 * İki bölüm var:
 *  - CANLI: yalnızca OKUMA. Hesapta hiçbir şey değişmez.
 *  - SAHTE: `fetch` geçici olarak değiştirilip yazma isteklerinin GÖVDESİ
 *    doğrulanır — istek gerçekten gönderilmez. Tekrarlı görevleri bozan şey
 *    yanlış gövdedir, o yüzden asıl kontrol burada.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  TodoistHata,
  ac,
  bugunVeGecikmis,
  ekle,
  gorevCevir,
  gorevler,
  hizliEkle,
  kapat,
  projeler,
  tarihVer,
} from "../src/main/todoist-cekirdek.ts";
import { todoistTarihi } from "../src/ortak/gorev-zaman.ts";
import { gizliYolu } from "./yol.mts";

const PLAN_PROJESI = "6CrfrPC6f3G6wCMG";

let gecen = 0;
let kalan = 0;

// `kosul` unknown: `sonIstek?.url.endsWith(...)` gibi ifadeler undefined
// dönebiliyor, testte her seferinde Boolean() sarmalamak gürültü olurdu.
function kontrol(ad: string, kosul: unknown, ek = ""): void {
  if (kosul) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}${ek ? " — " + ek : ""}`);
  }
}

function anahtarOku(): string | null {
  const yol = gizliYolu();
  if (!existsSync(yol)) return null;
  try {
    return (JSON.parse(readFileSync(yol, "utf8")) as { todoistToken?: string }).todoistToken ?? null;
  } catch {
    return null;
  }
}

/* --- sahte fetch: gövde doğrulama -------------------------------------- */

interface Yakalanan {
  url: string;
  yontem: string;
  govde: Record<string, unknown> | null;
}

const gercekFetch = globalThis.fetch;
let sonIstek: Yakalanan | null = null;

function sahteFetchAc(cevap: unknown = { id: "1", content: "x", project_id: "p" }): void {
  globalThis.fetch = (async (url: string | URL, ayar?: RequestInit) => {
    sonIstek = {
      url: String(url),
      yontem: ayar?.method ?? "GET",
      govde: ayar?.body ? (JSON.parse(String(ayar.body)) as Record<string, unknown>) : null,
    };
    return new Response(JSON.stringify(cevap), { status: 200 });
  }) as typeof fetch;
}

function sahteHataAc(kod: number): void {
  globalThis.fetch = (async () => new Response("hata", { status: kod })) as typeof fetch;
}

const sahteKapat = () => {
  globalThis.fetch = gercekFetch;
};

/* --- testler ------------------------------------------------------------ */

async function sahteBolum(): Promise<void> {
  console.log("Yazma gövdeleri (istek gönderilmez)");

  sahteFetchAc();
  await ekle("T", { icerik: "deneme", projeId: "P1", tarihMetni: "yarın 18:00" });
  kontrol("ekle POST /tasks", sonIstek?.url.endsWith("/tasks") && sonIstek.yontem === "POST");
  kontrol("içerik ve proje gönderilir", sonIstek?.govde?.content === "deneme" && sonIstek.govde.project_id === "P1");
  // Todoist Türkçe tarih tanımıyor: metin İngilizceye çevrilip öyle gider.
  kontrol("Türkçe tarih İngilizceye çevrilip gider", sonIstek?.govde?.due_string === "tomorrow at 18:00");
  kontrol("dil en olarak bildirilir", sonIstek?.govde?.due_lang === "en");

  await ekle("T", { icerik: "tarihsiz", projeId: "P1" });
  kontrol("tarih verilmezse due alanı hiç gitmez", sonIstek?.govde?.due_string === undefined);

  await tarihVer("T", "42", "gelecek pazartesi");
  kontrol(
    "tarihVer POST /tasks/{id}",
    sonIstek?.url.endsWith("/tasks/42") && sonIstek.yontem === "POST",
  );
  kontrol(
    "tarihVer ham tarih değil due_string yollar",
    sonIstek?.govde?.due_string === "next monday" && sonIstek.govde.due_date === undefined,
    "ham tarih tekrarlı görevin düzenini siler",
  );

  await tarihVer("T", "42", null);
  kontrol("tarih kaldırma 'no date' gönderir", sonIstek?.govde?.due_string === "no date");

  // Takvimde göreve saat verme bu biçimi üretiyor (@ortak/gorev-zaman
  // todoistTarihi). Todoist ISO "T" ayırıcısını due_string olarak çözmüyor.
  await tarihVer("T", "42", todoistTarihi("2026-09-26", "14:30"));
  kontrol(
    "saatli taşıma 'GG SS:DD' biçiminde gider",
    sonIstek?.govde?.due_string === "2026-09-26 14:30",
    String(sonIstek?.govde?.due_string),
  );
  await tarihVer("T", "42", todoistTarihi("2026-09-26", null));
  kontrol("gün boyuna çevirmede saat gitmez", sonIstek?.govde?.due_string === "2026-09-26");

  await kapat("T", "42");
  kontrol("kapat /close ucuna gider", sonIstek?.url.endsWith("/tasks/42/close"));

  await ac("T", "42");
  kontrol("geri alma /reopen ucuna gider", sonIstek?.url.endsWith("/tasks/42/reopen"));

  sahteFetchAc({ id: "9", content: "fatura öde", project_id: "P2", priority: 4, due: { date: "2026-09-19T18:00:00", string: "yarın 18:00" } });
  const hizli = await hizliEkle("T", "yarın 18:00 fatura öde #Ev p1");
  kontrol("hızlı ekleme POST /tasks/quick", sonIstek?.url.endsWith("/tasks/quick") && sonIstek.yontem === "POST");
  kontrol(
    "hızlı eklemede satır tek text olarak gider, yalnız Türkçe tarih çevrilir",
    sonIstek?.govde?.text === "tomorrow at 18:00 fatura öde #Ev p1" && sonIstek.govde.content === undefined,
  );
  kontrol(
    "hızlı ekleme cevabı göreve çevrilir",
    hizli.icerik === "fatura öde" && hizli.projeId === "P2" && hizli.tarih === "2026-09-19T18:00:00",
  );
  globalThis.fetch = (async () => {
    throw new DOMException("zaman aşımı", "TimeoutError");
  }) as typeof fetch;
  const zaman = await hizliEkle("T", "x").then(
    () => "",
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
  kontrol("hızlı eklemede zaman aşımı 'eklenmiş olabilir' der", zaman.includes("eklenmiş olabilir"), zaman);
  sahteFetchAc();

  await kapat("T", "a/b?c=1");
  kontrol("kimlik URL için kaçışlanır", sonIstek?.url.includes("a%2Fb%3Fc%3D1") === true);

  sahteHataAc(401);
  let kod: number | null = null;
  await ac("T", "42").catch((e) => {
    kod = e instanceof TodoistHata ? e.kod : -1;
  });
  kontrol("401 anlaşılır hataya çevrilir", kod === 401);

  sahteHataAc(429);
  let kod2: number | null = null;
  await ac("T", "42").catch((e) => {
    kod2 = e instanceof TodoistHata ? e.kod : -1;
  });
  kontrol("429 anlaşılır hataya çevrilir", kod2 === 429);

  sahteKapat();

  console.log("\nDönüştürme");
  const g = gorevCevir({
    id: "1",
    content: "Haftalık alışveriş",
    project_id: "P",
    priority: 4,
    due: { date: "2026-09-08", string: "her pazartesi", is_recurring: true },
  });
  kontrol("tekrarlı görev işaretlenir", g.tekrarli === true);
  kontrol("tarih metni korunur", g.tarihMetni === "her pazartesi");
  kontrol("öncelik geçer", g.oncelik === 4);

  const b = gorevCevir({ id: "2", content: "boş", project_id: "P" });
  kontrol("tarihsiz görevde tarih null", b.tarih === null && b.tarihMetni === null);
  kontrol("eksik alanlar varsayılana düşer", b.aciklama === "" && b.etiketler.length === 0);
}

async function canliBolum(token: string): Promise<void> {
  console.log("\nCanlı okuma (hesapta değişiklik yok)");

  const p = await projeler(token);
  kontrol("projeler gelir", p.length > 0, `${p.length}`);
  const inbox = p.find((x) => x.inbox);
  kontrol("Inbox bulunur", Boolean(inbox), inbox?.ad ?? "yok");
  kontrol("arşivlenmiş proje gelmez", p.every((x) => x.ad.length > 0));

  if (inbox) {
    const g = await gorevler(token, inbox.id);
    kontrol("Inbox görevleri okunur", Array.isArray(g), `${g.length} görev`);
    kontrol(
      "her görev gerekli alanları taşır",
      g.every((x) => typeof x.id === "string" && typeof x.icerik === "string"),
    );
  }

  const bugun = await bugunVeGecikmis(token);
  kontrol("bugün + gecikmiş süzgeci çalışır", Array.isArray(bugun), `${bugun.length} görev`);
  kontrol(
    "plan projesinin slotları özete karışmaz",
    bugun.every((x) => x.projeId !== PLAN_PROJESI),
  );
}

async function calis(): Promise<void> {
  await sahteBolum();

  const token = anahtarOku();
  if (!token) console.log("\nCanlı bölüm atlandı — gizli.json bulunamadı.");
  else await canliBolum(token);

  console.log(`\n${gecen} geçti, ${kalan} kaldı`);
  if (kalan > 0) process.exitCode = 1;
}

void calis();
