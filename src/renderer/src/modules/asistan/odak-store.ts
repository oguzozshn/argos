import { create } from "zustand";
import { BOS_DURUM, gecenSn, uykuyuYakala, type Kesinti, type OdakDurumu } from "@ortak/odak";

/**
 * Odak sayacı ekranın değil uygulamanın durumu. Bileşen içinde tutulunca
 * Takvim'e bakıp dönmek çalışan seansı siliyordu.
 *
 * Yalnızca bellekte: uygulama kapanınca sayaç da biter. Diske saklansaydı
 * akşam açık kalan bir pomodoro sabah saatlerce "fazla mesai" olarak
 * görünür, "Bitir" o süreyi seans diye yazardı.
 */
interface OdakDeposu {
  d: OdakDurumu;
  odakSlot: string;
  odakMetin: string;
  /** Sayaç çalışırken en son canlı görüldüğü an. */
  sonGorulme: number | null;
  /** Uyku yüzünden durdurulduysa sayılmayan ara; kullanıcı karar verene kadar durur. */
  kesinti: Kesinti | null;
  setD: (f: OdakDurumu | ((x: OdakDurumu) => OdakDurumu)) => void;
  setOdakSlot: (x: string) => void;
  setOdakMetin: (x: string) => void;
  nabiz: () => void;
  /** Uykudaki arayı da say: çalışılmış kabul edilir. */
  kesintiyiSay: () => void;
  kesintiyiKapat: () => void;
}

export const useOdak = create<OdakDeposu>()((set, get) => ({
  d: BOS_DURUM,
  odakSlot: "",
  odakMetin: "",
  sonGorulme: null,
  kesinti: null,
  setD: (f) => set((s) => ({ d: typeof f === "function" ? f(s.d) : f })),
  setOdakSlot: (odakSlot) => set({ odakSlot }),
  setOdakMetin: (odakMetin) => set({ odakMetin }),
  nabiz: () => {
    const { d, sonGorulme } = get();
    if (!d.calisiyor) {
      // Duruyorsa her tikte durumu değiştirip ekranı yeniden çizdirme.
      if (sonGorulme !== null) set({ sonGorulme: null });
      return;
    }
    const simdi = Date.now();
    const r = uykuyuYakala(d, sonGorulme, simdi);
    set(r.kesinti ? { d: r.d, kesinti: r.kesinti, sonGorulme: null } : { sonGorulme: simdi });
  },
  kesintiyiSay: () =>
    set((s) =>
      s.kesinti ? { d: { ...s.d, gecen: s.d.gecen + s.kesinti.sn }, kesinti: null } : {},
    ),
  kesintiyiKapat: () => set({ kesinti: null }),
}));

/**
 * Başlat / duraklat: Odak ekranı, Bugün panosu ve komut paleti aynı geçişi
 * kullanır. `slotId` verilirse seans o slota bağlanır.
 */
export function odakBaslat(slotId?: string): void {
  const o = useOdak.getState();
  if (slotId) o.setOdakSlot(slotId);
  o.setD((x) => (x.calisiyor ? x : { ...x, calisiyor: true, basladi: Date.now() }));
}

export function odakDuraklat(): void {
  useOdak
    .getState()
    .setD((x) => (x.calisiyor ? { ...x, gecen: gecenSn(x, Date.now()), calisiyor: false, basladi: null } : x));
}

/**
 * Nabız ekrandan bağımsız atar: kullanıcı Takvim'deyken uyusa da sayaç
 * durmalı. Uyanınca zamanlayıcı gecikebileceği için pencere öne gelince de
 * hemen bakılır.
 */
const NABIZ_MS = 20_000;
if (typeof window !== "undefined") {
  const at = () => useOdak.getState().nabiz();
  window.setInterval(at, NABIZ_MS);
  window.addEventListener("focus", at);
  document.addEventListener("visibilitychange", at);
}
