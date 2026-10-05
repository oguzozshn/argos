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
  onemliler,
  onemliYap,
  projeCevir,
  projeler,
  tarihVer,
  updateTask,
  deleteTask,
  allTasks,
  moveTask,
  setProjectFavorite,
  recurringTasks,
  updateProject,
} from "../src/main/todoist-cekirdek.ts";
import { todoistColorName } from "../src/ortak/task.ts";
import { onemliMi } from "../src/ortak/tipler.ts";
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
  kontrol("no description or labels unless given", sonIstek?.govde?.description === undefined && sonIstek?.govde?.labels === undefined);
  await ekle("T", { icerik: "x", projeId: "P1", description: " not ", labels: ["önemli"] });
  kontrol("description (trimmed) and labels are sent", sonIstek?.govde?.description === "not" && JSON.stringify(sonIstek?.govde?.labels) === '["önemli"]');

  await tarihVer("T", "42", "her pazartesi");
  kontrol(
    "tarihVer POST /tasks/{id}",
    sonIstek?.url.endsWith("/tasks/42") && sonIstek.yontem === "POST",
  );
  kontrol(
    "tarihVer ham tarih değil due_string yollar",
    sonIstek?.govde?.due_string === "every mon" && sonIstek.govde.due_date === undefined,
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

  // Önemli işareti: önce güncel etiketler okunur, sonra yalnız `labels` gider.
  const istekler: Yakalanan[] = [];
  const etiketliFetch = (etiketler: string[]) => {
    istekler.length = 0;
    globalThis.fetch = (async (url: string | URL, ayar?: RequestInit) => {
      istekler.push({
        url: String(url),
        yontem: ayar?.method ?? "GET",
        govde: ayar?.body ? (JSON.parse(String(ayar.body)) as Record<string, unknown>) : null,
      });
      const donen = ayar?.body ? (JSON.parse(String(ayar.body)) as { labels: string[] }).labels : etiketler;
      return new Response(JSON.stringify({ id: "42", content: "IELTS", project_id: "P", labels: donen }), { status: 200 });
    }) as typeof fetch;
  };
  const gonderilen = () => istekler.at(-1)?.govde as { labels?: string[] } | null;

  etiketliFetch(["okul"]);
  const isaretli = await onemliYap("T", "42", true);
  kontrol("önemli yap önce görevi okur", istekler[0]?.yontem === "GET" && istekler[0].url.endsWith("/tasks/42"));
  kontrol(
    "önemli yap diğer etiketleri korur",
    JSON.stringify(gonderilen()?.labels) === JSON.stringify(["okul", "önemli"]),
    JSON.stringify(gonderilen()),
  );
  kontrol(
    "önemli yapta yalnız labels gider (tarih ezilmez)",
    Object.keys(gonderilen() ?? {}).join() === "labels",
    Object.keys(gonderilen() ?? {}).join(),
  );
  kontrol("dönen görev önemli sayılır", onemliMi(isaretli));

  etiketliFetch(["önemli", "okul"]);
  await onemliYap("T", "42", true);
  kontrol("zaten önemliyse etiket ikilenmez", JSON.stringify(gonderilen()?.labels) === JSON.stringify(["okul", "önemli"]));

  etiketliFetch(["Önemli", "okul"]);
  const kaldirilan = await onemliYap("T", "42", false);
  kontrol(
    "kaldırma büyük harfli 'Önemli'yi de siler, diğerini bırakır",
    JSON.stringify(gonderilen()?.labels) === JSON.stringify(["okul"]),
    JSON.stringify(gonderilen()),
  );
  kontrol("kaldırılan görev önemli sayılmaz", !onemliMi(kaldirilan));

  etiketliFetch([]);
  await onemliler("T");
  kontrol(
    "önemliler etiket süzgeciyle sorar",
    decodeURIComponent(istekler[0]?.url ?? "").includes("/tasks/filter?query=@önemli"),
    istekler[0]?.url,
  );
  sahteFetchAc();

  // Editing: only the fields asked for are sent, and never a date.
  sahteFetchAc({ id: "42", content: "Yeni ad", project_id: "P", priority: 4 });
  const edited = await updateTask("T", "42", { title: "  Yeni ad ", priority: 1 });
  kontrol("updateTask POST /tasks/{id}", sonIstek?.url.endsWith("/tasks/42") && sonIstek.yontem === "POST");
  kontrol(
    "updateTask sends trimmed content and inverted priority only",
    JSON.stringify(sonIstek?.govde) === JSON.stringify({ content: "Yeni ad", priority: 4 }),
    JSON.stringify(sonIstek?.govde),
  );
  kontrol("updateTask returns the task", edited.icerik === "Yeni ad" && edited.oncelik === 4);
  await updateTask("T", "42", { description: "" });
  kontrol("empty description is sent (clears it)", JSON.stringify(sonIstek?.govde) === JSON.stringify({ description: "" }));

  sahteFetchAc("");
  await deleteTask("T", "42");
  kontrol("deleteTask DELETE /tasks/{id}", sonIstek?.url.endsWith("/tasks/42") && sonIstek.yontem === "DELETE");
  await moveTask("T", "42", "P9");
  kontrol(
    "moveTask POST /tasks/{id}/move with project_id",
    sonIstek?.url.endsWith("/tasks/42/move") && sonIstek.govde?.project_id === "P9",
  );

  sahteFetchAc({ results: [{ id: "1", content: "a", project_id: "P" }, { id: "2", content: "slot", project_id: PLAN_PROJESI }] });
  const all = await allTasks("T");
  kontrol("allTasks GETs /tasks without a project filter", sonIstek?.url.includes("/tasks?limit=200") && !sonIstek.url.includes("project_id"));
  kontrol("allTasks leaves out the plan project", all.length === 1 && all[0]!.id === "1");

  sahteFetchAc({ results: [
    { id: "r1", content: "Aidat", project_id: "P", due: { date: "2026-11-01", string: "every 1st", is_recurring: true } },
    { id: "r2", content: "slot", project_id: PLAN_PROJESI, due: { date: "2026-11-01", string: "every day", is_recurring: true } },
  ] });
  const rec = await recurringTasks("T");
  kontrol("recurringTasks uses the 'recurring' filter", sonIstek?.url.includes("/tasks/filter?query=recurring") === true);
  kontrol("recurringTasks keeps the due string and leaves out the plan project", rec.length === 1 && rec[0]!.dueString === "every 1st" && rec[0]!.tekrarli);

  sahteFetchAc({ id: "P9", name: "Ağva", color: "lime_green", is_favorite: true, child_order: 3 });
  const fav = await setProjectFavorite("T", "P9", true);
  kontrol(
    "setProjectFavorite POST /projects/{id} with is_favorite",
    sonIstek?.url.endsWith("/projects/P9") && sonIstek.govde?.is_favorite === true,
  );
  kontrol("project colour, favorite and order are mapped", fav.color === "#7ecc49" && fav.favorite && fav.order === 3);
  sahteFetchAc({ id: "P9", name: "Ağva", color: "berry_red", child_order: 3 });
  const recoloured = await updateProject("T", "P9", { color: "berry_red" });
  kontrol(
    "updateProject sends only the colour name",
    sonIstek?.url.endsWith("/projects/P9") &&
      sonIstek.yontem === "POST" &&
      JSON.stringify(sonIstek.govde) === JSON.stringify({ color: "berry_red" }),
  );
  kontrol("updateProject returns the project with its hex colour", recoloured.color === "#b8256f");
  await updateProject("T", "P9", { name: "  Ağva tatili  " });
  kontrol("updateProject trims and sends only the name", JSON.stringify(sonIstek?.govde) === JSON.stringify({ name: "Ağva tatili" }));
  sonIstek = null as Yakalanan | null; // keeps the union: the calls below set it again
  const refused = await updateProject("T", "P9", { color: "#ff0000" }).then(() => false, () => true);
  kontrol("an unknown colour name is refused before any request", refused && sonIstek === null);
  const emptyName = await updateProject("T", "P9", { name: "   " }).then(() => false, () => true);
  kontrol("an empty name is refused before any request", emptyName && sonIstek === null);
  kontrol("hex back to Todoist colour name", todoistColorName("#B8256F") === "berry_red" && todoistColorName("#123456") === null);
  const plain = projeCevir({ id: "1", name: "X" });
  kontrol("project without colour/favorite gets defaults", plain.color === "#808080" && !plain.favorite && plain.order === 0);
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
  kontrol("raw due string is kept for rescheduling", g.dueString === "her pazartesi");
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

  // Etiket henüz hiç kullanılmamışsa boş liste döner; hata vermemesi yeter.
  const onemli = await onemliler(token);
  kontrol("@önemli süzgeci Türkçe karakterle çalışır", Array.isArray(onemli), `${onemli.length} görev`);
  kontrol("gelenlerin hepsi önemli etiketli", onemli.every(onemliMi));
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
