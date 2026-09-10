import { Wallet } from "lucide-react";
import type { Modul } from "../index";
import { Panel } from "./Panel";
import { Islemler } from "./Islemler";
import { Hesaplar } from "./Hesaplar";
import { Butceler } from "./Butceler";
import { Duzenli } from "./Duzenli";
import { Kategoriler } from "./Kategoriler";
import { Ayarlar } from "./Ayarlar";
import { HarcamaOzet } from "./Ozet";

export const harcamaModulu: Modul = {
  id: "harcama",
  ad: "Harcama",
  ikon: Wallet,
  aciklama: "Defter, bütçe, düzenli",
  rotalar: [
    { yol: "", ad: "Panel", Ekran: Panel },
    { yol: "islemler", ad: "İşlemler", Ekran: Islemler },
    { yol: "hesaplar", ad: "Hesaplar", Ekran: Hesaplar },
    { yol: "butceler", ad: "Bütçeler", Ekran: Butceler },
    { yol: "duzenli", ad: "Düzenli", Ekran: Duzenli },
    { yol: "kategoriler", ad: "Kategoriler", Ekran: Kategoriler },
    { yol: "ayarlar", ad: "Ayarlar", Ekran: Ayarlar },
  ],
  Ozet: HarcamaOzet,
};
