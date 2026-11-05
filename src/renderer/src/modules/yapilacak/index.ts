import { ListChecks } from "lucide-react";
import type { Modul } from "@/modules";
import { Yapilacak } from "./Yapilacak";
import { gorevListesiKarti } from "./ListeKarti";
import { YapilacakOzet } from "./Ozet";
import { OnemliTarihler } from "./OnemliTarihler";
import { ReminderBackground } from "./ReminderBackground";
import { yapilacakKomutlari } from "./komutlar";

export const yapilacakModulu: Modul = {
  id: "yapilacak",
  ad: "Yapılacaklar",
  ikon: ListChecks,
  rotalar: [{ yol: "", ad: "Görevler", Ekran: Yapilacak }],
  genis: true,
  Ozet: YapilacakOzet,
  ozetAd: "Bugün yapılacaklar",
  Ust: OnemliTarihler,
  ustAd: "Önemli tarihler",
  // Tall enough for about five rows at once; the rest are scrolled to (issue #85).
  ustH: 9,
  kartlar: [gorevListesiKarti],
  komutlar: yapilacakKomutlari,
  ArkaPlan: ReminderBackground,
};
