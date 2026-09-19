import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Günlük yedeğin çekirdeği. Electron'a bağlı değil; `araclar/yedek-testi.mts`
 * düz Node ile sınıyor.
 *
 * Her gün ilk fırsatta veri klasöründeki JSON dosyaları `<yedekKok>/<gün>/`
 * altına olduğu gibi kopyalanır; son `tut` gün kalır. Tek `.bak` her yazmada
 * eziliyordu: yanlış bir düzenleme ancak bir sonraki yazmaya kadar geri
 * alınabiliyordu.
 *
 * Yedek klasörü bu makinede (kullanıcı verisi), OneDrive'da değil: bozuk bir
 * yazma eşitlenip her yere yayılsa da yerel kopya sağlam kalır.
 */

export const VARSAYILAN_TUT = 30;

const GUN_KLASORU = /^\d{4}-\d{2}-\d{2}$/;
/** Yarım kalmış kopya: tamamlanmadan "o günün yedeği var" sanılmasın. */
const GECICI = /^\d{4}-\d{2}-\d{2}\.yarim-\d+$/;

async function varMi(yol: string): Promise<boolean> {
  try {
    await stat(yol);
    return true;
  } catch {
    return false;
  }
}

/** Kopyalanacak dosyalar: JSON'lar, alt klasörlerle. Yedek ve geçici dosyalar değil. */
async function jsonlar(kok: string, klasor = kok): Promise<string[]> {
  const sonuc: string[] = [];
  for (const g of await readdir(klasor, { withFileTypes: true })) {
    const yol = join(klasor, g.name);
    if (g.isDirectory()) {
      if (g.name.startsWith(".")) continue;
      sonuc.push(...(await jsonlar(kok, yol)));
    } else if (g.isFile() && g.name.endsWith(".json")) {
      sonuc.push(relative(kok, yol));
    }
  }
  return sonuc;
}

export interface YedekSonucu {
  /** false: bugünün yedeği zaten vardı. */
  alindi: boolean;
  dosya: number;
  klasor: string;
}

/**
 * Bugünün yedeği yoksa alır. Önce geçici klasöre kopyalanır, bitince
 * günün adına çevrilir: yarıda kesilen kopya tam yedek gibi görünmez ve
 * bir sonraki denemede baştan alınır.
 */
export async function yedekAl(veriKok: string, yedekKok: string, bugun: string): Promise<YedekSonucu> {
  const hedef = join(yedekKok, bugun);
  if (await varMi(hedef)) return { alindi: false, dosya: 0, klasor: hedef };
  if (!(await varMi(veriKok))) throw new Error(`veri klasörü yok: ${veriKok}`);

  const gecici = join(yedekKok, `${bugun}.yarim-${process.pid}`);
  await rm(gecici, { recursive: true, force: true });
  const dosyalar = await jsonlar(veriKok);
  try {
    for (const d of dosyalar) {
      const varis = join(gecici, d);
      await mkdir(join(varis, ".."), { recursive: true });
      await copyFile(join(veriKok, d), varis);
    }
    await mkdir(gecici, { recursive: true });
    await rename(gecici, hedef);
  } catch (e) {
    await rm(gecici, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
  return { alindi: true, dosya: dosyalar.length, klasor: hedef };
}

/**
 * En yeni `tut` günü bırakır, eskileri ve yarım kalmış kopyaları siler.
 * Yalnızca gün adlı klasörlere dokunur: kullanıcının oraya koyduğu başka
 * bir şey silinmez.
 */
export async function eskileriSil(yedekKok: string, tut = VARSAYILAN_TUT, suAnkiPid = process.pid): Promise<string[]> {
  if (!(await varMi(yedekKok))) return [];
  const adlar = (await readdir(yedekKok, { withFileTypes: true })).filter((g) => g.isDirectory()).map((g) => g.name);
  const gunler = adlar.filter((a) => GUN_KLASORU.test(a)).sort();
  const silinecek = [
    ...gunler.slice(0, Math.max(0, gunler.length - tut)),
    // Başka bir örneğin sürmekte olan kopyası silinmesin; yalnızca ölü olanlar.
    ...adlar.filter((a) => GECICI.test(a) && !a.endsWith(`-${suAnkiPid}`)),
  ];
  for (const a of silinecek) await rm(join(yedekKok, a), { recursive: true, force: true });
  return silinecek;
}

/** Var olan yedek günleri, yeniden eskiye. */
export async function yedekGunleri(yedekKok: string): Promise<string[]> {
  if (!(await varMi(yedekKok))) return [];
  return (await readdir(yedekKok, { withFileTypes: true }))
    .filter((g) => g.isDirectory() && GUN_KLASORU.test(g.name))
    .map((g) => g.name)
    .sort()
    .reverse();
}
