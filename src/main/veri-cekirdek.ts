import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
 * Metni BOM'a takılmadan çözer.
 *
 * Windows'ta Not Defteri ve PowerShell'in `-Encoding utf8`'i dosyanın başına
 * BOM koyuyor; `JSON.parse` onu kabul etmiyor. Yakalayan taraf hatayı
 * "dosya okunamadı" diye yorumladığı için dosya tam yerinde dururken yokmuş
 * gibi görünüyordu.
 */
export const jsonCoz = <T = unknown>(metin: string): T =>
  JSON.parse(metin.charCodeAt(0) === 0xfeff ? metin.slice(1) : metin) as T;

/**
 * Göreli yolu kök dizin içine kilitler. `..` ile dışarı çıkma, mutlak yol ve
 * boş parça reddedilir — arayüzden gelen her yol güvenilmez kabul edilir.
 */
export function tamYol(kokDizin: string, gorece: string): string {
  if (!gorece || typeof gorece !== "string") throw new Error("yol boş");
  if (isAbsolute(gorece)) throw new Error("mutlak yol kabul edilmez");
  const hedef = resolve(kokDizin, gorece);
  // `kok + sep` sürücü kökünde ("D:\") çift ayraç olurdu; göreli yol her
  // durumda doğru cevabı veriyor.
  const ic = relative(resolve(kokDizin), hedef);
  if (ic === ".." || ic.startsWith(".." + sep) || isAbsolute(ic)) {
    throw new Error("yol veri klasörünün dışında");
  }
  return hedef;
}

/**
 * İçerik ve damga aynı ana ait olmalı. Okuma ile `stat` arasında dosya
 * dışarıdan değişirse eski içerik yeni damgayla eşleşir, sonraki yazma
 * çakışmayı göremeden dış değişikliği ezerdi. Damga okumanın iki yanında
 * aynı değilse yeniden okunur.
 */
export async function oku<T = unknown>(kokDizin: string, gorece: string): Promise<Okuma<T>> {
  const f = tamYol(kokDizin, gorece);
  try {
    for (let deneme = 0; ; deneme++) {
      const once = (await stat(f)).mtimeMs;
      const metin = await readFile(f, "utf8");
      const sonra = (await stat(f)).mtimeMs;
      if (once === sonra || deneme >= 2) {
        return { veri: jsonCoz<T>(metin), mtime: sonra, yol: gorece };
      }
    }
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
  // Aynı dosyaya iki yazma aynı anda gelirse ikisi de aynı damgayı görüp
  // kontrolü geçerdi; sonra biri diğerini sessizce ezerdi. Dosya başına sıra.
  const onceki = yazmaSirasi.get(f) ?? Promise.resolve();
  const bu = onceki.then(() => yazSirali(kokDizin, f, gorece, icerik, beklenenMtime));
  const kuyruk = bu.then(
    () => undefined,
    () => undefined,
  );
  yazmaSirasi.set(f, kuyruk);
  void kuyruk.then(() => {
    if (yazmaSirasi.get(f) === kuyruk) yazmaSirasi.delete(f);
  });
  return bu;
}

const yazmaSirasi = new Map<string, Promise<void>>();
let geciciSayac = 0;

/** Windows'ta dosya açık tutan biri (OneDrive, virüs tarayıcı, app.py) rename'i kısa süre kilitler. */
const GECICI_KILIT = new Set(["EPERM", "EBUSY", "EACCES"]);

export async function yenidenAdlandir(kaynak: string, hedef: string): Promise<void> {
  for (let deneme = 0; ; deneme++) {
    try {
      await rename(kaynak, hedef);
      return;
    } catch (e) {
      const kod = (e as NodeJS.ErrnoException).code ?? "";
      if (!GECICI_KILIT.has(kod) || deneme >= 5) throw e;
      await new Promise((r) => setTimeout(r, 40 * (deneme + 1)));
    }
  }
}

async function yazSirali(
  kokDizin: string,
  f: string,
  gorece: string,
  icerik: unknown,
  beklenenMtime: number | null,
): Promise<Yazma> {
  if (icerik === undefined) {
    return { ok: false, sebep: "hata", mesaj: "yazılacak içerik yok" };
  }
  // Kök yoksa ayar henüz okunamamış demektir (kilit, eşitleme). Burada
  // açılırsa yanlış yerde boş bir klasör doğar ve kendini toparlama —
  // "klasör yoksa yeniden ara" — bir daha hiç devreye girmez.
  if (!(await klasorVar(kokDizin))) {
    return { ok: false, sebep: "hata", mesaj: `veri klasörü bulunamadı: ${kokDizin}` };
  }
  let gecici: string | null = null;
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

    gecici = `${f}.${process.pid}-${++geciciSayac}.tmp`;
    await writeFile(gecici, JSON.stringify(icerik, null, 2) + "\n", "utf8");
    await yenidenAdlandir(gecici, f);
    gecici = null;

    return { ok: true, mtime: (await stat(f)).mtimeMs };
  } catch (e) {
    // Yarım kalan geçici dosya klasörde birikmesin; izleyici onu görmez.
    if (gecici) await rm(gecici, { force: true }).catch(() => undefined);
    return { ok: false, sebep: "hata", mesaj: e instanceof Error ? e.message : String(e) };
  }
}

async function klasorVar(yol: string): Promise<boolean> {
  try {
    return (await stat(yol)).isDirectory();
  } catch {
    return false;
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

/**
 * Dosyayı siler. Yedeği kalır — geri dönüş yolu kapanmasın.
 *
 * Yazmalarla aynı sıraya girer: sürmekte olan bir yazmanın rename'i silmeden
 * sonra düşerse dosya geri doğardı.
 */
export async function sil(kokDizin: string, gorece: string): Promise<{ ok: boolean }> {
  const f = tamYol(kokDizin, gorece);
  const bu = (yazmaSirasi.get(f) ?? Promise.resolve()).then(() => silSirali(f));
  const kuyruk = bu.then(
    () => undefined,
    () => undefined,
  );
  yazmaSirasi.set(f, kuyruk);
  void kuyruk.then(() => {
    if (yazmaSirasi.get(f) === kuyruk) yazmaSirasi.delete(f);
  });
  return bu;
}

async function silSirali(f: string): Promise<{ ok: boolean }> {
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
        deger = jsonCoz<Record<string, unknown>>(metin)[alan];
      } catch {
        console.error(`[ayar] ${join(kok, ad)} okunamadı, yok sayıldı`);
        continue;
      }
      if (typeof deger === "string" && deger.trim()) return mutlakla(deger.trim(), kok);
    }
  }

  return mutlakla(varsayilan, ilkKok);
}
