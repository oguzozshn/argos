// Uzantı açıkça yazılı: bu dosya düz Node ile de koşuyor (araclar/todoist-testi.mts)
// ve Node'un ESM çözümleyicisi uzantısız yolu bulmuyor.
import {
  ONEMLI_ETIKETI,
  PLAN_PROJESI,
  onemliMi,
  type TodoistGorev,
  type TodoistProje,
  type TodoistProjectPatch,
  type TodoistTaskPatch,
} from "../ortak/tipler.ts";
import { TODOIST_COLORS, todoistColor } from "../ortak/task.ts";
import { hizliMetniCevir, tarihMetniTurkce, todoistTarihMetni } from "../ortak/todoist-tarih.ts";

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
  color?: string;
  is_favorite?: boolean;
  child_order?: number;
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
  color: todoistColor(p.color),
  favorite: p.is_favorite === true,
  order: p.child_order ?? 0,
});

export const gorevCevir = (t: HamGorev): TodoistGorev => ({
  id: t.id,
  icerik: t.content,
  aciklama: t.description ?? "",
  projeId: t.project_id,
  tarih: t.due?.date ?? null,
  // Todoist'e İngilizce gidiyor (Türkçe tarih dilini tanımıyor); ekranda Türkçe okunsun.
  tarihMetni: tarihMetniTurkce(t.due?.string ?? null),
  dueString: t.due?.string ?? null,
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
 * Every open task in every project, in one paginated call. The task screen
 * counts per project and switches lists without waiting for a request.
 * The plan project is left out: its tasks belong to the Asistan module.
 */
export async function allTasks(token: string): Promise<TodoistGorev[]> {
  const ham = await tumSayfalar<HamGorev>(
    token,
    (i) => `/tasks?limit=200${i ? `&cursor=${encodeURIComponent(i)}` : ""}`,
  );
  return ham.map(gorevCevir).filter((g) => g.projeId !== PLAN_PROJESI);
}

/**
 * Every open recurring task. The date-range filter only returns a task whose
 * next date is in the range; the calendar needs the rest to draw later repeats.
 */
export async function recurringTasks(token: string): Promise<TodoistGorev[]> {
  const ham = await tumSayfalar<HamGorev>(
    token,
    (i) =>
      `/tasks/filter?query=${encodeURIComponent("recurring")}&limit=200${
        i ? `&cursor=${encodeURIComponent(i)}` : ""
      }`,
  );
  return ham.map(gorevCevir).filter((g) => g.projeId !== PLAN_PROJESI && g.tekrarli);
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

/**
 * Önemli etiketli açık görevler — Bugün ekranının geri sayım kartı için.
 * Tarihsizler de gelir: kart onları "tarih yok" diye sona koyar.
 */
export async function onemliler(token: string): Promise<TodoistGorev[]> {
  const ham = await tumSayfalar<HamGorev>(
    token,
    (i) =>
      `/tasks/filter?query=${encodeURIComponent(`@${ONEMLI_ETIKETI}`)}&limit=200${
        i ? `&cursor=${encodeURIComponent(i)}` : ""
      }`,
  );
  // Süzgeç zaten etikete göre; ikinci kontrol büyük/küçük harf farkı ve
  // olası geniş eşleşmeye karşı.
  return ham.map(gorevCevir).filter((g) => g.projeId !== PLAN_PROJESI && onemliMi(g));
}

/**
 * Önemli etiketini ekler ya da kaldırır. Görevin güncel etiketleri önce
 * sunucudan okunur: arayüzdeki liste eskimiş olabilir, başka bir etiketi
 * ezmesin. Yalnız `labels` gider — tarih alanına dokunmak tekrar düzenini
 * siler (CLAUDE.md).
 */
export async function onemliYap(token: string, id: string, onemli: boolean): Promise<TodoistGorev> {
  const yol = `/tasks/${encodeURIComponent(id)}`;
  const mevcut = (await istek<HamGorev>(token, yol)).labels ?? [];
  const digerleri = mevcut.filter((e) => e.toLocaleLowerCase("tr") !== ONEMLI_ETIKETI);
  const labels = onemli ? [...digerleri, ONEMLI_ETIKETI] : digerleri;
  return gorevCevir(await istek<HamGorev>(token, yol, "POST", { labels }));
}

/* --- editing ---------------------------------------------------------------- */

/**
 * Edits a task's text or priority. The date is deliberately not part of the
 * patch: it goes through `tarihVer` and `due_string`, which keeps a recurring
 * task's rule intact.
 */
export async function updateTask(token: string, id: string, patch: TodoistTaskPatch): Promise<TodoistGorev> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.content = patch.title.trim();
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.priority !== undefined) body.priority = 5 - patch.priority;
  return gorevCevir(await istek<HamGorev>(token, `/tasks/${encodeURIComponent(id)}`, "POST", body));
}

export const deleteTask = (token: string, id: string): Promise<void> =>
  istek(token, `/tasks/${encodeURIComponent(id)}`, "DELETE");

export const moveTask = (token: string, id: string, projectId: string): Promise<void> =>
  istek(token, `/tasks/${encodeURIComponent(id)}/move`, "POST", { project_id: projectId });

export async function setProjectFavorite(token: string, id: string, favorite: boolean): Promise<TodoistProje> {
  return projeCevir(
    await istek<HamProje>(token, `/projects/${encodeURIComponent(id)}`, "POST", { is_favorite: favorite }),
  );
}

/** Sends only the fields given. An unknown colour name is refused here, before Todoist silently ignores it. */
export async function updateProject(token: string, id: string, patch: TodoistProjectPatch): Promise<TodoistProje> {
  const body: Record<string, string> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Proje adı boş olamaz.");
    body.name = name;
  }
  if (patch.color !== undefined) {
    if (!(patch.color in TODOIST_COLORS)) throw new Error(`Bilinmeyen Todoist rengi: ${patch.color}`);
    body.color = patch.color;
  }
  return projeCevir(await istek<HamProje>(token, `/projects/${encodeURIComponent(id)}`, "POST", body));
}

export interface YeniGorev {
  icerik: string;
  projeId: string;
  tarihMetni?: string;
  oncelik?: number;
  description?: string;
  labels?: string[];
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
  if (g.description?.trim()) yuk.description = g.description.trim();
  if (g.labels?.length) yuk.labels = g.labels;
  return gorevCevir(await istek<HamGorev>(token, "/tasks", "POST", yuk));
}

/**
 * Doğal dil hızlı ekleme (Todoist Quick Add): proje (#), etiket (@), öncelik
 * (p1–p4) ve tarih metinden sunucuda çözülür. Türkçe tarih önce İngilizceye çevrilir.
 */
export async function hizliEkle(token: string, metin: string): Promise<TodoistGorev> {
  try {
    // Quick Add Türkçe tarih tanımıyor: tarih parçası İngilizceye çevrilip gider.
    const text = hizliMetniCevir(metin).metin;
    return gorevCevir(await istek<HamGorev>(token, "/tasks/quick", "POST", { text }));
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
