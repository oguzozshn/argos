// Uzantı açıkça yazılı: bu dosya düz Node ile de koşuyor (araclar/todoist-testi.mts)
// ve Node'un ESM çözümleyicisi uzantısız yolu bulmuyor.
import { PLAN_PROJESI, type TodoistGorev, type TodoistProje } from "../ortak/tipler.ts";
import { tarihMetniTurkce, todoistTarihMetni } from "../ortak/todoist-tarih.ts";

/**
 * Todoist istemcisinin çekirdeği. Electron'a bağlı DEĞİLDİR ve anahtarı
 * kendisi okumaz — her çağrıya dışarıdan verilir (app.py'deki
 * `todoist_istek(token, ...)` ile aynı biçim). Böylece düz Node ile test
 * edilebiliyor ve ileride koordinatör de aynı katmanı çağırabiliyor.
 *
 * API v1 kullanılır; REST v2 kapatıldı (410 Gone).
 */

const API = "https://api.todoist.com/api/v1";

export class TodoistHata extends Error {
  // Alan açıkça yazılıyor: Node'un tip soyma kipi "parameter property"
  // sözdizimini desteklemiyor, testler düz Node ile koşuyor.
  kod: number | null;

  constructor(mesaj: string, kod: number | null = null) {
    super(mesaj);
    this.name = "TodoistHata";
    this.kod = kod;
  }
}

export async function istek<T>(
  token: string,
  yol: string,
  yontem = "GET",
  govde?: unknown,
): Promise<T> {
  const cevap = await fetch(API + yol, {
    method: yontem,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(govde !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: govde !== undefined ? JSON.stringify(govde) : undefined,
    signal: AbortSignal.timeout(20000),
  });

  if (!cevap.ok) {
    const metin = await cevap.text().catch(() => "");
    if (cevap.status === 401) throw new TodoistHata("Todoist anahtarı kabul edilmedi", 401);
    if (cevap.status === 429) throw new TodoistHata("Todoist hız sınırı — biraz bekle", 429);
    throw new TodoistHata(`Todoist ${cevap.status}: ${metin.slice(0, 200)}`, cevap.status);
  }

  const ham = await cevap.text();
  return (ham.trim() ? JSON.parse(ham) : null) as T;
}

/** v1 sayfalı döner; tüm sayfalar toplanır (app.py'deki `todoist_gorevler` gibi). */
async function tumSayfalar<T>(
  token: string,
  yolKur: (imlec: string | null) => string,
): Promise<T[]> {
  const hepsi: T[] = [];
  let imlec: string | null = null;
  for (;;) {
    const c: { results?: T[]; next_cursor?: string | null } = await istek(token, yolKur(imlec));
    hepsi.push(...(c?.results ?? []));
    imlec = c?.next_cursor ?? null;
    if (!imlec) return hepsi;
  }
}

/* --- dönüştürme -------------------------------------------------------- */

export interface HamProje {
  id: string;
  name: string;
  inbox_project?: boolean;
  is_archived?: boolean;
}

export interface HamGorev {
  id: string;
  content: string;
  description?: string;
  project_id: string;
  parent_id?: string | null;
  priority?: number;
  labels?: string[];
  due?: { date?: string; string?: string; is_recurring?: boolean } | null;
}

export const projeCevir = (p: HamProje): TodoistProje => ({
  id: p.id,
  ad: p.name,
  inbox: p.inbox_project === true,
});

export const gorevCevir = (t: HamGorev): TodoistGorev => ({
  id: t.id,
  icerik: t.content,
  aciklama: t.description ?? "",
  projeId: t.project_id,
  tarih: t.due?.date ?? null,
  // Todoist'e İngilizce gidiyor (Türkçe tarih dilini tanımıyor); ekranda Türkçe okunsun.
  tarihMetni: tarihMetniTurkce(t.due?.string ?? null),
  tekrarli: t.due?.is_recurring === true,
  oncelik: t.priority ?? 1,
  etiketler: t.labels ?? [],
  altGorev: Boolean(t.parent_id),
});

/* --- uçlar ------------------------------------------------------------- */

export async function projeler(token: string): Promise<TodoistProje[]> {
  const ham = await tumSayfalar<HamProje>(
    token,
    (i) => `/projects?limit=100${i ? `&cursor=${encodeURIComponent(i)}` : ""}`,
  );
  return ham.filter((p) => !p.is_archived).map(projeCevir);
}

export async function gorevler(token: string, projeId: string): Promise<TodoistGorev[]> {
  const ham = await tumSayfalar<HamGorev>(
    token,
    (i) =>
      `/tasks?project_id=${encodeURIComponent(projeId)}&limit=200${
        i ? `&cursor=${encodeURIComponent(i)}` : ""
      }`,
  );
  return ham.map(gorevCevir);
}

/**
 * Bugün ekranının kartı: bugün ve gecikmiş görevler, tüm projelerden, tek
 * süzgeçle. Plan projesi elenir — slot görevleri Asistan modülünün işi.
 */
export async function bugunVeGecikmis(token: string): Promise<TodoistGorev[]> {
  const ham = await tumSayfalar<HamGorev>(
    token,
    (i) =>
      `/tasks/filter?query=${encodeURIComponent("today | overdue")}&limit=100${
        i ? `&cursor=${encodeURIComponent(i)}` : ""
      }`,
  );
  return ham.map(gorevCevir).filter((g) => g.projeId !== PLAN_PROJESI);
}

/**
 * Bir tarih aralığındaki görevler — takvim için. Todoist'in kendi süzgeci
 * kullanılır, tek istekte tüm projeleri tarar. Plan projesi elenir: slot
 * görevleri takvimde zaten plan tarafında görünüyor, iki kez çıkmasın.
 */
export async function tarihAraligi(
  token: string,
  basIso: string,
  sonIso: string,
): Promise<TodoistGorev[]> {
  const sorgu = `due after: ${basIso} & due before: ${sonIso}`;
  const ham = await tumSayfalar<HamGorev>(
    token,
    (i) =>
      `/tasks/filter?query=${encodeURIComponent(sorgu)}&limit=200${
        i ? `&cursor=${encodeURIComponent(i)}` : ""
      }`,
  );
  return ham.map(gorevCevir).filter((g) => g.projeId !== PLAN_PROJESI);
}

export interface YeniGorev {
  icerik: string;
  projeId: string;
  tarihMetni?: string;
  oncelik?: number;
}

export async function ekle(token: string, g: YeniGorev): Promise<TodoistGorev> {
  const yuk: Record<string, unknown> = { content: g.icerik, project_id: g.projeId };
  if (g.tarihMetni?.trim()) {
    // Todoist Türkçe tarih tanımıyor: "her salı 18:00" burada İngilizceye çevrilir.
    const { metin, dil } = todoistTarihMetni(g.tarihMetni);
    yuk.due_string = metin;
    yuk.due_lang = dil;
  }
  if (g.oncelik) yuk.priority = g.oncelik;
  return gorevCevir(await istek<HamGorev>(token, "/tasks", "POST", yuk));
}

/**
 * Doğal dil hızlı ekleme (Todoist Quick Add): proje (#), etiket (@), öncelik
 * (p1–p4) ve tarih metinden sunucuda çözülür. Dil hesabın dil ayarından gelir.
 */
export async function hizliEkle(token: string, metin: string): Promise<TodoistGorev> {
  try {
    return gorevCevir(await istek<HamGorev>(token, "/tasks/quick", "POST", { text: metin }));
  } catch (e) {
    // Zaman aşımında sunucu görevi yine de eklemiş olabilir; "yeniden dene"
    // körü körüne ikinci bir kopya yaratır.
    if ((e as { name?: string } | null)?.name === "TimeoutError") {
      throw new TodoistHata("Todoist yanıt vermedi — görev eklenmiş olabilir, Todoist'te kontrol et");
    }
    throw e;
  }
}

export const kapat = (token: string, id: string): Promise<void> =>
  istek(token, `/tasks/${encodeURIComponent(id)}/close`, "POST");

export const ac = (token: string, id: string): Promise<void> =>
  istek(token, `/tasks/${encodeURIComponent(id)}/reopen`, "POST");

/**
 * Tarihi doğal dille değiştirir. `due_string` kullanılır çünkü tekrarlı
 * görevlerde ham tarih yazmak tekrar düzenini siler — CLAUDE.md'nin kuralı bu.
 * null verilirse tarih kaldırılır.
 */
export async function tarihVer(
  token: string,
  id: string,
  tarihMetni: string | null,
): Promise<TodoistGorev> {
  const cevrilmis = tarihMetni ? todoistTarihMetni(tarihMetni) : null;
  const yuk = cevrilmis ? { due_string: cevrilmis.metin, due_lang: cevrilmis.dil } : { due_string: "no date" };
  return gorevCevir(await istek<HamGorev>(token, `/tasks/${encodeURIComponent(id)}`, "POST", yuk));
}
