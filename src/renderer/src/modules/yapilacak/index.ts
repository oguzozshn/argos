import { ListChecks } from "lucide-react";
import type { Modul } from "@/modules";
import { Yapilacak } from "./Yapilacak";
import { YapilacakOzet } from "./Ozet";
import { yapilacakKomutlari } from "./komutlar";

export const yapilacakModulu: Modul = {
  id: "yapilacak",
  ad: "Yapılacaklar",
  ikon: ListChecks,
  rotalar: [{ yol: "", ad: "Görevler", Ekran: Yapilacak }],
  Ozet: YapilacakOzet,
  komutlar: yapilacakKomutlari,
};
