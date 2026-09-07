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

export interface TasimaSonucu {
  hafta: Hafta;
  /** Taşındıysa hedef gündeki yeni slot ID'si; taşınmadıysa null. */
  yeniId: string | null;
  /** Taşınmadıysa sebep, taşındıysa kural uyarısı; sorun yoksa null. */
  not: string | null;
}

/**
 * Bir slotu elle başka güne taşır.
 *
 * Gövde `gunBosalt` ile aynı: slot yerinde DEĞİŞMEZ. Hedef güne yeni ID'yle
 * kopyalanır, eskisi `tasindi` olur ve nereye gittiğini yazar. ID bir kez
 * verilir, geri kullanılmaz (kural 2) — arşiv geçmişi eski ID'den okuyor,
 * `gun` alanını değiştirmek geçmişi değiştirmek olurdu.
 *
 * Otomatik boşaltmadan farkı: kapasite ve korumalı saat burada engel değil,
 * uyarı. Elle taşıma açık bir karar; sistem onu geri çevirmez, sonucunu
 * söyler. Yalnızca aynı saatte dolu olan hedef reddedilir — çift kayıt olurdu.
 */
export function slotTasi(
  v: Hafta,
  kurallar: KuralSeti,
  slotId: string,
  hedefGun: number,
  bugun = new Date(),
): TasimaSonucu {
  const kaynak = v.slotlar.find((x) => x.id === slotId);
  if (!kaynak) throw new Error("slot bulunamadı");
  const gun = v.gunler.find((g) => g.no === hedefGun);
  if (!gun) throw new Error("gün bulunamadı");

  if (kaynak.gun === hedefGun) return { hafta: v, yeniId: null, not: null };
  if (kaynak.durum === "tasindi") {
    return { hafta: v, yeniId: null, not: "Taşınmış slot yeniden taşınmaz." };
  }
  if (v.slotlar.some((x) => x.gun === hedefGun && x.saat === kaynak.saat && x.durum !== "tasindi")) {
    return { hafta: v, yeniId: null, not: `${gun.ad} ${kaynak.saat} zaten dolu.` };
  }

  const kap = kurallar.kapasite;
  const sinir = {
    ofis: kap.ofisGunuMaxSlot,
    ev: kap.evGunuMaxSlot,
    haftaSonu: kap.haftaSonuMaxSlot,
  }[gunTipi(hedefGun, v.ofisGunleri ?? [])];
  const dolu = v.slotlar.filter(
    (x) => x.gun === hedefGun && x.durum === "planli" && x.alan !== "Serbest" && x.alan !== "Kapanış",
  ).length;

  const uyarilar: string[] = [];
  if (dolu >= sinir) uyarilar.push(`${gun.ad} kapasitesi aşıldı (${dolu + 1}/${sinir})`);
  if (
    (kurallar.korumaliAlanlar ?? []).some(
      (k) => k.gunler.includes(hedefGun) && dakika(kaynak.saat) >= dakika(k.saattenSonra ?? "99:99"),
    )
  ) {
    uyarilar.push("korumalı saate kondu");
  }

  const slotlar: Slot[] = v.slotlar.map((x) => ({ ...x }));
  const kullanilmisIdler = [...(v.kullanilmisIdler ?? [])];
  const yeniId = yeniSlotId({ ...v, slotlar, kullanilmisIdler }, hedefGun, kaynak.saat);
  kullanilmisIdler.push(yeniId);

  const eski = slotlar.find((x) => x.id === slotId)!;
  eski.durum = "tasindi";
  (eski as Slot & { tasindigiYer?: string }).tasindigiYer = yeniId;
  slotlar.push({ ...kaynak, id: yeniId, gun: hedefGun, durum: "planli" });

  const p = (n: number) => String(n).padStart(2, "0");
  const hafta: Hafta = { ...v, slotlar, kullanilmisIdler };
  (hafta as Hafta & { degisiklikGunlugu?: unknown[] }).degisiklikGunlugu = [
    ...(((v as Hafta & { degisiklikGunlugu?: unknown[] }).degisiklikGunlugu ?? []) as unknown[]),
    {
      tarih: `${p(bugun.getMonth() + 1)}-${p(bugun.getDate())}`,
      not: `${slotId} elle taşındı → ${gun.ad} ${kaynak.saat} (${yeniId}).`,
    },
  ];

  return { hafta, yeniId, not: uyarilar.length ? uyarilar.join(" · ") : null };
}
