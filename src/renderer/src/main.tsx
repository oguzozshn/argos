import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HizliYakala } from "./app/HizliYakala";
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

// Aynı paket iki pencere açıyor; hızlı yakalama penceresi kabuğu yüklemez.
const yakalama = new URLSearchParams(location.search).get("pencere") === "yakala";
if (yakalama) {
  // Pencere saydam: kart kendi gölgesiyle çiziliyor, zemin görünmesin.
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

createRoot(document.getElementById("kok")!).render(
  <StrictMode>{yakalama ? <HizliYakala /> : <Kabuk />}</StrictMode>,
);
