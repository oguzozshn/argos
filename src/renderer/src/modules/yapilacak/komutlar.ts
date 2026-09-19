import { ListPlus } from "lucide-react";
import type { Komut } from "@/modules";
import { kopru } from "@/veri/kanca";

export const yapilacakKomutlari: Komut[] = [
  {
    id: "yapilacak.gorev",
    ad: "Görev ekle",
    ikon: ListPlus,
    anahtarlar: ["todoist", "yapılacak"],
    onekler: ["görev", "g"],
    ornek: "fatura öde yarın 18:00 #Ev p1",
    // Hızlı yakalama penceresiyle aynı yol: Todoist'in doğal dil ayrıştırması.
    calistir: async (metin) => {
      const k = kopru();
      if (!k) throw new Error("Uygulama köprüsü yok");
      const g = await k.todoist.hizliEkle(metin);
      return `Todoist'e eklendi: ${g.icerik}${g.tarihMetni ? ` · ${g.tarihMetni}` : ""}`;
    },
  },
];
