import { Target } from "lucide-react";
import type { Modul } from "@/modules";
import { Aliskanliklar } from "./Aliskanliklar";
import { Arsiv } from "./Arsiv";
import { Hafta } from "./Hafta";
import { Hatirla } from "./Hatirla";
import { Hedefler } from "./Hedefler";
import { asistanKartlari } from "./Kartlar";
import { asistanKomutlari } from "./komutlar";
import { OdakArkaPlan } from "./OdakArkaPlan";
import { Planlar } from "./Planlar";
import { Odak } from "./Odak";
import { AsistanOzet } from "./Ozet";
import { Yetenekler } from "./Yetenekler";
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
    { yol: "aliskanliklar", ad: "Alışkanlıklar", Ekran: Aliskanliklar },
    { yol: "hatirla", ad: "Hatırla", Ekran: Hatirla },
    { yol: "arsiv", ad: "Arşiv", Ekran: Arsiv },
    { yol: "hedefler", ad: "Hedefler", Ekran: Hedefler },
    { yol: "yetenekler", ad: "Yetenekler", Ekran: Yetenekler },
    { yol: "roadmap", ad: "Yol haritaları", Ekran: YolHaritalari },
    { yol: "planlar", ad: "Planlar", Ekran: Planlar, genis: true },
  ],
  Ozet: AsistanOzet,
  ozetAd: "Bugünün planı · Aklında tut",
  kartlar: asistanKartlari,
  komutlar: asistanKomutlari,
  ArkaPlan: OdakArkaPlan,
};
