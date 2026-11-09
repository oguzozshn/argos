import { useCallback, useMemo } from "react";
import {
  PAGES_PATH,
  addPage,
  deletePage,
  emptyDoc,
  emptyPages,
  movePage,
  newPageId,
  normalizeDoc,
  normalizePages,
  pageDocPath,
  pageOutline,
  updatePage,
  type PageDoc,
  type PageMeta,
  type PagesFile,
} from "@ortak/sayfalar";
import { kopru, useDosya } from "@/veri/kanca";

/** Açık sayfa bu bilgisayarda hatırlanır — Bugün kartı da buraya yazıp ekrana gönderiyor. */
const SECIM_ANAHTARI = "argos.sayfalar.acik";

export function secimiOku(): string | null {
  try {
    return localStorage.getItem(SECIM_ANAHTARI);
  } catch {
    return null;
  }
}

export function secimiYaz(id: string): void {
  try {
    localStorage.setItem(SECIM_ANAHTARI, id);
  } catch {
    // Hatırlamak kolaylık; olmazsa ağacın ilk sayfası açılır.
  }
}

/**
 * Sayfa ağacı ve açık sayfanın gövdesi, iki ayrı dosyadan. Ağaç her an
 * ekranda, gövde yalnızca açık sayfanınki: gövdeyi ayrı dosyada tutmanın
 * sebebi de bu (bkz. ortak/sayfalar.ts).
 */

export interface SayfaAgaci {
  dosya: PagesFile;
  yukleniyor: boolean;
  hata: string | null;
  /** Kenar çubuğunun çizdiği düz liste: derinlikli, katlanmışların altı atlanmış. */
  anahat: ReturnType<typeof pageOutline>;
  bul: (id: string | null) => PageMeta | null;
  ekle: (parentId?: string | null) => Promise<string | null>;
  guncelle: (id: string, patch: Partial<Omit<PageMeta, "id">>) => Promise<boolean>;
  tasi: (id: string, parentId: string | null) => Promise<boolean>;
  sil: (id: string) => Promise<string[]>;
}

export function useSayfaAgaci(): SayfaAgaci {
  const dosya = useDosya<PagesFile>(PAGES_PATH);
  const veri = useMemo(() => (dosya.veri ? normalizePages(dosya.veri) : emptyPages()), [dosya.veri]);
  const { degistir } = dosya;

  const ekle = useCallback(
    async (parentId: string | null = null) => {
      const id = newPageId();
      const ok = await degistir((m) => addPage(normalizePages(m), { parentId }, id, new Date().toISOString()));
      return ok ? id : null;
    },
    [degistir],
  );

  const guncelle = useCallback(
    (id: string, patch: Partial<Omit<PageMeta, "id">>) =>
      degistir((m) => updatePage(normalizePages(m), id, patch, new Date().toISOString())),
    [degistir],
  );

  const tasi = useCallback(
    (id: string, parentId: string | null) =>
      degistir((m) => movePage(normalizePages(m), id, parentId, new Date().toISOString())),
    [degistir],
  );

  /**
   * Silme ağaçtan çıkarır, sonra gövde dosyalarını siler. Sıra böyle: gövde
   * önce silinseydi ve ağaç yazması çakışmaya takılsaydı, ağaçta duran bir
   * sayfanın gövdesi yok olurdu.
   */
  const sil = useCallback(
    async (id: string) => {
      let removed: string[] = [];
      const ok = await degistir((m) => {
        const r = deletePage(normalizePages(m), id);
        removed = r.removed;
        return r.file;
      });
      if (!ok) return [];
      const k = kopru();
      if (k) for (const x of removed) await k.veri.sil(pageDocPath(x)).catch(() => undefined);
      return removed;
    },
    [degistir],
  );

  return {
    dosya: veri,
    yukleniyor: dosya.yukleniyor,
    hata: dosya.hata,
    anahat: useMemo(() => pageOutline(veri), [veri]),
    bul: useCallback((id: string | null) => veri.pages.find((p) => p.id === id) ?? null, [veri]),
    ekle,
    guncelle,
    tasi,
    sil,
  };
}

export interface SayfaGovdesi {
  doc: PageDoc;
  yukleniyor: boolean;
  hata: string | null;
  /** Son bilinen hâl üstünden değiştirir; dosyaya yazar. */
  degistir: (f: (d: PageDoc) => PageDoc) => Promise<boolean>;
}

export function useSayfaGovdesi(id: string | null): SayfaGovdesi {
  // Sayfa seçili değilken de kanca kurulmalı (kancalar koşullu çağrılamaz);
  // okunmayacak bir yol veriliyor ve dosya yokluğu hata sayılmıyor.
  const yol = id ? pageDocPath(id) : "pages/.yok.json";
  const dosya = useDosya<PageDoc>(yol);
  const doc = useMemo(() => (id ? normalizeDoc(dosya.veri, id) : emptyDoc("")), [dosya.veri, id]);
  const { degistir: dosyayaYaz } = dosya;

  const degistir = useCallback(
    (f: (d: PageDoc) => PageDoc) => {
      if (!id) return Promise.resolve(false);
      return dosyayaYaz((m) => f(normalizeDoc(m, id)));
    },
    [dosyayaYaz, id],
  );

  return { doc, yukleniyor: id ? dosya.yukleniyor : false, hata: id ? dosya.hata : null, degistir };
}
