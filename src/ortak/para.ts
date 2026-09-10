/**
 * Para: tam sayı kuruş ile kullanıcının yazdığı/okuduğu metin arasındaki
 * dönüşüm. Kaynağı ExpenseTracker'ın `Services/Money.cs` dosyası.
 *
 * Tutar hiçbir yerde kayan noktaya çevrilmez. 0.1 + 0.2 tartışmasının defterde
 * yeri yok: toplamlar kuruşu kuruşuna doğru olmak zorunda.
 *
 * Biçimlendirme her zaman tr-TR — makinenin yerel ayarı değişince aynı tutar
 * başka türlü okunmasın.
 */

export const KURUS = 100;

/** Yalnızca binlik ayracı; ondalık elle eklenir ki kuruş yuvarlamaya uğramasın. */
const TAM_BICIM = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0, useGrouping: true });

/**
 * İnsanların gerçekten yazdığı biçimleri okur: "1234", "1234,56", "1234.56",
 * "1.234,56" ve "1,234.56". İki ayraç birden varsa sağdaki ondalıktır.
 *
 * Tek nokta belirsiz olan durumdur. Birden fazla geçiyorsa ("1.234.567") ya da
 * ardından tam üç rakam geliyorsa ("1.500") binlik ayracı, aksi hâlde ondalık
 * ayracı sayılır ("12.5", "12.50"). Kuruş iki hane olduğu için üç haneli grup
 * binliktir — ondalık okunsa 1.500 ₺ sessizce 1,50 ₺ olurdu.
 *
 * Sayı okunamazsa `null` döner; çağıran 0 ile ayırt edebilsin.
 */
export function paraCoz(metin: string | null | undefined): number | null {
  if (metin == null || metin.trim() === "") return null;

  const s = [...metin].filter((c) => (c >= "0" && c <= "9") || c === "." || c === "," || c === "-" || c === "+").join("");
  if (s.length === 0) return null;

  const sonNokta = s.lastIndexOf(".");
  const sonVirgul = s.lastIndexOf(",");

  let ondalikYeri: number;
  if (sonNokta >= 0 && sonVirgul >= 0) ondalikYeri = Math.max(sonNokta, sonVirgul);
  else if (sonVirgul >= 0) ondalikYeri = sonVirgul;
  else if (sonNokta > 0 && s.indexOf(".") === sonNokta && !binlikGrubu(s, sonNokta)) ondalikYeri = sonNokta;
  else ondalikYeri = -1;

  const hamTam = ondalikYeri >= 0 ? s.slice(0, ondalikYeri) : s;
  const hamKesir = ondalikYeri >= 0 ? s.slice(ondalikYeri + 1) : "";

  const eksi = hamTam.startsWith("-");
  const tam = hamTam.replace(/\D/g, "");
  const kesir = hamKesir.replace(/\D/g, "");

  if (tam.length === 0 && kesir.length === 0) return null;
  // 15 haneden uzun bir tam kısım güvenli tam sayı aralığını aşar.
  if (tam.length > 15) return null;

  // Üç ya da daha fazla ondalık yapıştırıldığında kesilmez, yuvarlanır.
  let kesirKurus = 0;
  if (kesir.length > 0) {
    const binde = Number(kesir.padEnd(3, "0").slice(0, 3));
    if (!Number.isFinite(binde)) return null;
    kesirKurus = Math.floor((binde + 5) / 10);
  }

  const tamDeger = tam.length > 0 ? Number(tam) : 0;
  if (!Number.isFinite(tamDeger)) return null;

  const kurus = tamDeger * KURUS + kesirKurus;
  return eksi ? -kurus : kurus;
}

/** Ayracın ardından tam üç rakam mı var? */
function binlikGrubu(s: string, yer: number): boolean {
  const kuyruk = s.slice(yer + 1);
  return kuyruk.length === 3 && /^\d{3}$/.test(kuyruk);
}

/** "1.234,56 ₺". Simge boş verilirse yalnızca sayı döner. */
export function paraMetni(kurus: number, simge = "₺"): string {
  const tamsayi = Math.trunc(kurus);
  const mutlak = Math.abs(tamsayi);
  const govde = `${TAM_BICIM.format(Math.floor(mutlak / KURUS))},${String(mutlak % KURUS).padStart(2, "0")}`;
  return `${tamsayi < 0 ? "-" : ""}${govde}${simge ? ` ${simge}` : ""}`;
}

/** Aynısı ama önünde açık bir + veya − ile. Eksi işareti tire değil, U+2212. */
export function paraIsaretli(kurus: number, simge = "₺"): string {
  return `${kurus < 0 ? "−" : "+"}${paraMetni(Math.abs(Math.trunc(kurus)), simge)}`;
}

/** Düzenlenebilir bir kutunun içinde aldığı biçim: binlik ayracı yok. */
export function paraGiris(kurus: number): string {
  const tamsayi = Math.trunc(kurus);
  const mutlak = Math.abs(tamsayi);
  return `${tamsayi < 0 ? "-" : ""}${Math.floor(mutlak / KURUS)},${String(mutlak % KURUS).padStart(2, "0")}`;
}
