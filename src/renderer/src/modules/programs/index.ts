import { Dumbbell } from "lucide-react";
import type { Modul } from "@/modules";
import { programCommands } from "./commands";
import { Programs } from "./Programs";
import { TodayCard } from "./TodayCard";
import { WorkoutLogScreen } from "./WorkoutLogScreen";

/**
 * Programlar: plans written once (a training plan, guitar practice…) that
 * Argos lays on the days. The rules are in `@ortak/program`.
 */
export const programsModule: Modul = {
  id: "programs",
  ad: "Programlar",
  ikon: Dumbbell,
  aciklama: "Bir kez yazılan planlar",
  rotalar: [
    { yol: "", ad: "Programlar", Ekran: Programs },
    { yol: "log", ad: "Kayıt", Ekran: WorkoutLogScreen },
  ],
  genis: true,
  Ozet: TodayCard,
  ozetAd: "Programlar · bugün",
  komutlar: programCommands,
};
