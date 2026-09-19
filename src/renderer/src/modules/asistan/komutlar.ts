import { CalendarPlus, Lightbulb, Pause, Play } from "lucide-react";
import {
  gunuBul,
  komutCoz,
  notKaydiniUygula,
  slotKaydiniUygula,
  tarihBasligi,
  type HatirlaDosyasi,
} from "@ortak/bot";
import type { Kurallar } from "@ortak/ozet";
import { bugunIso, type Hafta } from "@ortak/plan";
import type { Komut } from "@/modules";
import { dosyayiGuncelle } from "@/veri/guncelle";
import { kopru } from "@/veri/kanca";
import { odakBaslat, odakDuraklat, useOdak } from "./odak-store";

/**
 * Asistan'ın palet komutları. Sözdizimi ve kurallar Telegram botuyla ortak
 * (`@ortak/bot`): "slot yarın 16:00 Tez okuma 90dk #Tez" ile botta
 * "/ekle yarın 16:00 …" aynı slotu aynı kimlikle üretir.
 */

async function haftalar(): Promise<{ kod: string; veri: Hafta }[]> {
  const k = kopru();
  if (!k) throw new Error("Uygulama köprüsü yok");
  const dosyalar = (await k.veri.listele(".")).filter((d) => /^W\d{1,2}\.json$/.test(d));
  const okunan = await Promise.all(
    dosyalar.map(async (d) => ({ kod: d.slice(0, -5), veri: (await k.veri.oku<Hafta>(d)).veri })),
  );
  return okunan.filter((x): x is { kod: string; veri: Hafta } => x.veri !== null);
}

const odakCalisiyor = () => useOdak.getState().d.calisiyor;

export const asistanKomutlari: Komut[] = [
  {
    id: "asistan.slot",
    ad: "Plana slot ekle",
    ikon: CalendarPlus,
    anahtarlar: ["hafta", "plan"],
    onekler: ["slot", "plan"],
    ornek: "yarın 16:00 Tez okuma 90dk #Tez",
    calistir: async (arguman) => {
      const bugun = bugunIso();
      const c = komutCoz(`/ekle ${arguman}`, bugun);
      if (c.tur === "hata") throw new Error(c.mesaj.replace("/ekle", "slot"));
      if (c.tur !== "slot") throw new Error("Slot anlaşılmadı");

      const hedef = gunuBul(await haftalar(), c.tarih);
      if (!hedef) throw new Error(`${tarihBasligi(c.tarih)} için hafta dosyası yok — önce haftayı kur`);
      const kurallar = (await kopru()?.veri.oku<Kurallar>("kurallar.json"))?.veri ?? null;
      const { tarih, saat, sureDk, alan, konu } = c;
      const kayit = { id: "palet", tur: "slot" as const, zaman: new Date().toISOString(), tarih, saat, sureDk, alan, konu };

      const u = await dosyayiGuncelle<Hafta>(`${hedef.kod}.json`, (v) =>
        v ? slotKaydiniUygula(v, kayit, kurallar?.alanlar) : { tur: "reddet", sebep: `${hedef.kod}.json okunamadı` },
      );
      if (u.tur === "reddet") throw new Error(u.sebep);
      if (u.tur === "zatenVar") return `Zaten planda: ${c.saat} ${c.konu}`;
      return `Plana eklendi: ${tarihBasligi(c.tarih)} ${c.saat} ${c.konu}${u.not ? ` — ${u.not}` : ""}`;
    },
  },
  {
    id: "asistan.not",
    ad: "Hatırla'ya not ekle",
    ikon: Lightbulb,
    anahtarlar: ["hatırla"],
    onekler: ["not", "hatırla"],
    ornek: "IELTS sınav tarihini al",
    calistir: async (metin) => {
      const u = await dosyayiGuncelle<HatirlaDosyasi>("hatirla.json", (d) =>
        notKaydiniUygula(d, { id: "palet", tur: "not", zaman: new Date().toISOString(), metin }, bugunIso()),
      );
      if (u.tur === "reddet") throw new Error(u.sebep);
      return u.tur === "zatenVar" ? "Bu not zaten Hatırla'da" : `Hatırla'ya eklendi: ${metin}`;
    },
  },
  {
    id: "asistan.odak-baslat",
    ad: "Odak sayacını başlat",
    ikon: Play,
    anahtarlar: ["odak", "pomodoro", "sayaç"],
    uygun: () => !odakCalisiyor(),
    // Odak ekranındaki "Başlat" ile aynı geçiş; seans kaydı o ekranda.
    calistir: () => {
      odakBaslat();
      return "Odak sayacı başladı";
    },
  },
  {
    id: "asistan.odak-duraklat",
    ad: "Odak sayacını duraklat",
    ikon: Pause,
    anahtarlar: ["odak", "pomodoro", "sayaç", "dur"],
    uygun: odakCalisiyor,
    calistir: () => {
      odakDuraklat();
      return "Odak sayacı duraklatıldı";
    },
  },
];
