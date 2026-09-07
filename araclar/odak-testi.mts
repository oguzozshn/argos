/**
 * Odak zamanlayıcısı testi: `node araclar/odak-testi.mts`
 *
 * Sayacın damga tabanlı olması bu ekranın tek gerçek riski: yanlış hesap
 * doğrudan yanlış ölçülen süre demek, o da arşivdeki her sayıyı bozar.
 */

import {
  BOS_DURUM,
  fazlaSn,
  gecenSn,
  gosterSn,
  hedefSn,
  kalanSn,
  kayitYeterli,
  oran,
  seansId,
  seansKaydi,
  yerelIso,
  type OdakAyarlari,
  type OdakDurumu,
} from "../src/ortak/odak.ts";

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

const K: OdakAyarlari = {
  pomodoroDk: 30,
  kisaMolaDk: 5,
  uzunMolaDk: 15,
  uzunMolaHerKacTur: 4,
  enAzKayitDk: 1,
};

const T0 = 1_800_000_000_000;
const d = (o: Partial<OdakDurumu>): OdakDurumu => ({ ...BOS_DURUM, ...o });

console.log("Hedef süresi");
kontrol("çalışma hedefi 30 dk", hedefSn(d({}), K) === 1800);
kontrol("1. tur sonrası kısa mola", hedefSn(d({ faz: "mola", tur: 1 }), K) === 300);
kontrol("4. tur sonrası uzun mola", hedefSn(d({ faz: "mola", tur: 4 }), K) === 900);
kontrol("kronometrede hedef yok", hedefSn(d({ mod: "kronometre" }), K) === null);

console.log("\nDamga tabanlı sayaç");
const calisan = d({ calisiyor: true, basladi: T0, gecen: 0 });
kontrol("10 sn sonra 10", gecenSn(calisan, T0 + 10_000) === 10);
kontrol(
  "arada 5 dk geçse de doğru sayar",
  gecenSn(calisan, T0 + 300_000) === 300,
  "sekme arkada kalınca sapmamalı",
);
kontrol(
  "duraklatılmış sayaç ilerlemez",
  gecenSn(d({ calisiyor: false, gecen: 42 }), T0 + 999_000) === 42,
);
kontrol(
  "duraklat sonrası devam biriktirir",
  gecenSn(d({ calisiyor: true, basladi: T0, gecen: 100 }), T0 + 50_000) === 150,
);

console.log("\nGeri sayım ve fazla mesai");
kontrol("kalan süre azalır", kalanSn(calisan, K, T0 + 600_000) === 1200);
kontrol("kalan negatife düşmez", kalanSn(calisan, K, T0 + 3_000_000) === 0);
kontrol("hedef dolmadan fazla mesai yok", fazlaSn(calisan, K, T0 + 600_000) === 0);
kontrol("hedef sonrası fazla mesai sayar", fazlaSn(calisan, K, T0 + 1_860_000) === 60);
kontrol(
  "doldu işaretliyken ekran fazla mesaiyi gösterir",
  gosterSn(d({ calisiyor: true, basladi: T0, doldu: true }), K, T0 + 1_860_000) === 60,
);
kontrol(
  "doldu değilken ekran kalanı gösterir",
  gosterSn(calisan, K, T0 + 600_000) === 1200,
);
kontrol(
  "kronometrede ekran geçeni gösterir",
  gosterSn(d({ mod: "kronometre", calisiyor: true, basladi: T0 }), K, T0 + 90_000) === 90,
);

console.log("\nHalka oranı");
kontrol("yarıda 0.5", Math.abs(oran(calisan, K, T0 + 900_000) - 0.5) < 1e-9);
kontrol("dolunca 1 kalır", oran(d({ doldu: true }), K, T0) === 1);
kontrol("hedefi aşsa da 1'i geçmez", oran(calisan, K, T0 + 3_000_000) === 1);

console.log("\nKayıt eşiği");
kontrol("59 sn kaydedilmez", !kayitYeterli(59, K));
kontrol("60 sn kaydedilir", kayitYeterli(60, K));
kontrol("eşik kurallardan gelir", !kayitYeterli(100, { ...K, enAzKayitDk: 2 }));

console.log("\nSeans kaydı");
const an = new Date(2026, 8, 5, 14, 30, 15);
kontrol("id biçimi app.py ile aynı", seansId(an) === "s-20260905143015");
kontrol("yerel ISO saat dilimine kaymaz", yerelIso(an) === "2026-09-05T14:30:15");
const kayit = seansKaydi({ tip: "pomodoro", dk: 25, odakSlot: "W36-D6-09", simdi: an });
kontrol("başlangıç süre kadar geriye alınır", kayit.baslangic === "2026-09-05T14:05:15");
kontrol("süre yazılır", kayit.sureDk === 25);
kontrol("slot bağı korunur", kayit.odakSlot === "W36-D6-09");
kontrol(
  "slot yoksa null olur",
  seansKaydi({ tip: "kronometre", dk: 5, simdi: an }).odakSlot === null,
);
kontrol(
  "serbest metin kırpılır",
  seansKaydi({ tip: "kronometre", dk: 5, odakMetin: "  networking  ", simdi: an }).odakMetin ===
    "networking",
);

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
