import { useEffect, useRef } from "react";
import { create } from "zustand";

/**
 * Tek tuşluk kısayollar. Hepsi burada toplanır: kabuk genel olanları
 * (1–5 modüller, 0 Bugün, ? yardım), ekranlar kendi olanlarını
 * (←/→ dönem, T bugün, N yeni, Esc panel) `useKisayol` ile kaydeder.
 *
 * Aynı tuşu iki yer kaydederse son kaydeden kazanır ve o çıkınca öncekine
 * döner: açılan yan panelin Esc'i ekranın Esc'inden önce gelir.
 *
 * Yazarken hiçbiri çalışmaz (girdi, metin alanı, seçim kutusu), değiştirici
 * tuşla (Ctrl, Alt) basılınca da: onlar tarayıcının ve paletin.
 */

export interface KisayolKaydi {
  /** `KeyboardEvent.key`; harfler küçük yazılır ("t", "ArrowLeft", "Escape"). */
  tus: string;
  aciklama: string;
  /** Yardımda gruplamak için: "Genel" ya da ekranın adı. */
  grup: string;
  calistir: () => void;
  no: number;
}

interface Depo {
  kayitlar: KisayolKaydi[];
  ekle: (k: KisayolKaydi) => void;
  cikar: (no: number) => void;
}

export const useKisayolDeposu = create<Depo>()((set) => ({
  kayitlar: [],
  ekle: (k) => set((s) => ({ kayitlar: [...s.kayitlar, k] })),
  cikar: (no) => set((s) => ({ kayitlar: s.kayitlar.filter((k) => k.no !== no) })),
}));

let sayac = 0;

/**
 * Bir kısayol kaydeder; bileşen ayrılınca kalkar. `eylem` null ise kayıt
 * yapılmaz (ör. ilk haftada "önceki" yok) — yardımda da görünmez.
 * Eylem her çizimde güncel tutulur, kayıt yenilenmez.
 */
export function useKisayol(tus: string, aciklama: string, grup: string, eylem: (() => void) | null | undefined): void {
  const son = useRef(eylem);
  son.current = eylem;
  const var_ = Boolean(eylem);
  useEffect(() => {
    if (!var_) return;
    const no = ++sayac;
    useKisayolDeposu.getState().ekle({ tus, aciklama, grup, no, calistir: () => son.current?.() });
    return () => useKisayolDeposu.getState().cikar(no);
  }, [tus, aciklama, grup, var_]);
}

const yaziyor = (h: EventTarget | null): boolean =>
  h instanceof HTMLElement && Boolean(h.closest("input, textarea, select, [contenteditable='true']"));

/** Tuşu kayıtla eşleştirilecek biçime getirir: tek harfler küçük. */
export const tusAdi = (key: string): string => (key.length === 1 ? key.toLocaleLowerCase("tr") : key);

/** Kabukta bir kez kurulur. Açık bir diyalog (palet) varken kısayollar susar. */
export function useKisayolDinleyicisi(susturulmus: boolean): void {
  const sus = useRef(susturulmus);
  sus.current = susturulmus;
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (sus.current || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      if (yaziyor(e.target)) return;
      const tus = tusAdi(e.key);
      const kayit = useKisayolDeposu
        .getState()
        .kayitlar.findLast((k) => k.tus === tus);
      if (!kayit) return;
      e.preventDefault();
      kayit.calistir();
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, []);
}

/** Yardımda gösterilen tuş adı. */
export const tusMetni = (tus: string): string =>
  ({ ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Escape: "Esc" })[tus] ??
  (tus.length === 1 ? tus.toLocaleUpperCase("tr") : tus);
