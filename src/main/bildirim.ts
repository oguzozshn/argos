import { Notification } from "electron";
import { anaPencereyiGoster } from "./tepsi";

/**
 * Windows bildirimi. Tek kullanıcısı odak sayacı: süre dolduğunda pencere
 * tepsideyken ya da başka uygulamadayken de haber verir.
 *
 * Bildirim desteklenmiyorsa sessizce vazgeçilir — sayaç yine çalışır.
 */
export function bildirimGoster(baslik: string, govde: string): void {
  if (!Notification.isSupported()) return;
  try {
    const b = new Notification({ title: baslik, body: govde });
    // Bildirime tıklayınca uygulama öne gelir: "ne olmuştu" sorusu bir tık uzakta.
    b.on("click", () => anaPencereyiGoster());
    b.show();
  } catch (e) {
    console.error("[bildirim]", e);
  }
}
