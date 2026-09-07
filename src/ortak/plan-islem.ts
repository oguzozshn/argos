import { dakika, yeniSlotId, type KuralSeti } from "./kural.ts";
import type { Hafta, Slot } from "./plan";

/**
 * Hafta dosyası üzerinde yapılan işlemler. Saf: dosya okumaz, yazmaz —
 * yeni hafta nesnesini ve raporu döner, yazma çağıranın işi.
 */

export type GunTipi = "ofis" | "ev" | "haftaSonu";

export function gunTipi(no: number, ofisGunleri: number[] = []): GunTipi {
  if (no >= 6) return "haftaSonu";
  return ofisGunleri.includes(no) ? "ofis" : "ev";
}

export interface BosaltRaporu {
  tasinan: number;
  dusen: number;
  hedefler: string[];
  not?: string;
}

/**
 * Bir günün aktif slotlarını boşaltır — sosyal plan geldiğinde.
 *
 * Kural: slot **taşınır, sıkıştırılmaz**. Sığmıyorsa düşer (K11). Öncelik
 * korumalı olmayan hafta sonu saatleri; oraya da sığmazsa slot `kacti` olur.
 * Sosyal plan slotu ezer, slot sosyal planı ezmez.
 *
 * app.py'deki `gun_bosalt`'ın taşınmış hâli.
 */
export function gunBosalt(
  v: Hafta,
  kurallar: KuralSeti,
  gunNo: number,
  kota?: "haftaSonu" | "haftaIci" | null,
  bugun = new Date(),
): { hafta: Hafta; rapor: BosaltRaporu } {
  const gun = v.gunler.find((g) => g.no === gunNo);
  if (!gun) throw new Error("gün bulunamadı");

  const kap = kurallar.kapasite;
  const korumali = kurallar.korumaliAlanlar ?? [];

  // Üzerinde çalışılacak kopya: girdi nesnesi değişmez.
  const slotlar: Slot[] = v.slotlar.map((s) => ({ ...s }));
  const kullanilmisIdler = [...(v.kullanilmisIdler ?? [])];

  const tasinacak = slotlar.filter(
    (s) => s.gun === gunNo && s.durum === "planli" && s.alan !== "Kapanış",
  );
  if (tasinacak.length === 0) {
    return {
      hafta: v,
      rapor: { tasinan: 0, dusen: 0, hedefler: [], not: "o günde taşınacak slot yok" },
    };
  }

  const dolu = (no: number) =>
    slotlar.filter(
      (s) =>
        s.gun === no &&
        s.durum === "planli" &&
        s.alan !== "Serbest" &&
        s.alan !== "Kapanış",
    ).length;

  const sinir = (no: number) =>
    ({
      ofis: kap.ofisGunuMaxSlot,
      ev: kap.evGunuMaxSlot,
      haftaSonu: kap.haftaSonuMaxSlot,
    })[gunTipi(no, v.ofisGunleri ?? [])];

  const korumaliMi = (no: number, saat: string) =>
    korumali.some(
      (k) => k.gunler.includes(no) && dakika(saat) >= dakika(k.saattenSonra ?? "99:99"),
    );

  // Hedef yalnızca hafta sonu günleri: hafta içi akşamlar zaten dar.
  const hedefler = v.gunler.filter((g) => g.no !== gunNo && g.no >= 6);
  const rapor: BosaltRaporu = { tasinan: 0, dusen: 0, hedefler: [] };

  for (const s of tasinacak) {
    let yerlesti = false;
    for (const h of hedefler) {
      if (dolu(h.no) >= sinir(h.no)) continue;
      if (korumaliMi(h.no, s.saat)) continue;
      if (slotlar.some((x) => x.gun === h.no && x.saat === s.saat && x.durum !== "tasindi")) {
        continue;
      }
      const yeniId = yeniSlotId({ ...v, slotlar, kullanilmisIdler }, h.no, s.saat);
      kullanilmisIdler.push(yeniId);
      slotlar.push({ ...s, id: yeniId, gun: h.no, durum: "planli" });
      s.durum = "tasindi";
      (s as Slot & { tasindigiYer?: string }).tasindigiYer = yeniId;
      rapor.tasinan += 1;
      rapor.hedefler.push(`${s.id} → ${h.ad} ${s.saat}`);
      yerlesti = true;
      break;
    }
    if (!yerlesti) {
      s.durum = "kacti";
      rapor.dusen += 1;
    }
  }

  const p = (n: number) => String(n).padStart(2, "0");
  const gunluk = [
    ...(((v as Hafta & { degisiklikGunlugu?: unknown[] }).degisiklikGunlugu ?? []) as unknown[]),
    {
      tarih: `${p(bugun.getMonth() + 1)}-${p(bugun.getDate())}`,
      not:
        `${gun.ad} sosyal plan için boşaltıldı — ${rapor.tasinan} slot taşındı, ` +
        `${rapor.dusen} düştü. Sıkıştırılmadı.`,
    },
  ];

  const hafta: Hafta = {
    ...v,
    slotlar,
    kullanilmisIdler,
    ...(kota === "haftaSonu" || kota === "haftaIci"
      ? { sosyalKota: { ...(v.sosyalKota ?? {}), [kota]: true } }
      : {}),
  };
  (hafta as Hafta & { degisiklikGunlugu?: unknown[] }).degisiklikGunlugu = gunluk;

  return { hafta, rapor };
}
