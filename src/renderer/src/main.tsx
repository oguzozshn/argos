import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HizliYakala } from "./app/HizliYakala";
import { OdakMini } from "./app/OdakMini";
import { Kabuk } from "./app/Kabuk";
import "./ui/token.css";
import "./ui/temel.css";

// Pencereye bırakılan dosya sayfanın yerine açılmasın (ana süreç de engelliyor;
// burada ekran hiç kaybolmasın diye). Uygulama içi sürükle-bırak dosya taşımıyor.
for (const olay of ["dragover", "drop"] as const) {
  window.addEventListener(olay, (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });
}

// Aynı paket üç pencere açıyor; hızlı yakalama ve odak mini penceresi kabuğu yüklemez.
const pencere = new URLSearchParams(location.search).get("pencere");
const yakalama = pencere === "yakala";
if (pencere === "yakala" || pencere === "odak") {
  // Pencere saydam: kart kendi gölgesiyle çiziliyor, zemin görünmesin.
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

createRoot(document.getElementById("kok")!).render(
  <StrictMode>{yakalama ? <HizliYakala /> : pencere === "odak" ? <OdakMini /> : <Kabuk />}</StrictMode>,
);
