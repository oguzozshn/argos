import type { Transition, Variants } from "motion/react";

/**
 * Üç hareket kuralı, fazlası yok. Süreler token'lardan değil buradan gelir
 * çünkü motion sayı ister; değerler token.css ile aynı tutulur.
 *
 * Hareket azaltma tercihi MotionConfig ile kökte kapatılıyor (Kabuk.tsx).
 */

export const gecisEgrisi: Transition = {
  duration: 0.18,
  ease: [0.22, 0.61, 0.36, 1],
};

/** 1 — ekran geçişi: yumuşak solma + 8px yükselme. */
export const ekranGecisi: Variants = {
  giris: { opacity: 0, y: 8 },
  duruyor: { opacity: 1, y: 0, transition: gecisEgrisi },
  cikis: { opacity: 0, y: -4, transition: { ...gecisEgrisi, duration: 0.12 } },
};

/** 3 — liste maddesi eklenip çıkarken. */
export const maddeGecisi: Variants = {
  giris: { opacity: 0, y: -6 },
  duruyor: { opacity: 1, y: 0, transition: gecisEgrisi },
  cikis: { opacity: 0, height: 0, transition: { ...gecisEgrisi, duration: 0.15 } },
};

/** Kenar çubuğu göstergesinin kayması için ortak yay. */
export const kayanGosterge: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.7,
};
