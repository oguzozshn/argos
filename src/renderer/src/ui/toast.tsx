import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, RotateCcw, X } from "lucide-react";
import { create } from "zustand";
import { gecisEgrisi } from "./hareket";
import s from "./toast.module.css";

/**
 * Silmeden sonra alttan çıkan kısa bildirim ve "Geri al".
 *
 * `confirm()` yerine: silme hemen olur, pişmanlık birkaç saniye içinde tek
 * tıkla (ya da Ctrl+Z) giderilir. Onay kutusu her seferinde soruyor ve bir
 * süre sonra okunmadan geçiliyor; geri al ise yalnızca gerektiğinde çalışıyor.
 *
 * Durum modül düzeyinde: bildirim ekran değişince kaybolmasın, geri alma
 * silmenin yapıldığı ekrandan ayrılınca da çalışsın.
 */

export interface Bildirim {
  metin: string;
  /**
   * Geri alma. `false` dönerse ya da hata fırlatırsa "geri alınamadı"
   * gösterilir. Silmenin kendisi henüz sürüyor olabilir — geri alma önce onu
   * beklemeli (bkz. `silVeBildir`).
   */
  geriAl?: () => Promise<boolean | void> | boolean | void;
  tur?: "bilgi" | "hata";
  /** Ekranda kalma süresi (ms). İmleç üstündeyken sayılmaz. */
  sure?: number;
  /**
   * Called once when this toast leaves the screen for any reason: timed out,
   * dismissed, undone, or replaced by a newer toast. After that, undo is no
   * longer possible — deferred actions commit here (see `deferWithUndo`).
   */
  onClose?: () => void;
}

interface Etkin extends Bildirim {
  no: number;
}

interface ToastDeposu {
  etkin: Etkin | null;
  goster: (b: Bildirim) => number;
  kapat: (no?: number) => void;
}

let sayac = 0;

const useToast = create<ToastDeposu>()((set, get) => ({
  etkin: null,
  // Tek bildirim: yenisi eskisinin yerine geçer. Eskisinin silmesi zaten
  // yapılmış durumda; yalnızca geri alma fırsatı kapanır (Gmail gibi).
  goster: (b) => {
    const no = ++sayac;
    const onceki = get().etkin;
    set({ etkin: { ...b, no } });
    onceki?.onClose?.();
    return no;
  },
  kapat: (no) => {
    const e = get().etkin;
    if (e && (no === undefined || e.no === no)) {
      set({ etkin: null });
      e.onClose?.();
    }
  },
}));

/** Bildirim göster. React dışından da çağrılabilir. Bildirimin numarasını döner. */
export const bildir = (b: Bildirim): number => useToast.getState().goster(b);

/**
 * Silme + geri al kalıbı. Silme hemen başlar, bildirim hemen çıkar; geri
 * alma silmenin bitmesini bekler, sonra geri koyar. Silme başarısızsa geri
 * alınacak bir şey yoktur, bildirim hatayı söyler.
 */
export function silVeBildir(b: {
  metin: string;
  sil: () => Promise<boolean | void> | boolean | void;
  geriKoy: () => Promise<boolean | void> | boolean | void;
  /** Silme düşerse gösterilen metin. Silme olmayan işlerde (görev tamamlama) değişir. */
  hataMetni?: string;
}): void {
  const silme = Promise.resolve()
    .then(b.sil)
    .then(
      (r) => r !== false,
      () => false,
    );
  const no = bildir({
    metin: b.metin,
    geriAl: async () => {
      if (!(await silme)) return false;
      return b.geriKoy();
    },
  });
  void silme.then((ok) => {
    // Silme geç düştüyse ve o arada yeni bir bildirim geldiyse onu ezmeyelim:
    // yenisinin geri alma fırsatı kaybolurdu. Hata ekrandaki şeritte de görünüyor.
    if (!ok && useToast.getState().etkin?.no === no) {
      bildir({ metin: b.hataMetni ?? "Silinemedi.", tur: "hata" });
    }
  });
}

/**
 * Undo for actions that cannot be reversed once done (deleting a Todoist task
 * has no restore). The screen changes at once via `apply`; the real action
 * runs only when the toast closes without an undo. If the app quits first,
 * nothing is committed — the task simply stays, which is the safe side.
 */
export function deferWithUndo(b: {
  metin: string;
  /** Immediate, visible part (remove the row). */
  apply: () => void;
  /** The irreversible part; runs when undo is no longer offered. */
  commit: () => Promise<boolean | void> | boolean | void;
  /** Puts the screen back; called on undo and when `commit` fails. */
  revert: () => void;
  hataMetni?: string;
}): void {
  let undone = false;
  b.apply();
  bildir({
    metin: b.metin,
    geriAl: () => {
      undone = true;
      b.revert();
      return true;
    },
    onClose: () => {
      if (undone) return;
      void Promise.resolve()
        .then(b.commit)
        .then(
          (r) => r !== false,
          () => false,
        )
        .then((ok) => {
          if (ok) return;
          b.revert();
          bildir({ metin: b.hataMetni ?? "İşlem yapılamadı.", tur: "hata" });
        });
    },
  });
}

const VARSAYILAN_SURE = 8000;

/** Kabukta bir kez yerleşir. */
export function ToastAlani() {
  const etkin = useToast((d) => d.etkin);
  const kapat = useToast((d) => d.kapat);
  const [calisiyor, setCalisiyor] = useState(false);
  const [uzerinde, setUzerinde] = useState(false);
  const geriAlRef = useRef<() => void>(() => undefined);
  // State değil ref: iki tetik aynı çizimde gelirse (hızlı çift tık, Ctrl+Z)
  // ikincisi de "çalışmıyor" görür ve geri koyma iki kez koşardı.
  const kilit = useRef(false);

  const geriAl = async () => {
    if (!etkin?.geriAl || kilit.current) return;
    kilit.current = true;
    const no = etkin.no;
    setCalisiyor(true);
    let ok = false;
    try {
      ok = (await etkin.geriAl()) !== false;
    } catch {
      ok = false;
    } finally {
      kilit.current = false;
      setCalisiyor(false);
    }
    // Bu arada yeni bir bildirim geldiyse onu ezmeyelim.
    if (useToast.getState().etkin?.no !== no) return;
    if (ok) kapat(no);
    else bildir({ metin: "Geri alınamadı.", tur: "hata" });
  };
  geriAlRef.current = () => void geriAl();

  // A toast that closes under the cursor (its "Geri al" was clicked) never
  // fires mouseleave; without this reset the next toast would never time out.
  useEffect(() => setUzerinde(false), [etkin?.no]);

  // Süre dolunca kapanır; imleç üstündeyken ya da geri alma sürerken beklenir.
  useEffect(() => {
    if (!etkin || uzerinde || calisiyor) return;
    const t = window.setTimeout(() => kapat(etkin.no), etkin.sure ?? VARSAYILAN_SURE);
    return () => window.clearTimeout(t);
  }, [etkin, uzerinde, calisiyor, kapat]);

  // Ctrl+Z: bir metin alanında değilken son silmeyi geri alır. Metin
  // alanında tarayıcının kendi geri alması çalışmaya devam etsin.
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.repeat || e.key.toLowerCase() !== "z") return;
      const hedef = e.target as HTMLElement | null;
      if (hedef?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!useToast.getState().etkin?.geriAl) return;
      e.preventDefault();
      geriAlRef.current();
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, []);

  return (
    <div className={s.alan} aria-live="polite">
      <AnimatePresence>
        {etkin && (
          <motion.div
            key={etkin.no}
            // Hata kesinti ister; bilgi kullanıcıyı bölmeden okunur.
            role={etkin.tur === "hata" ? "alert" : "status"}
            className={etkin.tur === "hata" ? `${s.toast} ${s.hata}` : s.toast}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: gecisEgrisi }}
            exit={{ opacity: 0, y: 8, transition: { ...gecisEgrisi, duration: 0.12 } }}
            onMouseEnter={() => setUzerinde(true)}
            onMouseLeave={() => setUzerinde(false)}
          >
            {etkin.tur === "hata" ? <AlertTriangle size={15} /> : <Check size={15} />}
            <span className={s.metin}>{etkin.metin}</span>
            {etkin.geriAl && (
              <button
                type="button"
                className={s.geriAl}
                onClick={() => void geriAl()}
                disabled={calisiyor}
                title="Geri al (Ctrl+Z)"
              >
                <RotateCcw size={14} />
                Geri al
              </button>
            )}
            <button type="button" className={s.kapat} onClick={() => kapat(etkin.no)} aria-label="Kapat">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
