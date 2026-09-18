/**
 * Kural kontrolü testi: `node araclar/kural-testi.mts`
 *
 * `ihlaller()` eski uygulamanın arayüzünden taşındı; orada Python karşılığı
 * olmadığı için parite koşumuna giremiyor. Bunun yerine her kural kendi
 * senaryosuyla sınanıyor.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { dakika, ihlaller, kuralSetiTamamla, yeniSlotId, type KuralSeti } from "../src/ortak/kural.ts";
import { saatAyikla } from "../src/ortak/gun.ts";
import { veriYolu } from "./yol.mts";
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
  ofisGunuKurallari: {
    sabahSlotuYok: true,
    sabahSiniri: "09:00",
    sonSlotBitisEnGec: "22:30",
  },
};

let sayac = 0;
const slot = (o: Partial<Slot>): Slot => ({
  id: o.id ?? `S${++sayac}`,
  gun: o.gun ?? 1,
  saat: o.saat ?? "19:00",
  sureDk: o.sureDk ?? 60,
  alan: o.alan ?? "AI",
  konu: o.konu ?? "konu",
  durum: o.durum ?? "planli",
  ...(o.esnek !== undefined ? { esnek: o.esnek } : {}),
});

const hafta = (slotlar: Slot[], ofisGunleri: number[] = []): Hafta => ({
  hafta: 40,
  yil: 2026,
  baslik: "Hafta 40",
  ofisGunleri,
  gunler: [
    { no: 1, ad: "Pazartesi", tarih: "28 Eyl", isoTarih: "2026-09-28" },
    { no: 6, ad: "Cumartesi", tarih: "3 Eki", isoTarih: "2026-10-03" },
  ],
  slotlar,
});

const gecer = (u: string[], parca: string) => u.some((x) => x.includes(parca));

console.log("Dakika çevrimi");
kontrol("19:15 → 1155", dakika("19:15") === 1155);
kontrol("00:00 → 0", dakika("00:00") === 0);

console.log("\nKapasite");
kontrol(
  "ofis gününde 3 slot sınırı aşar",
  gecer(
    ihlaller(
      hafta(
        [
          slot({ gun: 1, saat: "19:00" }),
          slot({ gun: 1, saat: "20:15" }),
          slot({ gun: 1, saat: "21:30" }),
        ],
        [1],
      ),
      KURALLAR,
    ),
    "3 aktif slot — sınır 2",
  ),
);
kontrol(
  "ev gününde 3 slot sınırı aşmaz",
  ihlaller(
    hafta([
      slot({ gun: 1, saat: "17:30" }),
      slot({ gun: 1, saat: "19:15" }),
      slot({ gun: 1, saat: "21:00" }),
    ]),
    KURALLAR,
  ).length === 0,
);
kontrol(
  "Serbest ve Kapanış kapasiteye sayılmaz",
  ihlaller(
    hafta(
      [
        slot({ gun: 1, saat: "19:00" }),
        slot({ gun: 1, saat: "20:15" }),
        slot({ gun: 1, saat: "21:30", alan: "Serbest" }),
        slot({ gun: 1, saat: "22:00", alan: "Kapanış", sureDk: 15 }),
      ],
      [1],
    ),
    KURALLAR,
  ).every((x) => !x.includes("aktif slot")),
);
kontrol(
  "taşınmış slot kapasiteye sayılmaz",
  ihlaller(
    hafta(
      [
        slot({ gun: 1, saat: "19:00" }),
        slot({ gun: 1, saat: "20:15" }),
        slot({ gun: 1, saat: "21:30", durum: "tasindi" }),
      ],
      [1],
    ),
    KURALLAR,
  ).every((x) => !x.includes("aktif slot")),
);

console.log("\nOfis günü kuralları");
kontrol(
  "sabah slotu uyarı verir",
  gecer(
    ihlaller(hafta([slot({ gun: 1, saat: "07:00" })], [1]), KURALLAR),
    "sabah slotu konmaz",
  ),
);
kontrol(
  "ev gününde sabah slotu serbest",
  !gecer(ihlaller(hafta([slot({ gun: 1, saat: "07:00" })]), KURALLAR), "sabah slotu konmaz"),
);
kontrol(
  "22:30'u aşan bitiş uyarı verir",
  gecer(
    ihlaller(hafta([slot({ gun: 1, saat: "21:45", sureDk: 60 })], [1]), KURALLAR),
    "22:30 sonrası",
  ),
);
kontrol(
  "tam 22:30'da biten uyarı vermez",
  !gecer(
    ihlaller(hafta([slot({ gun: 1, saat: "21:45", sureDk: 45 })], [1]), KURALLAR),
    "22:30 sonrası",
  ),
);

console.log("\nKorumalı alan");
kontrol(
  "Cumartesi 16:00 sonrası uyarı verir",
  gecer(
    ihlaller(hafta([slot({ gun: 6, saat: "17:00", id: "X1" })]), KURALLAR),
    "korumalı alanda",
  ),
);
kontrol(
  "esnek slot korumalı alanda uyarı vermez",
  !gecer(
    ihlaller(hafta([slot({ gun: 6, saat: "17:00", esnek: true })]), KURALLAR),
    "korumalı alanda",
  ),
);
kontrol(
  "Kapanış korumalı alandan muaf",
  !gecer(
    ihlaller(hafta([slot({ gun: 6, saat: "20:00", alan: "Kapanış" })]), KURALLAR),
    "korumalı alanda",
  ),
);
kontrol(
  "16:00'dan önce uyarı yok",
  !gecer(
    ihlaller(hafta([slot({ gun: 6, saat: "15:30" })]), KURALLAR),
    "korumalı alanda",
  ),
);

console.log("\nAynı saat ve haftalık yük");
kontrol(
  "aynı saate iki slot",
  gecer(
    ihlaller(hafta([slot({ gun: 1, saat: "19:00" }), slot({ gun: 1, saat: "19:00" })]), KURALLAR),
    "aynı saate iki slot",
  ),
);
const agir = hafta(
  Array.from({ length: 8 }, (_, i) => slot({ gun: 1, saat: `1${i}:00`, sureDk: 120 })),
);
kontrol(
  "üst sınırı aşan yük bildirilir",
  gecer(ihlaller(agir, KURALLAR), "üst sınır 14 sa"),
);
kontrol(
  "yük ondalığı virgülle yazılır",
  gecer(ihlaller(agir, KURALLAR), "16,0 sa"),
  ihlaller(agir, KURALLAR).find((x) => x.includes("Haftalık yük")),
);

console.log("\nSlot ID üretimi");
const h = hafta([slot({ id: "W40-D1-19", gun: 1, saat: "19:00" })]);
h.kullanilmisIdler = ["W40-D1-19"];
kontrol("boş saat kök ID alır", yeniSlotId(h, 1, "20:15") === "W40-D1-20");
kontrol("dolu saat b eki alır", yeniSlotId(h, 1, "19:00") === "W40-D1-19b");
h.kullanilmisIdler.push("W40-D1-19b");
kontrol("b doluysa c gelir", yeniSlotId(h, 1, "19:30") === "W40-D1-19c");
const silinmis = hafta([]);
silinmis.kullanilmisIdler = ["W40-D1-19"];
kontrol(
  "silinen slotun ID'si yeniden kullanılmaz",
  yeniSlotId(silinmis, 1, "19:00") === "W40-D1-19b",
);

console.log("\nEksik kural dosyası");
// kurallar.json yoksa Hafta ve Takvim `undefined.evGunuMaxSlot` diye çöküyordu.
{
  const kalabalik = hafta(
    Array.from({ length: 6 }, (_, i) => slot({ id: `k${i}`, gun: 1, saat: `1${i}:00` })),
  );
  const bos = kuralSetiTamamla({});
  kontrol("boş kurallar çökmez", Array.isArray(ihlaller(kalabalik, bos)));
  kontrol("kural yoksa kapasite uyarısı da yok", ihlaller(kalabalik, bos).length === 0);
  kontrol("null da boş sayılır", kuralSetiTamamla(null).kapasite.evGunuMaxSlot === Infinity);
  const kismi = kuralSetiTamamla({ kapasite: { evGunuMaxSlot: 2 } as KuralSeti["kapasite"] });
  kontrol(
    "verilen alanlar korunur, eksikler tamamlanır",
    kismi.kapasite.evGunuMaxSlot === 2 && kismi.kapasite.ofisGunuMaxSlot === Infinity,
  );
  kontrol("tamamlanan setle uyarı yine çalışır", gecer(ihlaller(kalabalik, kismi), "sınır 2"));
}

console.log("\nGerçek hafta dosyaları");
const dataDir = veriYolu();
if (!existsSync(dataDir)) {
  console.log("  (veri klasörü yok, atlandı)");
} else {
  const kurallarDosyasi = join(dataDir, "kurallar.json");
  const gercekKurallar = JSON.parse(readFileSync(kurallarDosyasi, "utf8")) as KuralSeti;
  let hepsiDizi = true;
  for (const d of readdirSync(dataDir).filter((x) => /^W\d{1,2}\.json$/.test(x))) {
    const v = JSON.parse(readFileSync(join(dataDir, d), "utf8")) as Hafta;
    const u = ihlaller(v, gercekKurallar);
    if (!Array.isArray(u)) hepsiDizi = false;
    console.log(`    ${d}: ${u.length} uyarı${u.length ? " — " + u[0] : ""}`);
  }
  kontrol("gerçek veride çalışır", hepsiDizi);
}

console.log("\nSaat ayıklama");
// Takvimde görev "toplantı 18:00" diye tek satırda yazılıyor; saati metinden
// ayıran gövde burada, saat dizgesinin diğer sınamalarıyla (dakika) birlikte.
{
  const a = (metin: string) => JSON.stringify(saatAyikla(metin));
  kontrol("sondaki saat ayrılır", a("toplantı 18:00") === '{"icerik":"toplantı","saat":"18:00"}');
  kontrol("tek haneli saat tamamlanır", a("koşu 9:05") === '{"icerik":"koşu","saat":"09:05"}');
  kontrol("saat yoksa metin bozulmaz", a("tek") === '{"icerik":"tek","saat":null}');
  kontrol("iki nokta yoksa saat sayılmaz", a("Sprint 15") === '{"icerik":"Sprint 15","saat":null}');
  kontrol(
    "nokta saat sayılmaz (sürüm numarası)",
    a("sürüm 1.30") === '{"icerik":"sürüm 1.30","saat":null}',
  );
  kontrol("saat tek başınaysa görevin adıdır", a("18:00") === '{"icerik":"18:00","saat":null}');
  kontrol("geçersiz saat metinde kalır", a("kahve 25:00") === '{"icerik":"kahve 25:00","saat":null}');
  kontrol("geçersiz dakika metinde kalır", a("kahve 12:99") === '{"icerik":"kahve 12:99","saat":null}');
  kontrol(
    "baş ve son boşluklar kırpılır",
    a("  boşluklu  7:30  ") === '{"icerik":"boşluklu","saat":"07:30"}',
  );
}

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
