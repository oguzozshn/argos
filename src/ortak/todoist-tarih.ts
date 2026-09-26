/**
 * Todoist tarih metni çevirisi.
 *
 * Todoist'in doğal dil tarih tanıması Türkçeyi desteklemiyor: `due_lang: "tr"`
 * ile gönderilen "her salı" ya da "yarın 18:00" ya hata verir ya da yanlış
 * çözülür. Bu yüzden kullanıcının yazdığı Türkçe metin Todoist'e gitmeden
 * önce İngilizce karşılığına çevrilir, dönen İngilizce metin de ekranda
 * Türkçe okunur.
 *
 * Tanınmayan metin olduğu gibi (İngilizce sayılarak) gider: "every 3rd friday"
 * yazan kullanıcı Todoist'in kendi dilini kullanabilsin.
 */

import { haftaninGunu } from "./gun.ts";

const GUN_EN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const GUN_EN_KISA = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const GUN_TR = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"];
const AY_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const AY_TR_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** Türkçe gün adı ve kısaltmaları → 0 (Pazartesi) … 6 (Pazar). */
const GUN_SOZLUK: Record<string, number> = {
  pazartesi: 0, pzt: 0, pts: 0,
  salı: 1, sali: 1, sal: 1,
  çarşamba: 2, carsamba: 2, çar: 2, car: 2, çrş: 2,
  perşembe: 3, persembe: 3, per: 3, prş: 3,
  cuma: 4, cum: 4,
  cumartesi: 5, cmt: 5, cts: 5,
  pazar: 6, paz: 6, pz: 6,
};

const AY_SOZLUK: Record<string, number> = {
  ocak: 0, oca: 0, şubat: 1, subat: 1, şub: 1, sub: 1, mart: 2, mar: 2,
  nisan: 3, nis: 3, mayıs: 4, mayis: 4, may: 4, haziran: 5, haz: 5,
  temmuz: 6, tem: 6, ağustos: 7, agustos: 7, ağu: 7, agu: 7,
  eylül: 8, eylul: 8, eyl: 8, ekim: 9, eki: 9, kasım: 10, kasim: 10, kas: 10,
  aralık: 11, aralik: 11, ara: 11,
};

const SAYI: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5,
  altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
};

const BIRIM_EN: Record<string, string> = { gün: "day", hafta: "week", ay: "month", yıl: "year", sene: "year" };

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export const siraEn = (n: number): string => {
  const son = n % 100;
  if (son >= 11 && son <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const sayiOku = (x: string): number | null => {
  if (/^\d+$/.test(x)) return Number(x);
  return SAYI[x] ?? null;
};

/** "gün", "günde", "günlük", "haftada" … → birim kökü. */
const birimOku = (x: string): string | null => {
  for (const kok of Object.keys(BIRIM_EN)) if (x.startsWith(kok)) return kok;
  return null;
};

const kucult = (m: string): string =>
  m.toLocaleLowerCase("tr-TR").replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

/** Metnin sonundaki saati ayırır: "18:00", "saat 18", "saat 18.30", "18:00'de". */
function saatAyir(m: string): { govde: string; saat: string | null } {
  const r =
    m.match(/^(.*?)\s*(?:saat\s*)?(\d{1,2}):(\d{2})(?:'?(?:de|da|te|ta))?$/) ??
    m.match(/^(.*?)\s*saat\s*(\d{1,2})(?:\.(\d{2}))?(?:'?(?:de|da|te|ta))?$/);
  if (!r) return { govde: m, saat: null };
  const s = Number(r[2]);
  const d = Number(r[3] ?? 0);
  if (s > 23 || d > 59) return { govde: m, saat: null };
  return { govde: r[1]!.trim(), saat: `${String(s).padStart(2, "0")}:${String(d).padStart(2, "0")}` };
}

/** Gün adı listesi: "pazartesi ve perşembe", "pzt, çar, cum". */
function gunListesi(m: string): number[] | null {
  const parcalar = m.split(/\s*(?:,|\bve\b|\s)\s*/).filter(Boolean);
  if (parcalar.length === 0) return null;
  const gunler: number[] = [];
  for (const p of parcalar) {
    const g = GUN_SOZLUK[p.replace(/(?:'?(?:leri|ları|lari|si|sı|u|ü|i|ı))$/, "")] ?? GUN_SOZLUK[p];
    if (g === undefined) return null;
    if (!gunler.includes(g)) gunler.push(g);
  }
  return gunler;
}

/** Tekrar ifadesi → "every …". Tanınmazsa null. */
function tekrarCevir(m: string): string | null {
  if (/^(her ?gün|günlük|her gün)$/.test(m)) return "every day";
  if (/^(her )?hafta ?içi( her gün)?$/.test(m)) return "every weekday";
  if (/^(her )?hafta ?sonu( her gün)?$/.test(m)) return "every sat, sun";
  if (/^(her hafta|haftalık)$/.test(m)) return "every week";
  if (/^(her ay|aylık)$/.test(m)) return "every month";
  if (/^(her (yıl|sene)|yıllık)$/.test(m)) return "every year";
  if (/^her ayın son günü$/.test(m)) return "every last day";

  // "her ayın 15'i", "her ayın 15'inde", "her ayın 15. günü"
  const ayin = m.match(/^her ayın (\d{1,2})(?:'?\S*|\. günü)?$/);
  if (ayin) {
    const n = Number(ayin[1]);
    if (n >= 1 && n <= 31) return `every ${siraEn(n)}`;
  }

  // "her 2 günde", "her 3 hafta", "2 haftada bir", "iki günde bir"
  const aralik = m.match(/^(?:her )?(\S+) (\S+?)(?: bir)?$/);
  if (aralik) {
    const n = sayiOku(aralik[1]!);
    const birim = birimOku(aralik[2]!);
    const birli = m.endsWith(" bir") || m.startsWith("her ");
    if (n && birim && birli) return n === 1 ? `every ${BIRIM_EN[birim]}` : `every ${n} ${BIRIM_EN[birim]}s`;
  }

  // "her salı", "her pazartesi ve perşembe", "her pzt, çar"
  const gunlu = m.match(/^her (.+)$/);
  if (gunlu) {
    const gunler = gunListesi(gunlu[1]!);
    if (gunler) return `every ${gunler.map((g) => GUN_EN_KISA[g]).join(", ")}`;
  }
  return null;
}

/** Tekil gün ifadesi → Todoist'in İngilizce karşılığı. Tanınmazsa null. */
function gunCevir(m: string): string | null {
  if (m === "") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(m)) return m;
  if (m === "bugün" || m === "bugun") return "today";
  if (m === "yarın" || m === "yarin") return "tomorrow";
  if (/^(öbür ?gün|yarından sonra|ertesi gün)$/.test(m)) return "in 2 days";
  if (/^(haftaya|gelecek hafta|önümüzdeki hafta)$/.test(m)) return "next week";
  if (/^(gelecek ay|önümüzdeki ay)$/.test(m)) return "next month";

  const sonra = m.match(/^(\S+) (gün|hafta|ay) sonra$/);
  if (sonra) {
    const n = sayiOku(sonra[1]!);
    if (n) return `in ${n} ${BIRIM_EN[sonra[2]!]}${n > 1 ? "s" : ""}`;
  }

  // "haftaya salı", "gelecek cuma" → Todoist "next friday"
  const gelecek = m.match(/^(?:haftaya|gelecek|önümüzdeki) (\S+)$/);
  if (gelecek && GUN_SOZLUK[gelecek[1]!] !== undefined) return `next ${GUN_EN[GUN_SOZLUK[gelecek[1]!]!]}`;

  const gun = GUN_SOZLUK[m.replace(/(?:'?(?:ya|ye|a|e|da|de|ta|te|yı|yi|ı|i))$/, "")] ?? GUN_SOZLUK[m];
  if (gun !== undefined) return GUN_EN[gun]!;

  // "25.09", "25/09", "25.09.2027"
  const noktali = m.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/);
  if (noktali) {
    const g = Number(noktali[1]);
    const a = Number(noktali[2]);
    if (g >= 1 && g <= 31 && a >= 1 && a <= 12) return `${AY_EN[a - 1]} ${g}${noktali[3] ? ` ${noktali[3]}` : ""}`;
  }

  // "25 eylül", "25 eyl 2027"
  const adli = m.match(/^(\d{1,2}) (\S+)(?: (\d{4}))?$/);
  if (adli) {
    const g = Number(adli[1]);
    const ad = adli[2]!.split("'")[0]!;
    const a = AY_SOZLUK[ad] ?? AY_SOZLUK[ad.slice(0, 3)];
    if (a !== undefined && g >= 1 && g <= 31) return `${AY_EN[a]} ${g}${adli[3] ? ` ${adli[3]}` : ""}`;
  }
  return null;
}

/** Türkçe tarih ya da tekrar ifadesinin İngilizcesi; tanınmazsa null. */
export function turkceTarihCevir(metin: string): string | null {
  const { govde, saat } = saatAyir(kucult(metin));
  const zamanli = (x: string) => (saat ? (x ? `${x} at ${saat}` : `today at ${saat}`) : x);

  const tekrar = tekrarCevir(govde);
  if (tekrar) return zamanli(tekrar);
  const gun = gunCevir(govde);
  if (gun !== null && (gun || saat)) return zamanli(gun);
  return null;
}

/**
 * Kullanıcının yazdığı tarih metnini Todoist'in anlayacağı İngilizceye çevirir.
 * Tanınmayan metin olduğu gibi döner; `dil` her durumda İngilizcedir.
 */
export function todoistTarihMetni(metin: string): { metin: string; dil: "en" } {
  const ham = metin.trim();
  // Zaten tarih + saat ya da İngilizce yazılmışsa dokunma.
  if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(ham)) return { metin: ham, dil: "en" };
  return { metin: turkceTarihCevir(ham) ?? ham, dil: "en" };
}

/* --- hızlı ekleme satırı -------------------------------------------------- */

/** Todoist'in kendi işaretleri: proje, etiket, bölüm, öncelik. Tarih sayılmaz. */
const isaretMi = (s: string): boolean => /^[#@/+]/.test(s) || /^p[1-4]$/i.test(s);

/** Bir tarih ifadesi en çok bu kadar sözcük: "her pazartesi ve perşembe saat 18.30". */
const EN_UZUN = 7;

/**
 * Hızlı ekleme satırında ("fatura öde yarın 18:00 #Ev p1") Türkçe tarih
 * parçasını bulup yerinde İngilizcesiyle değiştirir; Todoist Quick Add
 * Türkçe tarih tanımadığından gerisini (proje, etiket, öncelik) kendisi çözer.
 *
 * Tarih çoğunlukla sona yazılır: en sağdaki, sonra en uzun eşleşme seçilir.
 * Tek sözcüklük parça kısa kısaltmaysa ("car", "per") tarih sayılmaz — görev
 * metnindeki sıradan bir sözcük tarihe dönmesin.
 */
export function hizliMetniCevir(metin: string): { metin: string; tarih: string | null; ceviri: string | null } {
  const sozcukler = metin.trim().split(/\s+/).filter(Boolean);
  for (let son = sozcukler.length; son > 0; son--) {
    for (let bas = Math.max(0, son - EN_UZUN); bas < son; bas++) {
      const parca = sozcukler.slice(bas, son);
      if (parca.some(isaretMi)) continue;
      if (parca.length === 1 && parca[0]!.length < 4 && !/\d/.test(parca[0]!)) continue;
      // Görevin kendisinden bir sözcük kalmalı: "Pazar" tek başına görev adıdır.
      const kalan = [...sozcukler.slice(0, bas), ...sozcukler.slice(son)].filter((x) => !isaretMi(x));
      if (kalan.length === 0) continue;
      const tarih = parca.join(" ");
      const ceviri = turkceTarihCevir(tarih);
      if (!ceviri) continue;
      return {
        metin: [...sozcukler.slice(0, bas), ceviri, ...sozcukler.slice(son)].join(" "),
        tarih,
        ceviri,
      };
    }
  }
  return { metin: metin.trim(), tarih: null, ceviri: null };
}

/* --- takvimden seçilen tekrar ------------------------------------------- */

export type TekrarTuru = "gun" | "haftaIci" | "hafta" | "ay" | "yil";

/** Seçicide görünen ad; günün kendisine göre ("her Cumartesi"). */
export function tekrarAdi(tur: TekrarTuru, iso: string): string {
  const gun = Number(iso.slice(8, 10));
  const ay = Number(iso.slice(5, 7)) - 1;
  const gunAdi = GUN_TR[haftaninGunu(iso)]!;
  switch (tur) {
    case "gun":
      return "Her gün";
    case "haftaIci":
      return "Hafta içi her gün";
    case "hafta":
      return `Her ${gunAdi}`;
    case "ay":
      return `Her ayın ${gun}. günü`;
    case "yil":
      return `Her yıl ${gun} ${AY_TR_KISA[ay]}`;
  }
}

/**
 * Takvimde seçilen günden başlayan tekrar. Başlangıç açıkça yazılır: seçilen
 * gün bugünden ileride olabilir, "every day" tek başına bugünden başlardı.
 * Todoist'in önerdiği sıra: önce tekrar, sonra saat, en sonda başlangıç.
 */
export function tekrarMetni(tur: TekrarTuru, iso: string, saat: string | null): string {
  const gun = Number(iso.slice(8, 10));
  const ay = AY_EN[Number(iso.slice(5, 7)) - 1]!;
  const temel = {
    gun: "every day",
    haftaIci: "every weekday",
    hafta: `every ${GUN_EN[haftaninGunu(iso)]}`,
    ay: `every ${siraEn(gun)}`,
    yil: `every ${ay} ${gun}`,
  }[tur];
  const baslangic = tur === "yil" ? "" : ` starting ${ay} ${gun} ${iso.slice(0, 4)}`;
  return `${temel}${saat ? ` at ${saat}` : ""}${baslangic}`;
}

/* --- ekranda okuma -------------------------------------------------------- */

/**
 * Todoist'in döndürdüğü İngilizce tarih metnini Türkçe okunur hâle getirir.
 * Yalnızca bu dosyanın ürettiği biçimler çevrilir; gerisi olduğu gibi kalır.
 */
export function tarihMetniTurkce(metin: string | null): string | null {
  if (!metin) return metin;
  let m = metin.trim().toLowerCase();
  let ek = "";

  const bas = m.match(/^(.*?) starting (\w{3}) (\d{1,2})(?: \d{4})?$/);
  if (bas && AY_EN.includes(bas[2]!)) {
    m = bas[1]!;
    ek = ` · ${Number(bas[3])} ${AY_TR_KISA[AY_EN.indexOf(bas[2]!)]}'den`;
  }
  let saat = "";
  const s = m.match(/^(.*?) at (\d{1,2}:\d{2})$/);
  if (s) {
    m = s[1]!;
    saat = ` ${s[2]}`;
  }

  const gunTr = (x: string): string | null => {
    const i = GUN_EN_KISA.indexOf(x.slice(0, 3));
    return i >= 0 && (x.length === 3 || GUN_EN[i] === x) ? GUN_TR[i]! : null;
  };
  const BIRIM_TR: Record<string, string> = { day: "gün", week: "hafta", month: "ay", year: "yıl" };

  let tr: string | null = null;
  if (m === "every day") tr = "her gün";
  else if (m === "every weekday") tr = "hafta içi her gün";
  else if (m === "every sat, sun") tr = "hafta sonu";
  else if (m === "every last day") tr = "her ayın son günü";
  else if (m === "today") tr = "bugün";
  else if (m === "tomorrow") tr = "yarın";
  else if (m === "next week") tr = "haftaya";
  else if (m === "next month") tr = "gelecek ay";
  else if (GUN_EN.includes(m)) tr = GUN_TR[GUN_EN.indexOf(m)]!;
  else if (/^next \w+day$/.test(m) && GUN_EN.includes(m.slice(5))) tr = `haftaya ${GUN_TR[GUN_EN.indexOf(m.slice(5))]}`;
  else if (/^in \d+ (day|week|month)s?$/.test(m)) {
    const [, n, b] = m.match(/^in (\d+) (day|week|month)/)!;
    tr = `${n} ${BIRIM_TR[b!]} sonra`;
  } else if (/^\w{3} \d{1,2}( \d{4})?$/.test(m) && AY_EN.includes(m.slice(0, 3))) {
    const [a, g, y] = m.split(" ");
    tr = `${Number(g)} ${AY_TR_KISA[AY_EN.indexOf(a!)]}${y ? ` ${y}` : ""}`;
  }
  else if (/^every (day|week|month|year)$/.test(m)) tr = `her ${BIRIM_TR[m.slice(6)]}`;
  else {
    const n = m.match(/^every (\d+) (day|week|month|year)s$/);
    const ayin = m.match(/^every (\d{1,2})(?:st|nd|rd|th)$/);
    const yil = m.match(/^every (\w{3}) (\d{1,2})$/);
    const gunler = m.match(/^every ([a-z, ]+)$/);
    if (n) tr = `${n[1]} ${BIRIM_TR[n[2]!]}da bir`.replace("günda", "günde");
    else if (ayin) tr = `her ayın ${ayin[1]}. günü`;
    else if (yil && AY_EN.includes(yil[1]!)) tr = `her yıl ${Number(yil[2])} ${AY_TR_KISA[AY_EN.indexOf(yil[1]!)]}`;
    else if (gunler) {
      const adlar = gunler[1]!.split(/\s*,\s*/).map(gunTr);
      if (adlar.every(Boolean)) tr = `her ${adlar.join(", ")}`;
    }
  }
  return tr ? `${tr}${saat}${ek}` : metin;
}
