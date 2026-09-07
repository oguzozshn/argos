/**
 * `gunBosalt` testi: `node araclar/bosalt-testi.mts`
 *
 * Sosyal plan geldiğinde günün boşaltılması bir YAZMA işlemi ve kaybı olan
 * bir işlem: sığmayan slot düşüyor. Kuralı K11 söylüyor — slot taşınır,
 * sıkıştırılmaz. Buradaki testler o kuralın uygulandığını doğruluyor.
 */

import { gunBosalt, gunTipi } from "../src/ortak/plan-islem.ts";
import type { KuralSeti } from "../src/ortak/kural.ts";
import type { Hafta, Slot } from "../src/ortak/plan.ts";

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

const KURALLAR: KuralSeti = {
  kapasite: {
    ofisGunuMaxSlot: 2,
    evGunuMaxSlot: 3,
    haftaSonuMaxSlot: 3,
    haftalikHedefDk: 720,
    haftalikUstSinirDk: 840,
  },
  korumaliAlanlar: [{ gunler: [6, 7], saattenSonra: "16:00" }],
};

const GUNLER = [
  { no: 1, ad: "Pazartesi", tarih: "28 Eyl", isoTarih: "2026-09-28" },
  { no: 2, ad: "Salı", tarih: "29 Eyl", isoTarih: "2026-09-29" },
  { no: 6, ad: "Cumartesi", tarih: "3 Eki", isoTarih: "2026-10-03" },
  { no: 7, ad: "Pazar", tarih: "4 Eki", isoTarih: "2026-10-04" },
];

const slot = (o: Partial<Slot> & { id: string }): Slot => ({
  gun: 1,
  saat: "19:00",
  sureDk: 60,
  alan: "AI",
  konu: "konu",
  durum: "planli",
  ...o,
});

const hafta = (slotlar: Slot[], ofisGunleri: number[] = []): Hafta => ({
  hafta: 40,
  yil: 2026,
  baslik: "Hafta 40",
  ofisGunleri,
  gunler: GUNLER,
  slotlar,
  kullanilmisIdler: slotlar.map((s) => s.id),
});

const AN = new Date(2026, 8, 30);

console.log("Gün tipi");
kontrol("hafta sonu", gunTipi(6, [1]) === "haftaSonu");
kontrol("ofis günü", gunTipi(1, [1, 3]) === "ofis");
kontrol("ev günü", gunTipi(2, [1, 3]) === "ev");

console.log("\nTaşıma");
{
  const v = hafta([slot({ id: "A", gun: 1, saat: "10:00" })]);
  const { hafta: y, rapor } = gunBosalt(v, KURALLAR, 1, null, AN);
  kontrol("slot hafta sonuna taşınır", rapor.tasinan === 1 && rapor.dusen === 0);
  kontrol("kaynak slot taşındı olur", y.slotlar.find((x) => x.id === "A")?.durum === "tasindi");
  kontrol(
    "nereye taşındığı yazılır",
    Boolean((y.slotlar.find((x) => x.id === "A") as { tasindigiYer?: string })?.tasindigiYer),
  );
  const yeni = y.slotlar.find((x) => x.id !== "A");
  kontrol("yeni slot Cumartesi'ye düşer", yeni?.gun === 6 && yeni?.saat === "10:00");
  kontrol("yeni ID kurala uyar", yeni?.id === "W40-D6-10", yeni?.id);
  kontrol("konu ve alan korunur", yeni?.alan === "AI" && yeni?.konu === "konu");
  kontrol("girdi nesnesi değişmez", v.slotlar.find((x) => x.id === "A")?.durum === "planli");
}

console.log("\nKorumalı alan");
{
  // 17:00 hafta sonunda korumalı; hiçbir hedefe sığmaz, düşer.
  const v = hafta([slot({ id: "B", gun: 1, saat: "17:00" })]);
  const { hafta: y, rapor } = gunBosalt(v, KURALLAR, 1, null, AN);
  kontrol("korumalı saate taşınmaz", rapor.tasinan === 0 && rapor.dusen === 1);
  kontrol("sığmayan slot kaçtı olur", y.slotlar.find((x) => x.id === "B")?.durum === "kacti");
  kontrol("düşen için yeni slot açılmaz", y.slotlar.length === 1);
}

console.log("\nKapasite ve çakışma");
{
  // Cumartesi 3 slotla dolu, Pazar boş → Pazar'a gider.
  const v = hafta([
    slot({ id: "C", gun: 1, saat: "10:00" }),
    slot({ id: "S1", gun: 6, saat: "09:00" }),
    slot({ id: "S2", gun: 6, saat: "11:00" }),
    slot({ id: "S3", gun: 6, saat: "13:00" }),
  ]);
  const { hafta: y, rapor } = gunBosalt(v, KURALLAR, 1, null, AN);
  kontrol("dolu güne konmaz, sıradakine gider", rapor.tasinan === 1);
  kontrol("Pazar'a düşer", y.slotlar.find((x) => x.id === "W40-D7-10")?.gun === 7);
}
{
  // Aynı saat Cumartesi'de dolu → Pazar'a gider.
  const v = hafta([
    slot({ id: "D", gun: 1, saat: "10:00" }),
    slot({ id: "S1", gun: 6, saat: "10:00" }),
  ]);
  const { hafta: y } = gunBosalt(v, KURALLAR, 1, null, AN);
  kontrol("aynı saate ikinci slot konmaz", y.slotlar.find((x) => x.id === "W40-D7-10")?.gun === 7);
}
{
  // Her iki hafta sonu günü de dolu → düşer.
  const dolduran = (gun: number) =>
    ["09:00", "11:00", "13:00"].map((saat, i) => slot({ id: `X${gun}${i}`, gun, saat }));
  const v = hafta([slot({ id: "E", gun: 1, saat: "10:00" }), ...dolduran(6), ...dolduran(7)]);
  const { rapor } = gunBosalt(v, KURALLAR, 1, null, AN);
  kontrol("yer yoksa düşer", rapor.tasinan === 0 && rapor.dusen === 1);
}

console.log("\nMuafiyetler ve kayıt");
{
  const v = hafta([
    slot({ id: "K", gun: 1, saat: "22:00", alan: "Kapanış", sureDk: 45 }),
    slot({ id: "Y", gun: 1, saat: "10:00", durum: "yapildi" }),
  ]);
  const { rapor } = gunBosalt(v, KURALLAR, 1, null, AN);
  kontrol(
    "Kapanış ve yapılmış slot taşınmaz",
    rapor.tasinan === 0 && rapor.dusen === 0 && rapor.not === "o günde taşınacak slot yok",
  );
}
{
  const v = hafta([slot({ id: "F", gun: 1, saat: "10:00" })]);
  const { hafta: y } = gunBosalt(v, KURALLAR, 1, "haftaIci", AN);
  kontrol("sosyal kota işaretlenir", y.sosyalKota?.haftaIci === true);
  const g = (y as Hafta & { degisiklikGunlugu?: { tarih: string; not: string }[] })
    .degisiklikGunlugu;
  kontrol("değişiklik günlüğüne satır yazılır", g?.length === 1);
  kontrol("günlükte tarih MM-DD biçiminde", g?.[0]?.tarih === "09-30", g?.[0]?.tarih);
  kontrol("günlük 'sıkıştırılmadı' der", g?.[0]?.not.includes("Sıkıştırılmadı"));
}

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
