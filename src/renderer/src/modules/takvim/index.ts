import { CalendarDays } from "lucide-react";
import type { Modul } from "@/modules";
import { Takvim } from "./Takvim";

/**
 * Takvim kendi modülü. Asistan'ın bir sekmesi değil çünkü sorduğu soru ayrı:
 * Asistan "bu hafta ne yapılacak" der, Takvim "hangi güne ne sığar" der.
 *
 * Plan verisini `@/veri/plan` üzerinden okur — modüller birbirini import etmez.
 */
export const takvimModulu: Modul = {
  id: "takvim",
  ad: "Takvim",
  ikon: CalendarDays,
  rotalar: [{ yol: "", ad: "Takvim", Ekran: Takvim }],
};
