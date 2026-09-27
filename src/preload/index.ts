import { contextBridge, ipcRenderer } from "electron";
import {
  KANAL,
  type DegisimOlayi,
  type ArgosApi,
  type Okuma,
  type Ortam,
  type TodoistDurum,
  type TodoistTaskPatch,
  type Yazma,
} from "../ortak/tipler";

const argos: ArgosApi = {
  ortam: (): Promise<Ortam> => ipcRenderer.invoke(KANAL.ortam),
  klasorSec: (): Promise<Ortam | null> => ipcRenderer.invoke(KANAL.ayarKlasor),
  gizliSec: (): Promise<TodoistDurum | null> => ipcRenderer.invoke(KANAL.ayarGizli),

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
    tarihAraligi: (basIso: string, sonIso: string) =>
      ipcRenderer.invoke(KANAL.tdAralik, basIso, sonIso),
    onemliler: () => ipcRenderer.invoke(KANAL.tdOnemliler),
    onemliYap: (id: string, onemli: boolean) => ipcRenderer.invoke(KANAL.tdOnemliYap, id, onemli),
    allTasks: () => ipcRenderer.invoke(KANAL.tdAllTasks),
    updateTask: (id: string, patch: TodoistTaskPatch) => ipcRenderer.invoke(KANAL.tdUpdateTask, id, patch),
    deleteTask: (id: string) => ipcRenderer.invoke(KANAL.tdDeleteTask, id),
    moveTask: (id: string, projectId: string) => ipcRenderer.invoke(KANAL.tdMoveTask, id, projectId),
    setProjectFavorite: (id: string, favorite: boolean) =>
      ipcRenderer.invoke(KANAL.tdProjectFavorite, id, favorite),
    ekle: (g: {
      icerik: string;
      projeId: string;
      tarihMetni?: string;
      oncelik?: number;
      description?: string;
      labels?: string[];
    }) =>
      ipcRenderer.invoke(KANAL.tdEkle, g),
    kapat: (id: string) => ipcRenderer.invoke(KANAL.tdKapat, id),
    ac: (id: string) => ipcRenderer.invoke(KANAL.tdAc, id),
    tarihVer: (id: string, tarihMetni: string | null) =>
      ipcRenderer.invoke(KANAL.tdTarih, id, tarihMetni),
    hizliEkle: (metin: string) => ipcRenderer.invoke(KANAL.tdHizli, metin),
  },

  todoistDegisimDinle: (geriCagri: () => void): (() => void) => {
    const sarmal = () => geriCagri();
    ipcRenderer.on(KANAL.tdDegisti, sarmal);
    return () => {
      ipcRenderer.off(KANAL.tdDegisti, sarmal);
    };
  },

  botAl: (): Promise<string[]> => ipcRenderer.invoke(KANAL.botAl),
  yedekAc: (): Promise<void> => ipcRenderer.invoke(KANAL.yedekAc),
  bildirimGoster: (baslik: string, govde: string): Promise<void> =>
    ipcRenderer.invoke(KANAL.bildirim, baslik, govde),
  odakTepsi: (metin: string | null): Promise<void> => ipcRenderer.invoke(KANAL.odakTepsi, metin),
  botAktarildiDinle: (geriCagri: () => void): (() => void) => {
    const sarmal = () => geriCagri();
    ipcRenderer.on(KANAL.botAktarildi, sarmal);
    return () => {
      ipcRenderer.off(KANAL.botAktarildi, sarmal);
    };
  },

  yakala: {
    gizle: (): Promise<void> => ipcRenderer.invoke(KANAL.yakalaGizle),
    acildiDinle: (geriCagri: () => void): (() => void) => {
      const sarmal = () => geriCagri();
      ipcRenderer.on(KANAL.yakalaAcildi, sarmal);
      return () => {
        ipcRenderer.off(KANAL.yakalaAcildi, sarmal);
      };
    },
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
