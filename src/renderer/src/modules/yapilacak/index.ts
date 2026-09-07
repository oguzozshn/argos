import { ListChecks } from "lucide-react";
import type { Modul } from "@/modules";
import { Yapilacak } from "./Yapilacak";
import { YapilacakOzet } from "./Ozet";

export const yapilacakModulu: Modul = {
  id: "yapilacak",
  ad: "Yapılacaklar",
  ikon: ListChecks,
  rotalar: [{ yol: "", ad: "Görevler", Ekran: Yapilacak }],
  Ozet: YapilacakOzet,
};
