/**
 * Komut paletinin arama ve sıralaması. Saf: arayüzü, komutun ne yaptığını
 * bilmez; yalnızca adlara ve öneklere bakar. `araclar/komut-testi.mts` sınıyor.
 *
 * İki tür eşleşme var:
 *  - Önek: yazılan ilk sözcük bir komutun öneki ise ("görev süt al") komut
 *    kesin seçilir, kalan metin argümandır. Klavyeden en hızlı yol bu.
 *  - Arama: ad ve anahtar sözcüklerde; sözcük başı > içinde geçme > harf
 *    sırası. Türkçe harfler sadeleştirilir: "gorev" "Görev"i bulur.
 */

export interface Aranabilir {
  ad: string;
  anahtarlar?: string[];
  /** Argüman alan komutların tetik sözcükleri. */
  onekler?: string[];
}

export interface Eslesme<T> {
  komut: T;
  /** Önekle seçildiyse önekten sonraki metin; değilse null. */
  arguman: string | null;
  puan: number;
}

const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Küçük harf, Türkçe harfler sade, boşluklar tek. */
export const sadelestir = (s: string): string =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]|i̇/g, (h) => TR[h] ?? h)
    .replace(/\s+/g, " ")
    .trim();

/** Harfler sırasıyla geçiyor mu ("hft" → "hafta"). */
function sirayla(igne: string, saman: string): boolean {
  let i = 0;
  for (const h of saman) if (h === igne[i]) i++;
  return i === igne.length;
}

function metinPuani(sorgu: string, metin: string): number {
  const m = sadelestir(metin);
  if (!m) return 0;
  if (m === sorgu) return 100;
  if (m.startsWith(sorgu)) return 90;
  if (m.split(/[\s›:/-]+/).some((s) => s.startsWith(sorgu))) return 75;
  if (m.includes(sorgu)) return 55;
  if (sorgu.length >= 2 && sirayla(sorgu.replace(/ /g, ""), m.replace(/ /g, ""))) return 25;
  return 0;
}

/**
 * Sorguya göre sıralı eşleşmeler. Boş sorguda tüm komutlar verilen sırada.
 * Önekle seçilen komut her zaman en üstte ve tek başına değil: kullanıcı
 * "not" yazıp "Notlar" ekranına gitmek istiyor olabilir.
 */
export function komutAra<T extends Aranabilir>(sorgu: string, komutlar: T[]): Eslesme<T>[] {
  const ham = sorgu.replace(/^\s+/, "");
  const q = sadelestir(ham);
  if (!q) return komutlar.map((komut, i) => ({ komut, arguman: null, puan: -i }));

  const ilk = sadelestir(ham.split(/\s+/)[0] ?? "");
  const bosluklu = /\s/.test(ham);
  const sonuc: Eslesme<T>[] = [];

  komutlar.forEach((komut, sira) => {
    // Önek: "görev" tek başına da, "görev süt al" da seçer. Tek başınayken
    // argüman boş; palet onu "yazmaya devam" diye gösterir.
    if (komut.onekler?.some((o) => sadelestir(o) === ilk)) {
      const arguman = bosluklu ? ham.slice(ham.search(/\s/)).trim() : "";
      sonuc.push({ komut, arguman, puan: 1000 - sira });
      return;
    }
    const puan = Math.max(
      metinPuani(q, komut.ad),
      ...(komut.anahtarlar ?? []).map((a) => metinPuani(q, a) - 5),
      ...(komut.onekler ?? []).map((o) => metinPuani(q, o) - 5),
    );
    // Eşit puanda verilen sıra korunur (sira küçükse önde).
    if (puan > 0) sonuc.push({ komut, arguman: null, puan: puan - sira / 1000 });
  });

  return sonuc.sort((a, b) => b.puan - a.puan);
}
