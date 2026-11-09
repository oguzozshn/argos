import { NotebookPen } from "lucide-react";
import type { Modul } from "@/modules";
import { Sayfalar } from "./Sayfalar";
import { SayfalarOzet } from "./Ozet";

export const sayfalarModulu: Modul = {
  id: "sayfalar",
  ad: "Sayfalar",
  ikon: NotebookPen,
  aciklama: "Blok blok yazılan notlar",
  rotalar: [{ yol: "", ad: "Sayfalar", Ekran: Sayfalar }],
  genis: true,
  Ozet: SayfalarOzet,
  ozetAd: "Son sayfalar",
};
