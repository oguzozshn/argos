/**
 * Todoist tarih çevirisi testi: `node araclar/todoist-tarih-testi.mts`
 *
 * Todoist Türkçe tarih tanımıyor; buradaki çeviri bozulursa "her salı" yazan
 * kullanıcının görevi sessizce tarihsiz ya da yanlış güne düşer.
 */

import { hizliMetniCevir, tarihMetniTurkce, tekrarAdi, tekrarMetni, todoistTarihMetni } from "../src/ortak/todoist-tarih.ts";

let gecen = 0;
let kalan = 0;

function esit(ad: string, bulunan: unknown, beklenen: unknown): void {
  if (bulunan === beklenen) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}: ${JSON.stringify(bulunan)} ≠ ${JSON.stringify(beklenen)}`);
  }
}

const cevir = (m: string) => todoistTarihMetni(m).metin;

console.log("Türkçe → Todoist");
esit("ISO dokunulmaz", cevir("2026-09-26"), "2026-09-26");
esit("ISO + saat dokunulmaz", cevir("2026-09-26 18:00"), "2026-09-26 18:00");
esit("bugün", cevir("bugün"), "today");
esit("yarın 18:00", cevir("yarın 18:00"), "tomorrow at 18:00");
esit("Yarın saat 9", cevir("Yarın saat 9"), "tomorrow at 09:00");
esit("yalnız saat", cevir("18:30"), "today at 18:30");
esit("öbür gün", cevir("öbür gün"), "in 2 days");
esit("3 gün sonra", cevir("3 gün sonra"), "in 3 days");
esit("cuma", cevir("cuma"), "friday");
esit("salıya", cevir("salıya"), "tuesday");
// Todoist'te denendi: Cumartesi 26 Eylül'de "next monday" 5 Ekim veriyordu.
esit("Cumartesi: haftaya pazartesi iki gün sonra", todoistTarihMetni("haftaya pazartesi", "2026-09-26").metin, "sep 28 2026");
esit("Pazartesi: haftaya salı sekiz gün sonra", todoistTarihMetni("haftaya salı", "2026-09-21").metin, "sep 29 2026");
esit("Pazar: gelecek pazar yedi gün sonra", todoistTarihMetni("gelecek pazar", "2026-09-27").metin, "oct 4 2026");
esit("ay/yıl devri", todoistTarihMetni("haftaya cuma", "2026-12-30").metin, "jan 8 2027");
esit("25.09", cevir("25.09"), "sep 25");
esit("25 eylül 2027", cevir("25 eylül 2027"), "sep 25 2027");
esit("her gün", cevir("her gün"), "every day");
esit("hergün 07:00", cevir("hergün 07:00"), "every day at 07:00");
esit("hafta içi", cevir("hafta içi"), "every weekday");
esit("hafta içi her gün", cevir("hafta içi her gün"), "every weekday");
esit("hafta sonu", cevir("hafta sonu"), "every sat, sun");
esit("her salı", cevir("her salı"), "every tue");
esit("Her Salı 18:00", cevir("Her Salı 18:00"), "every tue at 18:00");
esit("her pazartesi ve perşembe", cevir("her pazartesi ve perşembe"), "every mon, thu");
esit("her pzt, çar, cum", cevir("her pzt, çar, cum"), "every mon, wed, fri");
esit("her hafta", cevir("her hafta"), "every week");
esit("her ay", cevir("her ay"), "every month");
esit("her yıl", cevir("her yıl"), "every year");
esit("her 2 hafta", cevir("her 2 hafta"), "every 2 weeks");
esit("iki haftada bir", cevir("iki haftada bir"), "every 2 weeks");
esit("3 günde bir", cevir("3 günde bir"), "every 3 days");
esit("her ayın 15'i", cevir("her ayın 15'i"), "every 15th");
esit("her ayın 1'inde", cevir("her ayın 1'inde"), "every 1st");
esit("her ayın son günü", cevir("her ayın son günü"), "every last day");
esit("İngilizce olduğu gibi geçer", cevir("every 3rd friday"), "every 3rd friday");
esit("dil hep İngilizce", todoistTarihMetni("her gün").dil, "en");
esit("saat 25 saat sayılmaz", cevir("25:00"), "25:00");

console.log("Takvimden tekrar");
esit("her gün, saatli", tekrarMetni("gun", "2026-09-26", "18:00"), "every day at 18:00 starting sep 26 2026");
esit("hafta içi", tekrarMetni("haftaIci", "2026-09-28", null), "every weekday starting sep 28 2026");
esit("haftalık o günün adıyla", tekrarMetni("hafta", "2026-09-26", null), "every saturday starting sep 26 2026");
esit("aylık sıra eki", tekrarMetni("ay", "2026-10-22", null), "every 22nd starting oct 22 2026");
esit("aylık 11-13 th", tekrarMetni("ay", "2026-10-12", null), "every 12th starting oct 12 2026");
esit("yıllık", tekrarMetni("yil", "2026-09-26", "09:00"), "every sep 26 at 09:00");
esit("ad: haftalık", tekrarAdi("hafta", "2026-09-26"), "Her cumartesi");
esit("ad: aylık", tekrarAdi("ay", "2026-09-26"), "Her ayın 26. günü");

console.log("Todoist → ekranda Türkçe");
esit("every day", tarihMetniTurkce("every day"), "her gün");
esit("saatli ve başlangıçlı", tarihMetniTurkce("every day at 18:00 starting sep 26 2026"), "her gün 18:00 · 26 Eyl'den");
esit("gün listesi", tarihMetniTurkce("every mon, thu"), "her pazartesi, perşembe");
esit("tam gün adı", tarihMetniTurkce("every saturday starting sep 26 2026"), "her cumartesi · 26 Eyl'den");
esit("aralıklı", tarihMetniTurkce("every 2 weeks"), "2 haftada bir");
esit("günde bir", tarihMetniTurkce("every 3 days"), "3 günde bir");
esit("aylık", tarihMetniTurkce("every 15th"), "her ayın 15. günü");
esit("yıllık", tarihMetniTurkce("every sep 26 at 09:00"), "her yıl 26 Eyl 09:00");
esit("hafta içi", tarihMetniTurkce("every weekday"), "hafta içi her gün");
esit("tanınmayan dokunulmaz", tarihMetniTurkce("every 3rd friday"), "every 3rd friday");
esit("eski Türkçe metin dokunulmaz", tarihMetniTurkce("her pazartesi"), "her pazartesi");
esit("null", tarihMetniTurkce(null), null);

esit("gün adı", tarihMetniTurkce("friday"), "cuma");
esit("haftaya", tarihMetniTurkce("next monday"), "haftaya pazartesi");
esit("n gün sonra", tarihMetniTurkce("in 2 days"), "2 gün sonra");
esit("ay günü", tarihMetniTurkce("sep 25"), "25 Eyl");
esit("yarın saatli", tarihMetniTurkce("tomorrow at 18:00"), "yarın 18:00");

console.log("Hızlı ekleme satırı");
const hizli = (m: string) => hizliMetniCevir(m).metin;
esit("sondaki tarih", hizli("fatura öde yarın 18:00"), "fatura öde tomorrow at 18:00");
esit("işaretler yerinde kalır", hizli("fatura öde yarın 18:00 #Ev @iş p1"), "fatura öde tomorrow at 18:00 #Ev @iş p1");
esit("tekrar", hizli("İngilizce çalış her gün 07:00 #Gelişim"), "İngilizce çalış every day at 07:00 #Gelişim");
esit("baştaki tarih", hizli("her salı ve perşembe spor"), "every tue, thu spor");
esit("aylık", hizli("kira öde her ayın 15'i"), "kira öde every 15th");
esit("en sağdaki seçilir", hizli("pazar alışverişi yarın"), "pazar alışverişi tomorrow");
esit("tarih yoksa dokunulmaz", hizli("süt al #Ev"), "süt al #Ev");
esit("İngilizce dokunulmaz", hizli("call mom every friday"), "call mom every friday");
esit("kısa kısaltma tek başına tarih değil", hizli("wash car"), "wash car");
esit("görev adı tarihin kendisiyse dokunulmaz", hizli("Pazar"), "Pazar");
esit("yalnız işaretle görev adı sayılmaz", hizli("yarın #Ev"), "yarın #Ev");
esit("yakalanan parça söylenir", hizliMetniCevir("rapor gönder cuma 17:00 p2").tarih, "cuma 17:00");

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
