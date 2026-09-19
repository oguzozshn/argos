import { Target } from "lucide-react";
import type { Modul } from "@/modules";
import { Arsiv } from "./Arsiv";
import { Hafta } from "./Hafta";
import { Hatirla } from "./Hatirla";
import { asistanKomutlari } from "./komutlar";
import { Odak } from "./Odak";
import { AsistanOzet } from "./Ozet";
import { YolHaritalari } from "./YolHaritalari";

/**
 * Asistan modülü. Faz 5 adım adım ilerliyor.
 *
 * Açık olanlar: Hafta, Odak, Hatırla (yazma); Arşiv ve Yol haritaları (okuma).
 * Takvim ayrı bir modül — sorduğu soru farklı.
 * Özetler `@ortak/ozet`'ten türüyor ve app.py ile parite testinden geçiyor.
 *
 * Sırada: yol haritası düzenleme, hafta kurma, Todoist eşitlemesi.
 */
export const asistanModulu: Modul = {
  id: "asistan",
  ad: "Asistan",
  ikon: Target,
  rotalar: [
    { yol: "", ad: "Hafta", Ekran: Hafta },
    { yol: "odak", ad: "Odak", Ekran: Odak },
    { yol: "hatirla", ad: "Hatırla", Ekran: Hatirla },
    { yol: "arsiv", ad: "Arşiv", Ekran: Arsiv },
    { yol: "roadmap", ad: "Yol haritaları", Ekran: YolHaritalari },
  ],
  Ozet: AsistanOzet,
  komutlar: asistanKomutlari,
};
