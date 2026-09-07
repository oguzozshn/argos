import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { TodoistDurum, TodoistGorev, TodoistProje } from "../ortak/tipler";
import * as cekirdek from "./todoist-cekirdek";
import { TodoistHata, type YeniGorev } from "./todoist-cekirdek";

/**
 * Çekirdeğin (todoist-cekirdek.ts) Electron'a bağlanan ince kabuğu: anahtarı
 * bulur ve her çağrıya geçirir.
 *
 * API anahtarı BU DOSYADAN çıkmaz — arayüz yalnızca sonuçları görür.
 */

function kok(): string {
  return app.isPackaged ? dirname(app.getPath("exe")) : process.cwd();
}

/** Anahtar dosyasının yolu; ayarlanabilir, varsayılan eski deponun yanı. */
export function gizliYolu(): string {
  let ayarlanan = process.env.ARGOS_GIZLI?.trim() || "";
  if (!ayarlanan) {
    for (const ad of ["argos.config.local.json", "argos.config.json"]) {
      const f = join(kok(), ad);
      if (!existsSync(f)) continue;
      try {
        const a = JSON.parse(readFileSync(f, "utf8")) as { gizliYolu?: string };
        if (a.gizliYolu) {
          ayarlanan = a.gizliYolu;
          break;
        }
      } catch {
        // Bozuk ayar yok sayılır; varsayılana düşer.
      }
    }
  }
  if (!ayarlanan) ayarlanan = "../personnal_assistant/gizli.json";
  return isAbsolute(ayarlanan) ? resolve(ayarlanan) : resolve(kok(), ayarlanan);
}

/** Anahtarı her çağrıda diskten okur: dosya değişince yeniden başlatmak gerekmesin. */
function anahtar(): string | null {
  try {
    const f = gizliYolu();
    if (!existsSync(f)) return null;
    const g = JSON.parse(readFileSync(f, "utf8")) as { todoistToken?: string };
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

export const ekle = (g: YeniGorev): Promise<TodoistGorev> => cekirdek.ekle(jeton(), g);

export const kapat = (id: string): Promise<void> => cekirdek.kapat(jeton(), id);

export const ac = (id: string): Promise<void> => cekirdek.ac(jeton(), id);

export const tarihVer = (id: string, tarihMetni: string | null): Promise<TodoistGorev> =>
  cekirdek.tarihVer(jeton(), id, tarihMetni);
