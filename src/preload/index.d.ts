import type { ArgosApi } from "../ortak/tipler";

declare global {
  interface Window {
    argos: ArgosApi;
  }
}

export {};
