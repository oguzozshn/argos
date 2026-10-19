// Explicit .ts extension: this file also runs under plain Node (araclar/calisma-plani-test.mts).
import { gunEkle, gunFarki, haftaninGunu } from "./gun.ts";

/**
 * Planlar (issue #73): work plans measured in hours — a course, a book, a
 * skill, an exam, a project — laid on a calendar day by day.
 *
 * A plan has a total ("A dersi 25 saat") and may be split into sub-plans
 * with their own hours and deadlines ("Vize, 20 Kasım, 10 saat"; "Final,
 * 20 Aralık, 10 saat"). What the sub-plans leave of the total is the main
 * plan's own share, extra work under it. A session on a day goes either to
 * the plan itself or to one of its sub-plans.
 *
 * Each plan says how many hours a week and on which days to work; the
 * automatic planning spreads what is left over those days, the earliest
 * deadline first. All amounts are minutes, so sums stay whole.
 */

export const CP_YOLU = "calisma-planlari.json";
/** The Yüksek Lisans file of issue #57; read once to carry its courses over. */
export const ESKI_YL_YOLU = "yuksek-lisans.json";

export type PlanTuru = "ders" | "kitap" | "yetenek" | "sinav" | "proje" | "diger";

export const PLAN_TURLERI: { id: PlanTuru; ad: string }[] = [
  { id: "ders", ad: "Ders" },
  { id: "kitap", ad: "Kitap" },
  { id: "yetenek", ad: "Yetenek" },
  { id: "sinav", ad: "Sınav" },
  { id: "proje", ad: "Proje" },
  { id: "diger", ad: "Diğer" },
];

export const PLAN_RENKLERI = ["#7c8cf8", "#4fb38a", "#e0a34a", "#d9708f", "#4aa8c9", "#a585e0", "#c98a5b"];

export interface AltPlan {
  id: string;
  ad: string;
  hedefDk: number;
  /** "YYYY-MM-DD". */
  sonTarih?: string;
}

export interface CalismaPlani {
  id: string;
  ad: string;
  tur: PlanTuru;
  renk: string;
  /** The whole plan, sub-plans included. */
  hedefDk: number;
  /** "YYYY-MM-DD": no work is planned before it; absent means from today. */
  baslangic?: string;
  sonTarih?: string;
  /** Hours a week wanted, in minutes; 0 when not said. */
  haftalikDk: number;
  /** Days to work on: 0 Monday … 6 Sunday. */
  gunler: number[];
  /**
   * Minutes for each weekday, 0 Monday … 6 Sunday ("Pzt 1 sa, Cmt 2 sa").
   * When given, it sets the working days and the weekly hours.
   */
  gunDk?: number[];
  /** Tags of the user's own ("okul", "dönem-1"); the calendar filters by them. */
  etiketler?: string[];
  altlar: AltPlan[];
}

/** Time given to a plan on a day. */
export interface Oturum {
  id: string;
  planId: string;
  /** The sub-plan it is for; absent: the plan itself. */
  altId?: string;
  dk: number;
  yapildi?: boolean;
  /**
   * What was set for it when only part was done; `dk` is then what was
   * done, and the rest is left for planning again.
   */
  planlananDk?: number;
  /** Put there by the automatic planning, which may redo it. */
  oto?: boolean;
}

export interface CpDosyasi {
  version: 1;
  planlar: CalismaPlani[];
  /** Sessions by ISO date. */
  takvim: Record<string, Oturum[]>;
}

export const BOS_CP: CpDosyasi = { version: 1, planlar: [], takvim: {} };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pozitif = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
const tarihMi = (x: unknown): x is string => typeof x === "string" && ISO.test(x);

/** Rounds to a quarter of an hour, the step of planning. */
export const ceyrek = (dk: number): number => Math.round(dk / 15) * 15;

/** A tag as kept: trimmed, without a leading "#" or "@", lower case. */
export const etiketDuzelt = (x: string): string => x.trim().replace(/^[#@]+/, "").trim().toLocaleLowerCase("tr-TR");

function etiketOku(x: unknown): { etiketler?: string[] } {
  if (!Array.isArray(x)) return {};
  const l = [...new Set(x.filter((e): e is string => typeof e === "string").map(etiketDuzelt).filter(Boolean))];
  return l.length ? { etiketler: l } : {};
}

/** Every tag used by some plan, in alphabetical order. */
export const tumEtiketler = (d: CpDosyasi): string[] =>
  [...new Set(d.planlar.flatMap((p) => p.etiketler ?? []))].sort((a, b) => a.localeCompare(b, "tr"));

function gunDkOku(x: unknown): { gunDk?: number[] } {
  if (!Array.isArray(x)) return {};
  const l = Array.from({ length: 7 }, (_, i) => pozitif(x[i]));
  return l.some((dk) => dk > 0) ? { gunDk: l } : {};
}

/* --- reading the file ------------------------------------------------------------- */

export function normalizeCp(ham: unknown): CpDosyasi {
  const d = (ham && typeof ham === "object" ? ham : {}) as Record<string, unknown>;
  const planlar = (Array.isArray(d.planlar) ? d.planlar : [])
    .filter((p): p is CalismaPlani => Boolean(p) && typeof p.id === "string" && typeof p.ad === "string")
    .map((p, i) => ({
      id: p.id,
      ad: p.ad,
      tur: PLAN_TURLERI.some((t) => t.id === p.tur) ? p.tur : ("diger" as PlanTuru),
      renk: typeof p.renk === "string" ? p.renk : PLAN_RENKLERI[i % PLAN_RENKLERI.length]!,
      hedefDk: pozitif(p.hedefDk),
      ...(tarihMi(p.baslangic) ? { baslangic: p.baslangic } : {}),
      ...(tarihMi(p.sonTarih) ? { sonTarih: p.sonTarih } : {}),
      haftalikDk: pozitif(p.haftalikDk),
      gunler: [...new Set((Array.isArray(p.gunler) ? p.gunler : []).filter((g) => Number.isInteger(g) && g >= 0 && g <= 6))].sort(),
      ...gunDkOku(p.gunDk),
      ...etiketOku(p.etiketler),
      altlar: (Array.isArray(p.altlar) ? p.altlar : [])
        .filter((a): a is AltPlan => Boolean(a) && typeof a.id === "string" && typeof a.ad === "string")
        .map((a) => ({ id: a.id, ad: a.ad, hedefDk: pozitif(a.hedefDk), ...(tarihMi(a.sonTarih) ? { sonTarih: a.sonTarih } : {}) })),
    }));
  const hedefVar = new Map(planlar.map((p) => [p.id, new Set(p.altlar.map((a) => a.id))]));
  const takvim: Record<string, Oturum[]> = {};
  const hamTakvim = d.takvim && typeof d.takvim === "object" ? (d.takvim as Record<string, unknown>) : {};
  for (const [gun, liste] of Object.entries(hamTakvim)) {
    if (!ISO.test(gun) || !Array.isArray(liste)) continue;
    const ogeler = liste
      .filter(
        (o): o is Oturum =>
          Boolean(o) &&
          typeof o.id === "string" &&
          hedefVar.has(o.planId) &&
          (o.altId === undefined || hedefVar.get(o.planId)!.has(o.altId)) &&
          pozitif(o.dk) > 0,
      )
      .map((o) => ({
        id: o.id,
        planId: o.planId,
        ...(o.altId ? { altId: o.altId } : {}),
        dk: pozitif(o.dk),
        ...(o.yapildi ? { yapildi: true } : {}),
        ...(o.yapildi && pozitif(o.planlananDk) > pozitif(o.dk) ? { planlananDk: pozitif(o.planlananDk) } : {}),
        ...(o.oto ? { oto: true } : {}),
      }));
    if (ogeler.length) takvim[gun] = ogeler;
  }
  return { version: 1, planlar, takvim };
}

/**
 * Carries the Yüksek Lisans courses of issue #57 over: a course becomes a
 * "ders" plan. One goal becomes the plan's own total, its checkpoints the
 * sub-plans (each the part between it and the one before); several goals
 * become sub-plans. Pages turn into minutes with their minutes per page.
 */
export function ylDenTasi(ham: unknown): CpDosyasi {
  const d = (ham && typeof ham === "object" ? ham : {}) as Record<string, unknown>;
  type EskiHedef = { id: string; tur: string; ad?: string; miktar: number; sonTarih: string; sayfaDk?: number; araHedefler?: { id: string; ad: string; tarih: string; miktar: number }[] };
  type EskiDers = { id: string; ad: string; renk?: string; hedefler?: EskiHedef[]; arsiv?: boolean };
  const dersler = (Array.isArray(d.dersler) ? d.dersler : []) as EskiDers[];
  const dk = (h: EskiHedef, miktar: number) => Math.round(h.tur === "sayfa" ? miktar * (h.sayfaDk || 2) : miktar);
  /** Old goal or checkpoint id → where its sessions go now. */
  const yer = new Map<string, { planId: string; altId?: string }>();
  const planlar: CalismaPlani[] = [];
  for (const [i, ders] of dersler.entries()) {
    if (!ders || typeof ders.id !== "string" || typeof ders.ad !== "string" || ders.arsiv) continue;
    const hedefler = (ders.hedefler ?? []).filter((h) => h && typeof h.id === "string");
    const plan: CalismaPlani = {
      id: ders.id,
      ad: ders.ad,
      tur: "ders",
      renk: ders.renk ?? PLAN_RENKLERI[i % PLAN_RENKLERI.length]!,
      hedefDk: hedefler.reduce((t, h) => t + dk(h, pozitif(h.miktar)), 0),
      haftalikDk: 0,
      gunler: [],
      altlar: [],
    };
    const tarihler = hedefler.map((h) => h.sonTarih).filter(tarihMi).sort();
    if (tarihler.length) plan.sonTarih = tarihler.at(-1)!;
    if (hedefler.length === 1) {
      const h = hedefler[0]!;
      let onceki = 0;
      for (const a of [...(h.araHedefler ?? [])].sort((x, y) => (x.tarih < y.tarih ? -1 : 1))) {
        const pay = dk(h, Math.max(0, a.miktar - onceki));
        onceki = Math.max(onceki, a.miktar);
        if (pay > 0) plan.altlar.push({ id: a.id, ad: a.ad || "Ara hedef", hedefDk: pay, ...(tarihMi(a.tarih) ? { sonTarih: a.tarih } : {}) });
      }
      yer.set(h.id, { planId: plan.id });
    } else {
      for (const h of hedefler) {
        plan.altlar.push({ id: h.id, ad: h.ad || "Çalışma", hedefDk: dk(h, pozitif(h.miktar)), ...(tarihMi(h.sonTarih) ? { sonTarih: h.sonTarih } : {}) });
        yer.set(h.id, { planId: plan.id, altId: h.id });
      }
    }
    planlar.push(plan);
  }
  const eskiHedef = new Map(dersler.flatMap((x) => (x?.hedefler ?? []).map((h) => [h.id, h] as const)));
  const takvim: Record<string, Oturum[]> = {};
  const hamPlan = d.plan && typeof d.plan === "object" ? (d.plan as Record<string, { id: string; hedefId: string; miktar: number; yapildi?: boolean }[]>) : {};
  for (const [gun, liste] of Object.entries(hamPlan)) {
    if (!ISO.test(gun) || !Array.isArray(liste)) continue;
    for (const o of liste) {
      const y = yer.get(o?.hedefId);
      const h = eskiHedef.get(o?.hedefId);
      if (!y || !h || !pozitif(o.miktar)) continue;
      (takvim[gun] ??= []).push({ id: o.id, ...y, dk: dk(h, o.miktar), ...(o.yapildi ? { yapildi: true } : {}) });
    }
  }
  return normalizeCp({ version: 1, planlar, takvim });
}

/* --- reading a plan ----------------------------------------------------------------- */

export const planBul = (d: CpDosyasi, id: string): CalismaPlani | null => d.planlar.find((p) => p.id === id) ?? null;

/** What the sub-plans leave of the total: the plan's own share. */
export const anaPayDk = (p: CalismaPlani): number => Math.max(0, p.hedefDk - p.altlar.reduce((t, a) => t + a.hedefDk, 0));

/** The sub-plans ask for more than the plan's total. */
export const altlarTasiyor = (p: CalismaPlani): boolean => p.altlar.reduce((t, a) => t + a.hedefDk, 0) > p.hedefDk;

/** A part of a plan: one of its sub-plans, or the plan's own share (`altId` absent). */
export interface ParcaDurumu {
  altId?: string;
  ad: string;
  hedefDk: number;
  sonTarih?: string;
  planliDk: number;
  yapilanDk: number;
  /** Planned on days up to its deadline (all of it when there is none). */
  zamanindaDk: number;
  /** Not on the calendar yet. */
  eksikDk: number;
  yetisir: boolean;
  gecti: boolean;
}

export interface PlanDurumu {
  planliDk: number;
  yapilanDk: number;
  eksikDk: number;
  /** Sub-plans in deadline order, then the plan's own share if it has one. */
  parcalar: ParcaDurumu[];
}

export const ANA_PAY_ADI = "Ekstra çalışma";

const tarihSirasi = (a?: string, b?: string): number => (a && b ? (a < b ? -1 : a > b ? 1 : 0) : a ? -1 : b ? 1 : 0);

export function planDurumu(d: CpDosyasi, p: CalismaPlani, bugun: string): PlanDurumu {
  const parca = (altId: string | undefined, ad: string, hedefDk: number, sonTarih?: string): ParcaDurumu => {
    let planliDk = 0;
    let yapilanDk = 0;
    let zamanindaDk = 0;
    for (const [gun, l] of Object.entries(d.takvim)) {
      for (const o of l) {
        if (o.planId !== p.id || o.altId !== altId) continue;
        planliDk += o.dk;
        if (o.yapildi) yapilanDk += o.dk;
        if (!sonTarih || gun <= sonTarih) zamanindaDk += o.dk;
      }
    }
    return {
      ...(altId ? { altId } : {}),
      ad,
      hedefDk,
      ...(sonTarih ? { sonTarih } : {}),
      planliDk,
      yapilanDk,
      zamanindaDk,
      eksikDk: Math.max(0, hedefDk - planliDk),
      yetisir: zamanindaDk >= hedefDk,
      gecti: Boolean(sonTarih && sonTarih < bugun),
    };
  };
  const altlar = [...p.altlar].sort((a, b) => tarihSirasi(a.sonTarih, b.sonTarih)).map((a) => parca(a.id, a.ad, a.hedefDk, a.sonTarih));
  const ana = parca(undefined, ANA_PAY_ADI, anaPayDk(p), p.sonTarih);
  const parcalar = ana.hedefDk > 0 || ana.planliDk > 0 || p.altlar.length === 0 ? [...altlar, { ...ana, ad: p.altlar.length ? ANA_PAY_ADI : p.ad }] : altlar;
  const planliDk = parcalar.reduce((t, x) => t + x.planliDk, 0);
  const yapilanDk = parcalar.reduce((t, x) => t + x.yapilanDk, 0);
  return { planliDk, yapilanDk, eksikDk: Math.max(0, p.hedefDk - planliDk), parcalar };
}

/* --- weekly effort --------------------------------------------------------------------- */

export const haftaBasi = (iso: string): string => gunEkle(iso, -haftaninGunu(iso));

export interface HaftaEforu {
  planliDk: number;
  yapilanDk: number;
  planlar: { plan: CalismaPlani; planliDk: number; yapilanDk: number }[];
}

/** Effort planned and done from `bas` for `gun` days (a week by default). */
export function eforu(d: CpDosyasi, bas: string, gun = 7): HaftaEforu {
  const plana = new Map<string, { plan: CalismaPlani; planliDk: number; yapilanDk: number }>();
  let planliDk = 0;
  let yapilanDk = 0;
  for (let i = 0; i < gun; i++) {
    for (const o of d.takvim[gunEkle(bas, i)] ?? []) {
      const p = planBul(d, o.planId);
      if (!p) continue;
      planliDk += o.dk;
      if (o.yapildi) yapilanDk += o.dk;
      const x = plana.get(p.id) ?? plana.set(p.id, { plan: p, planliDk: 0, yapilanDk: 0 }).get(p.id)!;
      x.planliDk += o.dk;
      if (o.yapildi) x.yapilanDk += o.dk;
    }
  }
  return { planliDk, yapilanDk, planlar: [...plana.values()] };
}

/* --- automatic planning ------------------------------------------------------------- */

export interface PlanlamaRaporu {
  eklenenDk: number;
  oturum: number;
  /** Parts that do not fit before their deadline, with what is left. */
  yetismeyen: { ad: string; eksikDk: number }[];
  /** Neither weekly hours nor any deadline: nothing to plan by. */
  ayarYok?: boolean;
  /** A working day's share that was used. */
  gunlukDk?: number;
  /** The share was worked out from the deadlines (no weekly hours given). */
  hesaplandi?: boolean;
}

/** How far ahead planning goes when a part has no deadline. */
const UFUK_GUN = 365;

/** The plan's working days; none chosen means every day. */
export const calismaGunleri = (p: CalismaPlani): number[] =>
  p.gunDk ? [0, 1, 2, 3, 4, 5, 6].filter((g) => p.gunDk![g]! > 0) : p.gunler.length ? p.gunler : [0, 1, 2, 3, 4, 5, 6];

/** The weekly hours asked for: the days' own hours added up, else the weekly figure; 0 when not said. */
export const haftalikHedef = (p: CalismaPlani): number => (p.gunDk ? p.gunDk.reduce((t, dk) => t + dk, 0) : p.haftalikDk);

/** A working day's share on the given weekday, when the plan says it. */
export function gunPayi(p: CalismaPlani, haftaGunu: number): number | null {
  if (p.gunDk) return p.gunDk[haftaGunu] ?? 0;
  if (!p.haftalikDk) return null;
  return Math.max(15, ceyrek(p.haftalikDk / calismaGunleri(p).length));
}

/** The first day planning may use: the plan's start, or today when that is later. */
export const planBaslangici = (p: CalismaPlani, bugun: string): string => (p.baslangic && p.baslangic > bugun ? p.baslangic : bugun);

/** Working days from `bas` to `son`, both included. */
function isGunu(bas: string, son: string, gunler: number[]): number {
  let n = 0;
  for (let g = bas; g <= son; g = gunEkle(g, 1)) if (gunler.includes(haftaninGunu(g))) n += 1;
  return n;
}

/**
 * What planning starts from: the file without the plan's own undone
 * sessions from today on (planning puts them again), and what is left of
 * each part, the earliest deadline first.
 */
function planlanacaklar(d: CpDosyasi, p: CalismaPlani, bugun: string) {
  const takvim: Record<string, Oturum[]> = {};
  for (const [gun, l] of Object.entries(d.takvim)) {
    const kalan = l.filter((o) => !(o.planId === p.id && o.oto && !o.yapildi && gun >= bugun));
    if (kalan.length) takvim[gun] = kalan;
  }
  const dosya: CpDosyasi = { ...d, takvim };
  const parcalar = planDurumu(dosya, p, bugun)
    .parcalar.map((x) => ({ altId: x.altId, ad: x.ad, sonTarih: x.sonTarih, kalan: x.eksikDk }))
    .filter((x) => x.kalan > 0)
    .sort((a, b) => tarihSirasi(a.sonTarih, b.sonTarih));
  return { dosya, parcalar };
}

/**
 * The least a working day needs so that every deadline is met: for each
 * deadline, all that is due by it over the working days up to it; the
 * largest of these, rounded up to a quarter hour. Null when no part has a
 * deadline to work it out from; 0 when nothing is left.
 */
export function gerekenGunluk(d: CpDosyasi, p: CalismaPlani, bugun: string): number | null {
  const { parcalar } = planlanacaklar(d, p, bugun);
  if (parcalar.length === 0) return 0;
  const gunler = calismaGunleri(p);
  let birikmis = 0;
  let en = 0;
  let tarihli = false;
  for (const x of parcalar) {
    birikmis += x.kalan;
    if (!x.sonTarih) continue;
    tarihli = true;
    const n = isGunu(planBaslangici(p, bugun), x.sonTarih, gunler);
    if (n > 0) en = Math.max(en, birikmis / n);
  }
  if (!tarihli) return null;
  return Math.max(15, Math.ceil(en / 15) * 15);
}

/**
 * Spreads what is left of a plan over its working days from today, the
 * part with the earliest deadline first. A day gets its own hours when
 * the plan gives them day by day, else its share of the weekly hours, and a week never more than them; with no weekly hours
 * given, the share is what the deadlines need (`gerekenGunluk`). Undone
 * sessions it put on today or later are taken back and planned again;
 * sessions placed by hand and done ones stay and count.
 */
export function otomatikPlanla(d: CpDosyasi, planId: string, bugun: string, yeniId: () => string): { dosya: CpDosyasi; rapor: PlanlamaRaporu } {
  const p = planBul(d, planId);
  const rapor: PlanlamaRaporu = { eklenenDk: 0, oturum: 0, yetismeyen: [] };
  if (!p) return { dosya: d, rapor };

  const { parcalar, dosya: temiz } = planlanacaklar(d, p, bugun);
  let dosya = temiz;
  const gunler = calismaGunleri(p);
  let gunluk: number;
  let haftalik: number;
  if (haftalikHedef(p)) {
    gunluk = gunPayi(p, haftaninGunu(planBaslangici(p, bugun))) ?? 0;
    haftalik = haftalikHedef(p);
  } else {
    const gereken = gerekenGunluk(d, p, bugun);
    if (gereken === null) return { dosya: d, rapor: { ...rapor, ayarYok: true } };
    gunluk = gereken;
    haftalik = Number.POSITIVE_INFINITY;
    rapor.hesaplandi = true;
  }
  rapor.gunlukDk = gunluk;
  if (parcalar.length === 0) return { dosya, rapor };

  const sonGun = parcalar.every((x) => x.sonTarih) ? parcalar.map((x) => x.sonTarih!).sort().at(-1)! : gunEkle(planBaslangici(p, bugun), UFUK_GUN);
  const planinGunu = (gun: string) => (dosya.takvim[gun] ?? []).filter((o) => o.planId === planId).reduce((t, o) => t + o.dk, 0);

  for (let gun = planBaslangici(p, bugun); gun <= sonGun && parcalar.some((x) => x.kalan > 0); gun = gunEkle(gun, 1)) {
    if (!gunler.includes(haftaninGunu(gun))) continue;
    const hafta = haftaBasi(gun);
    let haftada = 0;
    for (let i = 0; i < 7; i++) haftada += planinGunu(gunEkle(hafta, i));
    const pay = p.gunDk ? p.gunDk[haftaninGunu(gun)]! : gunluk;
    let bos = Math.min(pay - planinGunu(gun), haftalik - haftada);
    while (bos >= 15) {
      // The earliest part still open whose deadline has not passed.
      const x = parcalar.find((y) => y.kalan > 0 && (!y.sonTarih || y.sonTarih >= gun));
      if (!x) break;
      const dk = Math.min(bos, x.kalan);
      const o: Oturum = { id: yeniId(), planId, ...(x.altId ? { altId: x.altId } : {}), dk, oto: true };
      dosya = { ...dosya, takvim: { ...dosya.takvim, [gun]: [...(dosya.takvim[gun] ?? []), o] } };
      x.kalan -= dk;
      bos -= dk;
      rapor.eklenenDk += dk;
      rapor.oturum += 1;
    }
  }
  rapor.yetismeyen = parcalar.filter((x) => x.kalan > 0).map((x) => ({ ad: x.ad, eksikDk: x.kalan }));
  return { dosya, rapor };
}

/* --- edits --------------------------------------------------------------------------- */

export const planEkle = (d: CpDosyasi, p: CalismaPlani): CpDosyasi => ({ ...d, planlar: [...d.planlar, p] });

export const planGuncelle = (d: CpDosyasi, id: string, f: (p: CalismaPlani) => CalismaPlani): CpDosyasi => ({
  ...d,
  planlar: d.planlar.map((p) => (p.id === id ? f(p) : p)),
});

function takvimSuz(d: CpDosyasi, tut: (o: Oturum, gun: string) => Oturum | null): CpDosyasi {
  const takvim: Record<string, Oturum[]> = {};
  for (const [gun, l] of Object.entries(d.takvim)) {
    const y = l.map((o) => tut(o, gun)).filter((o): o is Oturum => o !== null);
    if (y.length) takvim[gun] = y;
  }
  return { ...d, takvim };
}

/** Removes a plan with its sessions. */
export const planSil = (d: CpDosyasi, id: string): CpDosyasi => ({
  ...takvimSuz(d, (o) => (o.planId === id ? null : o)),
  planlar: d.planlar.filter((p) => p.id !== id),
});

export const altEkle = (d: CpDosyasi, planId: string, a: AltPlan): CpDosyasi =>
  planGuncelle(d, planId, (p) => ({ ...p, altlar: [...p.altlar, a] }));

export const altGuncelle = (d: CpDosyasi, planId: string, altId: string, patch: Partial<Omit<AltPlan, "id">>): CpDosyasi =>
  planGuncelle(d, planId, (p) => ({
    ...p,
    altlar: p.altlar.map((a) => {
      if (a.id !== altId) return a;
      const y = { ...a, ...patch };
      if (!y.sonTarih) delete y.sonTarih;
      return y;
    }),
  }));

/** Removes a sub-plan: its done sessions move to the plan itself, the rest go. */
export function altSil(d: CpDosyasi, planId: string, altId: string): CpDosyasi {
  const y = takvimSuz(d, (o) => {
    if (o.planId !== planId || o.altId !== altId) return o;
    if (!o.yapildi) return null;
    const { altId: _, ...ana } = o;
    return ana;
  });
  return planGuncelle(y, planId, (p) => ({ ...p, altlar: p.altlar.filter((a) => a.id !== altId) }));
}

export const oturumEkle = (d: CpDosyasi, gun: string, o: Oturum): CpDosyasi =>
  o.dk > 0 && planBul(d, o.planId) ? { ...d, takvim: { ...d.takvim, [gun]: [...(d.takvim[gun] ?? []), o] } } : d;

export const oturumSil = (d: CpDosyasi, gun: string, id: string): CpDosyasi => takvimSuz(d, (o, g) => (g === gun && o.id === id ? null : o));

/** Ticks a session; a ticked one is the user's now, the planning leaves it. */
/** Marks a session done or not done, all of it. */
export const oturumIsaretle = (d: CpDosyasi, gun: string, id: string, yapildi: boolean): CpDosyasi =>
  oturumKismen(d, gun, id, yapildi ? Number.POSITIVE_INFINITY : 0);

/**
 * Marks how much of a session was done: all of it, none, or a part. A part
 * keeps only what was done on the day (with what was set, to show it), so
 * what is left goes back to the plan's undone hours.
 */
export const oturumKismen = (d: CpDosyasi, gun: string, id: string, yapilanDk: number): CpDosyasi =>
  takvimSuz(d, (o, g) => {
    if (g !== gun || o.id !== id) return o;
    const { yapildi: _, planlananDk: __, ...y } = o;
    const tam = o.planlananDk ?? o.dk;
    if (yapilanDk <= 0) return { ...y, dk: tam };
    if (yapilanDk >= tam) return { ...y, dk: tam, yapildi: true };
    return { ...y, dk: yapilanDk, yapildi: true, planlananDk: tam };
  });

/** Days left to a deadline, today included; 0 once it has passed. */
export const kalanGun = (sonTarih: string, bugun: string): number => Math.max(0, gunFarki(sonTarih, bugun) + 1);
