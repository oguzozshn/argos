import { ClipboardList } from "lucide-react";
import type { Komut } from "@/modules";

/** Palette commands. Going to the screens themselves is made by the shell. */
export const programCommands: Komut[] = [
  {
    id: "programs.log",
    ad: "Bugünün antrenman kaydı",
    ikon: ClipboardList,
    anahtarlar: ["antrenman", "spor", "program", "kayıt", "egzersiz"],
    calistir: (_arguman, o) => o.git("/programs/log"),
  },
];
