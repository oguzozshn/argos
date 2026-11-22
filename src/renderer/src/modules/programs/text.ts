import { AY_ADLARI, GUN_KISA, gunEkle, haftaninGunu } from "@ortak/gun";
import type { DayView, Program } from "@ortak/program";

/** "2026-11-23" → "23 Kas Pzt". */
export const dayText = (iso: string): string =>
  `${Number(iso.slice(8, 10))} ${AY_ADLARI[Number(iso.slice(5, 7)) - 1]} ${GUN_KISA[haftaninGunu(iso)]}`;

/** "Pzt · Çar · Cum". */
export const daysText = (p: Program): string => p.days.map((d) => GUN_KISA[d]).join(" · ");

/** The Monday on or after a date: a new program starts on a week's first day. */
export const nextMonday = (iso: string): string => gunEkle(iso, (7 - haftaninGunu(iso)) % 7);

/** "3 × 12–15", "12–15", "3 set" or "". */
export const setsText = (sets?: number, reps?: string): string =>
  sets && reps ? `${sets} × ${reps}` : reps ? reps : sets ? `${sets} set` : "";

/** One line for what a day holds, for lists and cards. */
export function dayLine(v: DayView): string {
  switch (v.kind) {
    case "workout":
      return `${v.session.name}${v.session.minutes ? ` · ~${v.session.minutes} dk` : ""}`;
    case "logged":
      return v.log.status === "skipped" ? `${v.log.sessionName ?? "Antrenman"} atlandı` : `${v.log.sessionName ?? "Antrenman"} yapıldı`;
    case "rest":
      return v.restDay ? `Dinlenme · ${v.restDay.name} (isteğe bağlı)` : "Dinlenme";
    case "notStarted":
      return `${dayText(v.start)} başlıyor`;
    case "ended":
      return "Program bitti";
  }
}
