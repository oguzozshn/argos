import { app } from "electron";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AYAR_ADLARI, ayarCoz, jsonCoz, yenidenAdlandir } from "./veri-cekirdek";

/**
 * Ayarın nerede aranacağı. Tek yerde durur, çünkü aynı dosyalar iki şeyi
 * taşıyor: veri klasörü (veri.ts) ve Todoist anahtar dosyası (todoist.ts).
 *
 * Pakette iki kök var. Exe'nin yanı elle koymak için en görünür yer; ama
 * kurulum klasörü her sürümde silinip yeniden yazılıyor, oraya konan ayar
 * güncellemede kayboluyor. Kalıcı yer kullanıcı verisi klasörü — ikinci
 * sırada o okunur, exe'nin yanındaki varsa o kazanır.
 */
export function kokler(): string[] {
  return app.isPackaged ? [dirname(app.getPath("exe")), app.getPath("userData")] : [process.cwd()];
}

/**
 * Ayar dosyasını okur. Okunamıyorsa null — ama bu "yok" demek değil,
 * "şimdi bakılamadı" da olabilir (tarama, eşitleme, kilit). Ayrımı çağıran
 * yapıyor: `dataDir` başarısız çözümü saklamıyor.
 */
const okuyucu = (yol: string): string | null => {
  try {
    return existsSync(yol) ? readFileSync(yol, "utf8") : null;
  } catch {
    return null;
  }
};

/**
 * Ayarın sırayla bakıldığı yollar ve ÇAĞRI ANINDA var olup olmadıkları.
 *
 * Ayrı bir liste tutuluyor çünkü "dosya şimdi duruyor" ile "çözüm yapılırken
 * duruyordu" aynı şey değil — veri klasörü bir kez çözülüp saklanıyor.
 */
export const arananYollar = (): { yol: string; bulundu: boolean }[] =>
  kokler().flatMap((kok) =>
    AYAR_ADLARI.map((ad) => {
      const yol = join(kok, ad);
      return { yol, bulundu: existsSync(yol) };
    }),
  );

/** Bir ayar alanının mutlak karşılığı. Her çağrıda diskten okur. */
export const ayar = (alan: string, varsayilan: string, ortamYolu?: string): string =>
  ayarCoz(kokler(), alan, varsayilan, okuyucu, ortamYolu);

/**
 * Ayarın konması önerilen yer: kalıcı kök, yereli. Veri klasörü bulunamadığında
 * arayüz bu yolu gösteriyor — "düzelt" demek yetmiyor, nereye yazılacağı da
 * söylenmeli.
 */
export const onerilenAyarYolu = (): string => join(kokler().at(-1) ?? ".", AYAR_ADLARI[0]);

/**
 * Başlangıç tanısı: hangi köklere bakıldı, ne bulundu, ne çözüldü.
 *
 * Konsola yazmak yetmiyor — uygulama çoğu zaman kısayoldan ya da kurulumun
 * sonundan açılıyor ve o çıktıyı kimse görmüyor. Dosya her açılışta
 * üzerine yazılır, birikmez.
 */
export function taniYaz(
  cozulen: string,
  cozulenVar: boolean,
  arananlar: { yol: string; bulundu: boolean }[] = arananYollar(),
): void {
  const satirlar = [
    `zaman      : ${new Date().toISOString()}`,
    `paketli    : ${app.isPackaged}`,
    `exe        : ${app.getPath("exe")}`,
    `userData   : ${app.getPath("userData")}`,
    `cwd        : ${process.cwd()}`,
    `ARGOS_DATA : ${process.env.ARGOS_DATA ?? "(yok)"}`,
    `ARGOS_GIZLI: ${process.env.ARGOS_GIZLI ?? "(yok)"}`,
    "kökler     :",
    ...kokler().map((k) => `  ${k}`),
    "kök içerikleri:",
    ...kokler().flatMap((k) => {
      try {
        // Listeyi sınırla: tanı dosyası okunabilir kalsın.
        const icerik = readdirSync(k);
        const gosterilen = icerik.slice(0, 40).map((x) => `      ${x}`);
        if (icerik.length > 40) gosterilen.push(`      … ${icerik.length - 40} tane daha`);
        return [`  ${k} ->`, ...gosterilen];
      } catch (e) {
        return [`  ${k} -> OKUNAMADI: ${(e as { code?: string }).code ?? String(e)}`];
      }
    }),
    "aranan     :",
    ...arananlar.map((y) => `  ${y.bulundu ? "VAR" : "yok"} ${y.yol}`),
    `çözülen    : ${cozulen}`,
    `klasör var : ${cozulenVar}`,
    "",
  ];
  try {
    const govde = satirlar.join("\r" + "\n");
    writeFileSync(join(app.getPath("userData"), "argos-son-baslangic.log"), govde, "utf8");
  } catch {
    // Tanı yazılamıyorsa uygulama yine de açılır.
  }
}
/**
 * Bir ayar alanını kalıcı köke (kullanıcı verisi klasörü) yazar; varsa
 * dosyadaki diğer alanlar korunur.
 *
 * Kurulum klasörüne değil buraya yazılıyor: orası her sürümde siliniyor.
 */
export async function ayarKaydet(alan: string, deger: string): Promise<string> {
  const kok = kokler().at(-1) ?? ".";
  const yol = join(kok, AYAR_ADLARI[0]);
  // `okuyucu` burada kullanılmıyor: o her hatayı "yok" sayıyor. Kilitli bir
  // dosya boş sanılırsa diğer alanlar (ör. `gizliYolu`) silinirdi. Yalnızca
  // gerçekten olmayan dosya boş başlar; okunamayan dosyada kayıt durur.
  let metin: string | null = null;
  try {
    metin = readFileSync(yol, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  let mevcut: Record<string, unknown> = {};
  if (metin) {
    try {
      mevcut = jsonCoz<Record<string, unknown>>(metin);
    } catch {
      // Bozuk dosyanın üstüne yazılır; kurtarılacak bir şey yok.
    }
  }
  mevcut[alan] = deger;
  const govde = JSON.stringify(mevcut, null, 2) + "\r\n";
  // Yarım yazılmış ayar dosyası bir sonraki açılışta iki alanı birden kaybettirir.
  const gecici = `${yol}.${process.pid}.tmp`;
  writeFileSync(gecici, govde, "utf8");
  // OneDrive ya da virüs tarayıcı dosyayı bir an kilitleyebilir.
  await yenidenAdlandir(gecici, yol).catch((e: unknown) => {
    rmSync(gecici, { force: true });
    throw e;
  });
  return yol;
}
