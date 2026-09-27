import { existsSync, readFileSync } from "node:fs";
import type { TodoistDurum, TodoistGorev, TodoistProje, TodoistTaskPatch } from "../ortak/tipler";
import { ayar, ayarKaydet } from "./ayar";
import { jsonCoz } from "./veri-cekirdek";
import * as cekirdek from "./todoist-cekirdek";
import { TodoistHata, type YeniGorev } from "./todoist-cekirdek";

/**
 * Çekirdeğin (todoist-cekirdek.ts) Electron'a bağlanan ince kabuğu: anahtarı
 * bulur ve her çağrıya geçirir.
 *
 * API anahtarı BU DOSYADAN çıkmaz — arayüz yalnızca sonuçları görür.
 */

/** Anahtar dosyasının yolu; ayarlanabilir, varsayılan eski deponun yanı. */
export const gizliYolu = (): string =>
  ayar("gizliYolu", "../personnal_assistant/gizli.json", process.env.ARGOS_GIZLI);

/**
 * Kullanıcının seçtiği anahtar dosyasını kalıcı ayara yazar.
 *
 * Sıfırlanacak bir şey yok: `gizliYolu` her çağrıda diskten okunuyor.
 */
export async function gizliAyarla(yol: string): Promise<void> {
  await ayarKaydet("gizliYolu", yol.split("\\").join("/"));
}

/** Anahtarı her çağrıda diskten okur: dosya değişince yeniden başlatmak gerekmesin. */
function anahtar(): string | null {
  try {
    const f = gizliYolu();
    if (!existsSync(f)) return null;
    const g = jsonCoz<{ todoistToken?: string }>(readFileSync(f, "utf8"));
    return g.todoistToken?.trim() || null;
  } catch {
    return null;
  }
}

function jeton(): string {
  const t = anahtar();
  if (!t) throw new TodoistHata("Todoist anahtarı yok");
  return t;
}

export function durum(): TodoistDurum {
  return { anahtarVar: anahtar() !== null, gizliYolu: gizliYolu() };
}

export const projeler = (): Promise<TodoistProje[]> => cekirdek.projeler(jeton());

export const gorevler = (projeId: string): Promise<TodoistGorev[]> =>
  cekirdek.gorevler(jeton(), projeId);

export const bugunVeGecikmis = (): Promise<TodoistGorev[]> => cekirdek.bugunVeGecikmis(jeton());

export const tarihAraligi = (bas: string, son: string): Promise<TodoistGorev[]> =>
  cekirdek.tarihAraligi(jeton(), bas, son);

export const onemliler = (): Promise<TodoistGorev[]> => cekirdek.onemliler(jeton());

export const onemliYap = (id: string, onemli: boolean): Promise<TodoistGorev> =>
  cekirdek.onemliYap(jeton(), id, onemli);

export const allTasks = (): Promise<TodoistGorev[]> => cekirdek.allTasks(jeton());

export const updateTask = (id: string, patch: TodoistTaskPatch): Promise<TodoistGorev> =>
  cekirdek.updateTask(jeton(), id, patch);

export const deleteTask = (id: string): Promise<void> => cekirdek.deleteTask(jeton(), id);

export const moveTask = (id: string, projectId: string): Promise<void> =>
  cekirdek.moveTask(jeton(), id, projectId);

export const setProjectFavorite = (id: string, favorite: boolean): Promise<TodoistProje> =>
  cekirdek.setProjectFavorite(jeton(), id, favorite);

export const ekle = (g: YeniGorev): Promise<TodoistGorev> => cekirdek.ekle(jeton(), g);

export const kapat = (id: string): Promise<void> => cekirdek.kapat(jeton(), id);

export const ac = (id: string): Promise<void> => cekirdek.ac(jeton(), id);

export const hizliEkle = (metin: string): Promise<TodoistGorev> => cekirdek.hizliEkle(jeton(), metin);

export const tarihVer = (id: string, tarihMetni: string | null): Promise<TodoistGorev> =>
  cekirdek.tarihVer(jeton(), id, tarihMetni);
