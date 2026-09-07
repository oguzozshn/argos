import { contextBridge, ipcRenderer } from "electron";
import {
  KANAL,
  type DegisimOlayi,
  type ArgosApi,
  type Okuma,
  type Ortam,
  type Yazma,
} from "../ortak/tipler";

const argos: ArgosApi = {
  ortam: (): Promise<Ortam> => ipcRenderer.invoke(KANAL.ortam),

  veri: {
    oku: <T = unknown,>(yol: string): Promise<Okuma<T>> => ipcRenderer.invoke(KANAL.veriOku, yol),
    yaz: (yol: string, icerik: unknown, mtime: number | null): Promise<Yazma> =>
      ipcRenderer.invoke(KANAL.veriYaz, yol, icerik, mtime),
    listele: (klasor: string): Promise<string[]> => ipcRenderer.invoke(KANAL.veriListele, klasor),
    sil: (yol: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(KANAL.veriSil, yol),
  },

  temaUygula: (tema: "acik" | "koyu"): Promise<void> => ipcRenderer.invoke(KANAL.tema, tema),

  todoist: {
    durum: () => ipcRenderer.invoke(KANAL.tdDurum),
    projeler: () => ipcRenderer.invoke(KANAL.tdProjeler),
    gorevler: (projeId: string) => ipcRenderer.invoke(KANAL.tdGorevler, projeId),
    bugunVeGecikmis: () => ipcRenderer.invoke(KANAL.tdBugun),
    ekle: (g: { icerik: string; projeId: string; tarihMetni?: string; oncelik?: number }) =>
      ipcRenderer.invoke(KANAL.tdEkle, g),
    kapat: (id: string) => ipcRenderer.invoke(KANAL.tdKapat, id),
    ac: (id: string) => ipcRenderer.invoke(KANAL.tdAc, id),
    tarihVer: (id: string, tarihMetni: string | null) =>
      ipcRenderer.invoke(KANAL.tdTarih, id, tarihMetni),
  },

  degisimDinle: (geriCagri: (olay: DegisimOlayi) => void): (() => void) => {
    const sarmal = (_o: unknown, olay: DegisimOlayi) => geriCagri(olay);
    ipcRenderer.on(KANAL.degisim, sarmal);
    return () => {
      ipcRenderer.off(KANAL.degisim, sarmal);
    };
  },
};

contextBridge.exposeInMainWorld("argos", argos);
