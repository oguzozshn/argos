/**
 * Telegram botu çekirdeği testi: `node araclar/bot-testi.mts`
 *
 * Ağ yok, dosya yok: komut çözme, görünüm, kuyruk uygulama ve mesaj metni
 * uydurma haftayla sınanıyor.
 */

import {
  anlikKur,
  durumKaydiniUygula,
  kuyrukOnayi,
  alanEsle,
  gunMesaji,
  komutCoz,
  notKaydiniUygula,
  slotKaydiniUygula,
  tarihSozcugu,
  type KuyrukKaydi,
} from "../src/ortak/bot.ts";
import type { Hafta } from "../src/ortak/plan.ts";
import type { TodoistGorev } from "../src/ortak/tipler.ts";

let gecen = 0;
let kalan = 0;

function kontrol(ad: string, kosul: unknown, ek = ""): void {
  if (kosul) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}${ek ? " — " + ek : ""}`);
  }
}

const esit = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// 2026-09-19 Cumartesi. Hafta 14–20 Eylül.
const BUGUN = "2026-09-19";

const hafta = (): Hafta => ({
  hafta: 38,
  yil: 2026,
  baslik: "Hafta 38",
  gunler: [1, 2, 3, 4, 5, 6, 7].map((no) => ({
    no,
    ad: "",
    tarih: "",
    isoTarih: `2026-09-${String(13 + no).padStart(2, "0")}`,
  })),
  slotlar: [
    { id: "W38-D6-19", gun: 6, saat: "19:00", sureDk: 60, alan: "Tez", konu: "Literatür", durum: "planli" },
    { id: "W38-D6-09", gun: 6, saat: "09:00", sureDk: 90, alan: "Spor", konu: "", durum: "yapildi" },
    { id: "W38-D6-14", gun: 6, saat: "14:00", sureDk: 60, alan: "Tez", konu: "Taşınan", durum: "tasindi" },
    { id: "W38-D7-10", gun: 7, saat: "10:00", sureDk: 60, alan: "Tez", konu: "Yazım", durum: "planli" },
  ],
  kullanilmisIdler: ["W38-D6-19", "W38-D6-09", "W38-D6-14", "W38-D7-10", "W38-D6-16"],
  gunlukAliskanliklar: [
    { ad: "Okuma", gunler: { "6": true } },
    { ad: "İngilizce", beklenenGunler: [1, 3, 5] },
    { ad: "Yürüyüş", beklenenGunler: null },
  ],
});

console.log("\ntarih sözcükleri");
kontrol("bugün", tarihSozcugu("bugün", BUGUN) === BUGUN);
kontrol("yarin (şapkasız)", tarihSozcugu("yarin", BUGUN) === "2026-09-20");
kontrol("cmt bugünse bugün", tarihSozcugu("cmt", BUGUN) === BUGUN);
kontrol("pzt en yakın pazartesi", tarihSozcugu("Pzt", BUGUN) === "2026-09-21");
kontrol("Çarşamba büyük harfle", tarihSozcugu("Çarşamba", BUGUN) === "2026-09-23");
kontrol("25.09", tarihSozcugu("25.09", BUGUN) === "2026-09-25");
kontrol("geçmiş GG.AA gelecek yıla", tarihSozcugu("01.02", BUGUN) === "2027-02-01");
kontrol("olmayan gün", tarihSozcugu("31.02", BUGUN) === null);
kontrol("rastgele sözcük", tarihSozcugu("toplantı", BUGUN) === null);

console.log("\nkomutlar");
kontrol("/bugun", esit(komutCoz("/bugun", BUGUN), { tur: "gun", tarih: BUGUN }));
kontrol("/yarin@ArgosBot", esit(komutCoz("/yarin@ArgosBot", BUGUN), { tur: "gun", tarih: "2026-09-20" }));
kontrol("/gun cuma", esit(komutCoz("/gun cuma", BUGUN), { tur: "gun", tarih: "2026-09-25" }));
kontrol("düz metin Todoist'e", esit(komutCoz("süt al yarın", BUGUN), { tur: "todoist", metin: "süt al yarın" }));
kontrol("/not", esit(komutCoz("/not  faturayı sor ", BUGUN), { tur: "not", metin: "faturayı sor" }));
kontrol("/not boş hata", komutCoz("/not", BUGUN).tur === "hata");
kontrol("/start yardım", komutCoz("/start", BUGUN).tur === "yardim");
kontrol("bilinmeyen komut", komutCoz("/xyz", BUGUN).tur === "hata");

kontrol(
  "/ekle tam biçim",
  esit(komutCoz("/ekle yarın 16:00 Tez okuma 90dk #tez", BUGUN), {
    tur: "slot",
    tarih: "2026-09-20",
    saat: "16:00",
    sureDk: 90,
    alan: "tez",
    konu: "Tez okuma",
  }),
);
kontrol(
  "/ekle günsüz, süresiz",
  esit(komutCoz("/ekle 9:30 Koşu", BUGUN), {
    tur: "slot",
    tarih: BUGUN,
    saat: "09:30",
    sureDk: 60,
    alan: null,
    konu: "Koşu",
  }),
);
kontrol(
  "/ekle gün adı, alan süreden önce",
  esit(komutCoz("/ekle pzt 18:00 Sunum hazırla #İş 1.5sa", BUGUN), {
    tur: "slot",
    tarih: "2026-09-21",
    saat: "18:00",
    sureDk: 90,
    alan: "İş",
    konu: "Sunum hazırla",
  }),
);
const cumaKonu = komutCoz("/ekle 10:00 Cuma sunumu", BUGUN);
kontrol("konudaki gün adı tarihe dönmez", cumaKonu.tur === "slot" && cumaKonu.konu === "Cuma sunumu" && cumaKonu.tarih === BUGUN);
kontrol("/ekle saatten sonraki gün adı konuya kalır", (() => { const c = komutCoz("/ekle 18:00 pzt x", BUGUN); return c.tur === "slot" && c.tarih === BUGUN && c.konu === "pzt x"; })());
kontrol("/ekle saatsiz hata", komutCoz("/ekle yarın Tez", BUGUN).tur === "hata");
kontrol("/ekle konusuz hata", komutCoz("/ekle yarın 16:00 30dk", BUGUN).tur === "hata");
kontrol("/ekle 25:00 saat değil", komutCoz("/ekle 25:00 x", BUGUN).tur === "hata");

console.log("\ngörünüm");
const anlik = anlikKur(
  [{ veri: hafta() }],
  BUGUN,
  { maddeler: [{ id: "h1", metin: "Anneyi ara", eklendi: BUGUN }], gunlukAdet: 3 },
  "2026-09-19T06:00:00.000Z",
);
kontrol("yalnız dosyadaki günler (Cmt, Paz)", esit(Object.keys(anlik.gunler), ["2026-09-19", "2026-09-20"]));
const cmt = anlik.gunler["2026-09-19"]!;
kontrol("taşınan slot yok, saate göre sıralı", esit(cmt.slotlar.map((s) => s.saat), ["09:00", "19:00"]));
kontrol(
  "alışkanlık beklentisi (İngilizce Cmt'de yok)",
  esit(cmt.aliskanliklar, [
    { ad: "Okuma", yapildi: true },
    { ad: "Yürüyüş", yapildi: false },
  ]),
);
kontrol("Hatırla seçimi", esit(cmt.hatirla, ["Anneyi ara"]));

console.log("\nslot uygulama");
const k = (o: Partial<Extract<KuyrukKaydi, { tur: "slot" }>>): Extract<KuyrukKaydi, { tur: "slot" }> => ({
  id: "q1",
  tur: "slot",
  zaman: "2026-09-19T07:00:00.000Z",
  tarih: BUGUN,
  saat: "16:00",
  sureDk: 60,
  alan: null,
  konu: "Deneme",
  ...o,
});
const ALANLAR = ["Tez", "Spor", "İngilizce"];

const r1 = slotKaydiniUygula(hafta(), k({}), ALANLAR);
kontrol("eklendi", r1.tur === "eklendi");
if (r1.tur === "eklendi") {
  const yeni = r1.veri.slotlar.at(-1)!;
  kontrol("kullanılmış kimlik atlanır (W38-D6-16 → b)", yeni.id === "W38-D6-16b", yeni.id);
  kontrol("kimlik listeye yazılır", r1.veri.kullanilmisIdler!.includes("W38-D6-16b"));
  kontrol("varsayılan alan ilk alan", yeni.alan === "Tez");
  kontrol("çakışma yok, not yok", r1.not === undefined, r1.not);
  kontrol("yeniden gelen kayıt eklenmez", slotKaydiniUygula(r1.veri, k({ konu: " deneme " }), ALANLAR).tur === "zatenVar");
}

const r2 = slotKaydiniUygula(hafta(), k({ saat: "18:30", alan: "ing" }), ALANLAR);
kontrol("alan ön ekle eşlenir", r2.tur === "eklendi" && r2.veri.slotlar.at(-1)!.alan === "İngilizce");
kontrol("çakışma not olarak", r2.tur === "eklendi" && (r2.not ?? "").includes("19:00 Literatür"), r2.tur === "eklendi" ? r2.not : "");
const r3 = slotKaydiniUygula(hafta(), k({ saat: "13:30", alan: "yok" }), ALANLAR);
kontrol(
  "bilinmeyen alan varsayılana düşer, taşınan slot çakışma sayılmaz",
  r3.tur === "eklendi" && r3.veri.slotlar.at(-1)!.alan === "Tez" && r3.not === '"yok" diye bir alan yok, Tez kullanıldı',
  r3.tur === "eklendi" ? r3.not : "",
);
kontrol("haftada olmayan gün reddedilir", slotKaydiniUygula(hafta(), k({ tarih: "2026-09-21" }), ALANLAR).tur === "reddet");
kontrol("alanEsle belirsiz ön ek", alanEsle("s", ["Spor", "Sanat"]) === null);

console.log("\nnot uygulama");
const n = (metin: string): Extract<KuyrukKaydi, { tur: "not" }> => ({
  id: "q2",
  tur: "not",
  zaman: "2026-09-19T07:00:00.123Z",
  metin,
});
const d1 = notKaydiniUygula(null, n("faturayı sor"), BUGUN);
kontrol("dosya yokken eklenir", d1.tur === "eklendi" && d1.veri.maddeler.length === 1);
if (d1.tur === "eklendi") {
  kontrol("kimlik kayıt zamanından", d1.veri.maddeler[0]!.id === "h-20260919070000123", d1.veri.maddeler[0]!.id);
  kontrol("aynı metin tekrar eklenmez", notKaydiniUygula(d1.veri, n("faturayı sor"), BUGUN).tur === "zatenVar");
  const d2 = notKaydiniUygula(d1.veri, n("başka"), BUGUN);
  kontrol("aynı zamana ek harf", d2.tur === "eklendi" && d2.veri.maddeler[1]!.id === "h-20260919070000123a");
}

console.log("\ndurum işareti");
const dk = (slotId: string, durum = "yapildi"): Extract<KuyrukKaydi, { tur: "durum" }> => ({
  id: "q3", tur: "durum", zaman: "2026-09-19T08:00:00.000Z", tarih: BUGUN, slotId, durum, ad: "19:00 Literatür",
});
const du = durumKaydiniUygula(hafta(), dk("W38-D6-19"));
kontrol("slot yapıldı olur, başkasına dokunulmaz", du.tur === "eklendi" && du.veri.slotlar[0]!.durum === "yapildi" && du.veri.slotlar[1]!.durum === "yapildi");
kontrol("zaten o durumdaysa yazma yok", durumKaydiniUygula(du.tur === "eklendi" ? du.veri : hafta(), dk("W38-D6-19")).tur === "zatenVar");
kontrol("olmayan slot reddedilir", durumKaydiniUygula(hafta(), dk("yok")).tur === "reddet");
kontrol("onay metni", kuyrukOnayi(dk("W38-D6-19"), BUGUN).includes("19:00 Literatür"));

console.log("\nmesaj");
const gorev = (o: Partial<TodoistGorev>): TodoistGorev => ({
  id: "t",
  icerik: "Görev",
  aciklama: "",
  projeId: "p",
  tarih: BUGUN,
  tarihMetni: null,
  tekrarli: false,
  oncelik: 1,
  etiketler: [],
  altGorev: false,
  ...o,
});
const mesaj = gunMesaji(
  BUGUN,
  BUGUN,
  anlik,
  [gorev({ icerik: "Rapor <taslak>", tarih: "2026-09-17", oncelik: 4 }), gorev({ icerik: "Toplantı", tarih: "2026-09-19T15:00:00" })],
  [k({ saat: "12:00", konu: "Bekleyen" }), n("not bekliyor"), dk("W38-D6-19")],
);
kontrol("başlık", mesaj.startsWith("<b>☀️ Cumartesi 19 Eylül</b>"), mesaj.split("\n")[0]);
kontrol("bekleyen slot saatine göre araya girer", /09:00[\s\S]*⏳ 12:00  Bekleyen[\s\S]*19:00/.test(mesaj));
kontrol("HTML kaçışı", mesaj.includes("Rapor &lt;taslak&gt;"));
kontrol("gecikmiş işareti", mesaj.includes("(gecikmiş)"));
kontrol("görev saati", mesaj.includes("• 15:00 Toplantı"));
kontrol("bekleyen not", mesaj.includes("⏳ not bekliyor"));
kontrol("Telegram'dan işaretlenen slot ⏳ ile ☑", mesaj.includes("☑⏳ 19:00"));
kontrol("güncelleme satırı İstanbul saatiyle", mesaj.includes("Plan son güncelleme: bugün 09:00"));
const bos = gunMesaji("2026-09-22", BUGUN, anlik, { hata: "401" }, []);
kontrol("plan yoksa söylenir", bos.includes("Bu günün planı yüklenmemiş."));
kontrol("Todoist hatası söylenir", bos.includes("Görevler alınamadı: 401"));
kontrol("anlık hiç yoksa", gunMesaji(BUGUN, BUGUN, null, [], []).includes("Argos henüz plan göndermedi."));

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exit(1);
