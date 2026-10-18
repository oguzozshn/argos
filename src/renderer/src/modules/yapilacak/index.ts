import { ListChecks } from "lucide-react";
import type { Modul } from "@/modules";
import { Yapilacak } from "./Yapilacak";
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
  komutlar: yapilacakKomutlari,
  ArkaPlan: ReminderBackground,
};
