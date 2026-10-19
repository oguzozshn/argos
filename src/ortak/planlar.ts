// Explicit .ts extension: this file also runs under plain Node (araclar/planlar-test.mts).

/**
 * Planlar (issue #69): plans of things to do, each split into sub-plans
 * as deep as needed. A plan is a tree; a node with no children is a step
 * that gets ticked, and a node with children is done when all of them are.
 * Kept in `planlar.json`.
 */

export const PLAN_YOLU = "planlar.json";

export interface PlanDugumu {
  id: string;
  ad: string;
  not?: string;
  /** "YYYY-MM-DD". */
  tarih?: string;
  /** A leaf's tick; a parent's state comes from its children. */
  bitti?: boolean;
  /** Folded on screen. */
  kapali?: boolean;
  altlar: PlanDugumu[];
}

export interface PlanDosyasi {
  version: 1;
  planlar: PlanDugumu[];
}

export const BOS_PLANLAR: PlanDosyasi = { version: 1, planlar: [] };

function dugumOku(ham: unknown): PlanDugumu | null {
  if (!ham || typeof ham !== "object") return null;
  const h = ham as Record<string, unknown>;
  if (typeof h.id !== "string" || typeof h.ad !== "string") return null;
  return {
    id: h.id,
    ad: h.ad,
    ...(typeof h.not === "string" && h.not ? { not: h.not } : {}),
    ...(typeof h.tarih === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.tarih) ? { tarih: h.tarih } : {}),
    ...(h.bitti ? { bitti: true } : {}),
    ...(h.kapali ? { kapali: true } : {}),
    altlar: (Array.isArray(h.altlar) ? h.altlar : []).map(dugumOku).filter((x): x is PlanDugumu => x !== null),
  };
}

export function normalizePlanlar(ham: unknown): PlanDosyasi {
  const d = (ham && typeof ham === "object" ? ham : {}) as { planlar?: unknown };
  return {
    version: 1,
    planlar: (Array.isArray(d.planlar) ? d.planlar : []).map(dugumOku).filter((x): x is PlanDugumu => x !== null),
  };
}

/* --- reading ----------------------------------------------------------------------- */

/** Steps (leaves) done and in total; a node without children counts as one step. */
export function ilerleme(n: PlanDugumu): { biten: number; toplam: number } {
  if (n.altlar.length === 0) return { biten: n.bitti ? 1 : 0, toplam: 1 };
  return n.altlar.reduce(
    (t, a) => {
      const x = ilerleme(a);
      return { biten: t.biten + x.biten, toplam: t.toplam + x.toplam };
    },
    { biten: 0, toplam: 0 },
  );
}

export const bittiMi = (n: PlanDugumu): boolean => {
  const x = ilerleme(n);
  return x.biten === x.toplam;
};

/** The first open step under a node, in order (itself when it is a step): what is next. */
export function siradaki(n: PlanDugumu): PlanDugumu | null {
  if (n.altlar.length === 0) return n.bitti ? null : n;
  for (const a of n.altlar) {
    const s = siradaki(a);
    if (s) return s;
  }
  return null;
}

/* --- edits (by id, anywhere in the tree) -------------------------------------------- */

const agacDegistir = (liste: PlanDugumu[], id: string, f: (n: PlanDugumu) => PlanDugumu | null): PlanDugumu[] =>
  liste.flatMap((n) => {
    if (n.id === id) {
      const y = f(n);
      return y ? [y] : [];
    }
    return [{ ...n, altlar: agacDegistir(n.altlar, id, f) }];
  });

const dosyaDegistir = (d: PlanDosyasi, id: string, f: (n: PlanDugumu) => PlanDugumu | null): PlanDosyasi => ({
  ...d,
  planlar: agacDegistir(d.planlar, id, f),
});

export const planEkle = (d: PlanDosyasi, n: PlanDugumu): PlanDosyasi => ({ ...d, planlar: [...d.planlar, n] });

/** Adds a sub-plan under `ustId` and unfolds the parent so it shows. */
export const altEkle = (d: PlanDosyasi, ustId: string, n: PlanDugumu): PlanDosyasi =>
  dosyaDegistir(d, ustId, (u) => ({ ...u, kapali: undefined, altlar: [...u.altlar, n] }));

export const dugumGuncelle = (d: PlanDosyasi, id: string, patch: Partial<Omit<PlanDugumu, "id" | "altlar">>): PlanDosyasi =>
  dosyaDegistir(d, id, (n) => {
    const y = { ...n, ...patch };
    for (const k of Object.keys(y) as (keyof PlanDugumu)[]) if (y[k] === undefined || y[k] === "") delete y[k];
    return y;
  });

export const dugumSil = (d: PlanDosyasi, id: string): PlanDosyasi => dosyaDegistir(d, id, () => null);

/** Ticks a step, or a whole branch: every step under it gets the same tick. */
export function isaretle(d: PlanDosyasi, id: string, bitti: boolean): PlanDosyasi {
  const hepsi = (n: PlanDugumu): PlanDugumu =>
    n.altlar.length ? { ...n, bitti: undefined, altlar: n.altlar.map(hepsi) } : { ...n, bitti: bitti || undefined };
  return dosyaDegistir(d, id, (n) => {
    const y = hepsi(n);
    if (y.bitti === undefined) delete y.bitti;
    return y;
  });
}

/** Moves a node one place up (-1) or down (+1) among its siblings. */
export function tasi(d: PlanDosyasi, id: string, yon: -1 | 1): PlanDosyasi {
  const kaydir = (liste: PlanDugumu[]): PlanDugumu[] => {
    const i = liste.findIndex((n) => n.id === id);
    if (i >= 0) {
      const j = i + yon;
      if (j < 0 || j >= liste.length) return liste;
      const y = [...liste];
      [y[i], y[j]] = [y[j]!, y[i]!];
      return y;
    }
    return liste.map((n) => ({ ...n, altlar: kaydir(n.altlar) }));
  };
  return { ...d, planlar: kaydir(d.planlar) };
}

/** Where a node sits, for undo: its parent (null at the top) and index. */
export function konum(d: PlanDosyasi, id: string): { ustId: string | null; sira: number } | null {
  const ara = (liste: PlanDugumu[], ustId: string | null): { ustId: string | null; sira: number } | null => {
    for (let i = 0; i < liste.length; i++) {
      if (liste[i]!.id === id) return { ustId, sira: i };
      const x = ara(liste[i]!.altlar, liste[i]!.id);
      if (x) return x;
    }
    return null;
  };
  return ara(d.planlar, null);
}

/** Puts a node back where `konum` said it was (undo of a delete). */
export function geriKoy(d: PlanDosyasi, n: PlanDugumu, k: { ustId: string | null; sira: number }): PlanDosyasi {
  const ekle = (liste: PlanDugumu[]) => {
    const y = liste.filter((x) => x.id !== n.id);
    y.splice(Math.min(k.sira, y.length), 0, n);
    return y;
  };
  if (k.ustId === null) return { ...d, planlar: ekle(d.planlar) };
  return dosyaDegistir(d, k.ustId, (u) => ({ ...u, altlar: ekle(u.altlar) }));
}
