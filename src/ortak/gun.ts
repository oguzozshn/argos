/**
 * Tarih ve sayı yardımcıları. Hepsi saf; ne Electron ne DOM gerekiyor.
 *
 * Buradaki kurallar `app.py` ile BİREBİR aynı olmak zorunda — iki uygulama
 * aynı veriden farklı sayı üretirse hangisinin doğru olduğu tartışılır.
 */

export const GUN_ADLARI = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

// İlk üç harfle kısaltılamaz: "Pazartesi" ve "Pazar" ikisi de "Paz" olurdu.
export const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export const AY_ADLARI = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

export const AY_TAM = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export const TUM_GUNLER = [1, 2, 3, 4, 5, 6, 7];

/**
 * Python'un `round()`'u yarımları çifte yuvarlar (banker's rounding):
 * round(2.5) = 2, round(3.5) = 4. JavaScript'in `Math.round`'u yukarı yuvarlar.
 * Tahmin haftaları ve oranlar bu yüzden birebir aynı olsun diye burada
 * Python'un kuralı uygulanır.
 */
export function yuvarla(x: number): number {
  const asagi = Math.floor(x);
  const fark = x - asagi;
  if (Math.abs(fark - 0.5) > Number.EPSILON * Math.max(1, Math.abs(x))) {
    return Math.round(x);
  }
  // Tam yarım: çift olana git.
  return asagi % 2 === 0 ? asagi : asagi + 1;
}

/**
 * Kod noktasına göre sıralama — Python'un `sorted()` davranışı.
 * `localeCompare` Türkçe'de farklı sonuç verir ("İngilizce" başa geçerdi),
 * o yüzden karşılaştırmalarda kullanılmaz.
 */
export const kSirala = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/* --- ISO tarih aritmetiği (UTC üzerinden, saat dilimi kaydırmasın) ------ */

export function isoyaTarih(iso: string): Date {
  const [y, a, g] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, a! - 1, g!));
}

export const tariheIso = (d: Date): string => d.toISOString().slice(0, 10);

export const gunEkle = (iso: string, n: number): string =>
  tariheIso(new Date(isoyaTarih(iso).getTime() + n * 86400000));

export const gunFarki = (a: string, b: string): number =>
  Math.round((isoyaTarih(a).getTime() - isoyaTarih(b).getTime()) / 86400000);

/** Python'un `date.weekday()`: Pazartesi 0 … Pazar 6. */
export const haftaninGunu = (iso: string): number => (isoyaTarih(iso).getUTCDay() + 6) % 7;

export const yilAl = (iso: string): number => Number(iso.slice(0, 4));
export const ayAl = (iso: string): number => Number(iso.slice(5, 7));
export const gunAl = (iso: string): number => Number(iso.slice(8, 10));

/** Ayın ilk günü. */
export const ayBasi = (iso: string): string => `${iso.slice(0, 7)}-01`;

/**
 * Metnin sonundaki saati ayırır: "toplantı 18:00" → { icerik: "toplantı",
 * saat: "18:00" }. Saat yoksa metin olduğu gibi döner.
 *
 * İki nokta zorunlu. "Sprint 15" bir saat değil; "18.00" da sayılmaz, çünkü
 * "sürüm 1.30" gibi metinleri saate çevirirdi. Yalnızca son kelimeye bakılır
 * ve önünde bir şey olmalı: "18:00" tek başına yazıldıysa görevin adıdır,
 * saati değil — yoksa geriye adsız görev kalırdı.
 */
export function saatAyikla(metin: string): { icerik: string; saat: string | null } {
  const duz = metin.trim();
  const e = duz.match(/^(.*\S)\s+(\d{1,2}):(\d{2})$/);
  if (!e) return { icerik: duz, saat: null };
  const sa = Number(e[2]);
  const dk = Number(e[3]);
  if (sa > 23 || dk > 59) return { icerik: duz, saat: null };
  return { icerik: e[1]!.trim(), saat: `${String(sa).padStart(2, "0")}:${String(dk).padStart(2, "0")}` };
}
