import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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

createRoot(document.getElementById("kok")!).render(
  <StrictMode>
    <Kabuk />
  </StrictMode>,
);
