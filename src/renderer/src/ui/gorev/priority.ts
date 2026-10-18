import type { Priority } from "@ortak/local-tasks";

/** Flag and checkbox colour per priority (1 = P1); P4 has none. */
export const PRIORITY_COLOR: Record<Priority, string | undefined> = {
  1: "var(--hata)",
  2: "var(--uyari)",
  3: "var(--vurgu)",
  4: undefined,
};
