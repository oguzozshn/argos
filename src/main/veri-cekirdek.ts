import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { Okuma, Yazma } from "../ortak/tipler";

/**
 * Veri katmanının çekirdeği. Electron'a bağlı DEĞİLDİR — kök dizini dışarıdan
 * alır. Böylece hem ana süreçten çağrılır, hem düz Node ile test edilir, hem de
 * ileride dışarıdan (koordinatör) kullanılabilir.
 *
 * Klasör `personnal_assistant/data` ile ortaktır: eski Python uygulaması ve
 * sabah mutabakatı aynı dosyalara yazar. Buradaki her yazma bu yüzden atomiktir
 * ve yazmadan önce dosyanın değişip değişmediğine bakar.
 */

/**
 * Göreli yolu kök dizin içine kilitler. `..` ile dışarı çıkma, mutlak yol ve
 * boş parça reddedilir — arayüzden gelen her yol güvenilmez kabul edilir.
 */
export function tamYol(kokDizin: string, gorece: string): string {
  if (!gorece || typeof gorece !== "string") throw new Error("yol boş");
  if (isAbsolute(gorece)) throw new Error("mutlak yol kabul edilmez");
  const hedef = resolve(kokDizin, gorece);
  if (hedef !== kokDizin && !hedef.startsWith(kokDizin + sep)) {
    throw new Error("yol veri klasörünün dışında");
  }
  return hedef;
}

export async function oku<T = unknown>(kokDizin: string, gorece: string): Promise<Okuma<T>> {
  const f = tamYol(kokDizin, gorece);
  try {
    const [metin, s] = await Promise.all([readFile(f, "utf8"), stat(f)]);
    return { veri: JSON.parse(metin) as T, mtime: s.mtimeMs, yol: gorece };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      // Dosya yokluğu hata değil: henüz oluşmamış olabilir.
      return { veri: null, mtime: null, yol: gorece };
    }
    throw e;
  }
}

/**
 * Atomik yazma: önce .tmp, sonra rename. Yazmadan önce mevcut hâl .json.bak
 * olur — app.py'nin geleneği bu, damgalı kopya biriktirilmez.
 *
 * `beklenenMtime` okuma anındaki damgadır. Disktekiyle uyuşmuyorsa dosya
 * dışarıdan değişmiş demektir ve yazma YAPILMAZ.
 */
export async function yaz(
  kokDizin: string,
  gorece: string,
  icerik: unknown,
  beklenenMtime: number | null,
): Promise<Yazma> {
  const f = tamYol(kokDizin, gorece);
  try {
    let mevcut: string | null = null;
    let diskMtime: number | null = null;
    try {
      diskMtime = (await stat(f)).mtimeMs;
      mevcut = await readFile(f, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }

    if (diskMtime !== beklenenMtime) {
      return { ok: false, sebep: "cakisma", guncel: await oku(kokDizin, gorece) };
    }

    await mkdir(dirname(f), { recursive: true });
    if (mevcut !== null) await writeFile(f + ".bak", mevcut, "utf8");

    const gecici = `${f}.${process.pid}.tmp`;
    await writeFile(gecici, JSON.stringify(icerik, null, 2) + "\n", "utf8");
    await rename(gecici, f);

    return { ok: true, mtime: (await stat(f)).mtimeMs };
  } catch (e) {
    return { ok: false, sebep: "hata", mesaj: e instanceof Error ? e.message : String(e) };
  }
}

/** Bir klasördeki .json dosyalarını listeler. Klasör yoksa boş dizi. */
export async function listele(kokDizin: string, goreceKlasor: string): Promise<string[]> {
  const d = tamYol(kokDizin, goreceKlasor);
  try {
    const girisler = await readdir(d, { withFileTypes: true });
    return girisler
      .filter((g) => g.isFile() && g.name.endsWith(".json"))
      .map((g) => g.name)
      .sort((a, b) => a.localeCompare(b, "tr"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

/** Dosyayı siler. Yedeği kalır — geri dönüş yolu kapanmasın. */
export async function sil(kokDizin: string, gorece: string): Promise<{ ok: boolean }> {
  const f = tamYol(kokDizin, gorece);
  try {
    await writeFile(f + ".bak", await readFile(f, "utf8"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  await rm(f, { force: true });
  return { ok: true };
}

/** Ayar dosyaları, okunma sırasıyla — yereli depoya girmez, o yüzden önce gelir. */
export const AYAR_ADLARI = ["argos.config.local.json", "argos.config.json"];

/**
 * Bir ayar alanını (`dataDir`, `gizliYolu`) kökler sırasıyla arar ve mutlak
 * yola çevirir. Electron'suz da çalışır.
 *
 * Göreli yol, ayarı taşıyan dosyanın kendi köküne göre çözülür: yol o dosyanın
 * yanından yazılmıştır. Hiçbir kökte bulunamazsa varsayılan ilk köke göre
 * çözülür.
 */
export function ayarCoz(
  kokler: string[],
  alan: string,
  varsayilan: string,
  ayarOkuyucu: (yol: string) => string | null,
  ortamYolu?: string,
): string {
  const ilkKok = kokler[0] ?? ".";
  const mutlakla = (yol: string, kok: string): string =>
    isAbsolute(yol) ? resolve(yol) : resolve(kok, yol);

  const cevre = ortamYolu?.trim();
  if (cevre) return mutlakla(cevre, ilkKok);

  for (const kok of kokler) {
    for (const ad of AYAR_ADLARI) {
      const metin = ayarOkuyucu(join(kok, ad));
      if (!metin) continue;
      let deger: unknown;
      try {
        deger = (JSON.parse(metin) as Record<string, unknown>)[alan];
      } catch {
        console.error(`[ayar] ${join(kok, ad)} okunamadı, yok sayıldı`);
        continue;
      }
      if (typeof deger === "string" && deger.trim()) return mutlakla(deger.trim(), kok);
    }
  }

  return mutlakla(varsayilan, ilkKok);
}
