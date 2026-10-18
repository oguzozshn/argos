import { Gamepad2 } from "lucide-react";
import type { Modul } from "@/modules";
import { Hobiler } from "./Hobiler";
import { HobilerOzet } from "./Ozet";

export const hobilerModulu: Modul = {
  id: "hobiler",
  ad: "Hobiler",
  ikon: Gamepad2,
  rotalar: [{ yol: "", ad: "Listeler", Ekran: Hobiler }],
  Ozet: HobilerOzet,
  ozetAd: "Şu an (Hobiler)",
};
