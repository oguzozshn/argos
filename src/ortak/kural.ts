import type { OdakAyarlari } from "./odak.ts";
import type { Hafta, Slot } from "./plan";

/**
 * Kapasite ve korumalı alan kontrolü.
 *
 * Uygulama ENGELLEMEZ, uyarır — kural senin kararına hizmet eder, seni
 * kilitlemek için değil (`uygulama.md`). Bu yüzden buradan dönen şey bir
 * hata değil, bir cümle listesi.
 *
 * Eski uygulamadaki `ihlaller()` fonksiyonunun taşınmış hâli; sayılar
 * `data/kurallar.json`'dan gelir, koda gömülmez.
 */

export interface Kapasite {
  ofisGunuMaxSlot: number;
  evGunuMaxSlot: number;
  haftaSonuMaxSlot: number;
  haftalikHedefDk: number;
  haftalikUstSinirDk: number;
  enAzTelafiSlotu?: number;
}

export interface KorumaliAlan {
  gunler: number[];
  saattenSonra: string;
  not?: string;
}

export interface OfisGunuKurallari {
  sabahSlotuYok?: boolean;
  sabahSiniri?: string;
  sonSlotBitisEnGec?: string;
  not?: string;
}

export interface KuralSeti {
  kapasite: Kapasite;
  korumaliAlanlar?: KorumaliAlan[];
  ofisGunuKurallari?: OfisGunuKurallari;
  alanlar?: string[];
  sureSecenekleriDk?: number[];
  durumlar?: Record<string, string>;
  odak?: OdakAyarlari;
  hatirla?: { gunlukAdet?: number };
}

/**
 * `kurallar.json` yoksa ya da `kapasite` eksikse: sınır yok, uyarı yok.
 * Dosyasız açılışta Hafta ve Takvim `undefined.evGunuMaxSlot` diye
 * çöküyordu; kural koymamış kullanıcıya uyarı üretmek de yanlış olurdu.
 *
 * DİSKE YAZILMAZ: Infinity JSON'da null olur, `dolu >= null` her günü dolu
 * sayar. Tamamlanmış set yalnızca okumada kullanılır; kurallar.json'a bir
 * gün yazılacaksa ham hâl yazılmalı.
 */
export const SINIRSIZ_KAPASITE: Kapasite = {
  ofisGunuMaxSlot: Infinity,
  evGunuMaxSlot: Infinity,
  haftaSonuMaxSlot: Infinity,
  haftalikHedefDk: 0,
  haftalikUstSinirDk: Infinity,
};

/** Diskten gelen (eksik olabilen) kuralları tam kural setine tamamlar. */
export function kuralSetiTamamla(k: Partial<KuralSeti> | null | undefined): KuralSeti {
  return { ...(k ?? {}), kapasite: { ...SINIRSIZ_KAPASITE, ...(k?.kapasite ?? {}) } };
}

/** "19:15" → 1155. */
export function dakika(saat: string): number {
  const [s, d] = saat.split(":").map(Number);
  return (s ?? 0) * 60 + (d ?? 0);
}

/** Kapasiteye sayılmayan alanlar: telafi ve kapanış haftalık yüke girmez. */
const SAYILMAZ = new Set(["Serbest", "Kapanış"]);

export function ihlaller(v: Hafta, k: KuralSeti): string[] {
  const u: string[] = [];
  const kap = k.kapasite;
  const ofisGunleri = v.ofisGunleri ?? [];
  const ofisK = k.ofisGunuKurallari ?? {};

  for (const g of v.gunler ?? []) {
    const gunSlotlari = (v.slotlar ?? []).filter((s) => s.gun === g.no);
    const aktif = gunSlotlari.filter((s) => s.durum !== "tasindi" && !SAYILMAZ.has(s.alan));

    const ofis = ofisGunleri.includes(g.no);
    const haftaSonu = g.no >= 6;
    const sinir = ofis
      ? kap.ofisGunuMaxSlot
      : haftaSonu
        ? kap.haftaSonuMaxSlot
        : kap.evGunuMaxSlot;
    if (aktif.length > sinir) {
      u.push(`${g.ad}: ${aktif.length} aktif slot — sınır ${sinir}`);
    }

    // Aynı saate ikinci slot: ID'si -b eki alır ama çakışma yine de söylenir.
    const saatler = gunSlotlari.map((s) => s.saat);
    saatler.forEach((s, i) => {
      const ilk = saatler.indexOf(s);
      if (ilk !== i && ilk < i) u.push(`${g.ad} ${s}: aynı saate iki slot`);
    });

    if (ofis && ofisK.sabahSlotuYok && ofisK.sabahSiniri) {
      for (const s of gunSlotlari.filter((x) => dakika(x.saat) < dakika(ofisK.sabahSiniri!))) {
        u.push(`${g.ad} ${s.saat}: ofis gününe sabah slotu konmaz`);
      }
    }
    if (ofis && ofisK.sonSlotBitisEnGec) {
      const sinirDk = dakika(ofisK.sonSlotBitisEnGec);
      for (const s of gunSlotlari.filter((x) => dakika(x.saat) + x.sureDk > sinirDk)) {
        u.push(`${g.ad} ${s.saat}: ofis gününde ${ofisK.sonSlotBitisEnGec} sonrası`);
      }
    }
  }

  for (const ka of k.korumaliAlanlar ?? []) {
    const sonra = dakika(ka.saattenSonra);
    for (const s of (v.slotlar ?? []).filter(
      (x) =>
        ka.gunler.includes(x.gun) &&
        dakika(x.saat) >= sonra &&
        !x.esnek &&
        !SAYILMAZ.has(x.alan),
    )) {
      u.push(`${s.id} korumalı alanda (${ka.saattenSonra} sonrası)`);
    }
  }

  const toplam = (v.slotlar ?? [])
    .filter((s) => s.durum !== "tasindi")
    .reduce((t, s) => t + s.sureDk, 0);
  if (toplam > kap.haftalikUstSinirDk) {
    const sa = (toplam / 60).toFixed(1).replace(".", ",");
    u.push(`Haftalık yük ${sa} sa — üst sınır ${kap.haftalikUstSinirDk / 60} sa`);
  }

  return u;
}

/**
 * Yeni slot ID'si: `W<hafta>-D<gün>-<saat>`, aynı saate ikinci slot gelirse
 * `-b` eki. Bir ID verildikten sonra asla değişmez ve yeniden kullanılmaz —
 * bu yüzden `kullanilmisIdler` listesine bakar (CLAUDE.md kural 2).
 *
 * Saf: listeye eklemez, yalnızca adayı döner.
 */
export function yeniSlotId(v: Hafta, gunNo: number, saat: string): string {
  const kok = `W${v.hafta}-D${gunNo}-${saat.slice(0, 2)}`;
  const kullanilan = new Set([
    ...(v.kullanilmisIdler ?? []),
    ...(v.slotlar ?? []).map((s) => s.id),
  ]);
  if (!kullanilan.has(kok)) return kok;
  for (const h of "bcdefgh") {
    if (!kullanilan.has(kok + h)) return kok + h;
  }
  return kok + Date.now().toString(36).slice(-2);
}

/** Aktif (taşınmamış) slotların toplam dakikası — telafi ve kapanış dahil. */
export const haftalikYuk = (v: Hafta): number =>
  (v.slotlar ?? []).filter((s) => s.durum !== "tasindi").reduce((t, s) => t + s.sureDk, 0);

/** Bir günün slotları, saate göre sıralı. */
export const gununSlotlari = (v: Hafta, gunNo: number): Slot[] =>
  (v.slotlar ?? []).filter((s) => s.gun === gunNo).sort((a, b) => (a.saat < b.saat ? -1 : 1));
