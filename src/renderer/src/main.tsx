import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Kabuk } from "./app/Kabuk";
import "./ui/token.css";
import "./ui/temel.css";

createRoot(document.getElementById("kok")!).render(
  <StrictMode>
    <Kabuk />
  </StrictMode>,
);
