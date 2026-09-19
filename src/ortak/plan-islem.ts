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
  /** Taşıma yapıldı mı; reddedildiyse false ve `not` sebebi söyler. */
  tasindi: boolean;
  /** Reddedildiyse sebep, yapıldıysa kural uyarısı; sorun yoksa null. */
  not: string | null;
}

/**
 * Bir slotu elle başka güne taşır. Slot GERÇEKTEN taşınır: günü değişir,
 * eski günde iz kalmaz.
 *
 * `gunBosalt`tan bilerek ayrılıyor. O, slotu yerinde bırakıp hedefe yeni
 * ID'yle kopyalıyor ve eskisini `tasindi` yapıyor — çünkü orada bir OLAY
 * var: sosyal plan işi yerinden etti, kayıt bunu göstermeli. Elle taşımada
 * öyle bir olay yok, plan yeniden yazılıyor. Mezar taşı bırakmak eski günü
 * ⊘ ile doldurur ve ekranda kopyalanmış gibi görünür.
 *
 * ID değişmiyor: `seanslar[].odakSlot` slota ID'den bağlı, yeni ID vermek
 * ölçülen süreyi slottan koparırdı. ID'deki `D<n>` parçası doğduğu günü
 * söyler, bulunduğu günü değil — kimse oradan gün okumuyor (app.py'deki
 * `SLOT_ID_DESENI` yalnızca biçime bakıyor), taşındığı da değişiklik
 * günlüğünde yazıyor.
 *
 * Kapasite ve korumalı saat burada engel değil, uyarı: elle taşıma açık bir
 * karar, sistem geri çevirmez, sonucunu söyler. Yalnızca aynı saatte dolu
 * olan hedef reddedilir — o çift kayıt olurdu.
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

  if (kaynak.gun === hedefGun) return { hafta: v, tasindi: false, not: null };
  if (kaynak.durum === "tasindi") {
    return { hafta: v, tasindi: false, not: "Taşınmış slot yeniden taşınmaz." };
  }
  if (v.slotlar.some((x) => x.gun === hedefGun && x.saat === kaynak.saat && x.durum !== "tasindi")) {
    return { hafta: v, tasindi: false, not: `${gun.ad} ${kaynak.saat} zaten dolu.` };
  }

  const kap = kurallar.kapasite;
  const sinir = {
    ofis: kap.ofisGunuMaxSlot,
    ev: kap.evGunuMaxSlot,
    haftaSonu: kap.haftaSonuMaxSlot,
  }[gunTipi(hedefGun, v.ofisGunleri ?? [])];
  const dolu = v.slotlar.filter(
    (x) =>
      x.gun === hedefGun && x.durum === "planli" && x.alan !== "Serbest" && x.alan !== "Kapanış",
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

  const eskiGun = v.gunler.find((g) => g.no === kaynak.gun);
  const slotlar: Slot[] = v.slotlar.map((x) =>
    x.id === slotId ? { ...x, gun: hedefGun } : { ...x },
  );

  const p = (n: number) => String(n).padStart(2, "0");
  const hafta: Hafta = { ...v, slotlar };
  (hafta as Hafta & { degisiklikGunlugu?: unknown[] }).degisiklikGunlugu = [
    ...(((v as Hafta & { degisiklikGunlugu?: unknown[] }).degisiklikGunlugu ?? []) as unknown[]),
    {
      tarih: `${p(bugun.getMonth() + 1)}-${p(bugun.getDate())}`,
      not: `${slotId} elle taşındı: ${eskiGun?.ad ?? kaynak.gun} → ${gun.ad} ${kaynak.saat}.`,
    },
  ];

  return { hafta, tasindi: true, not: uyarilar.length ? uyarilar.join(" · ") : null };
}

/* --- işaretleme ----------------------------------------------------------- */

/** Durumların sırası; Hafta ekranındaki seçici de bu sırayla dizer. */
export const DURUM_SIRASI = ["planli", "yapildi", "kacti", "tasindi"];

/**
 * İşarete tıklanınca sıradaki durum: ☐ → ☑ → ⊘ → ☐. "Taşındı" döngüde
 * değil, tıklanınca plana döner — yoksa taşınmış slot tek tıkla "yapıldı"
 * oluyordu.
 */
export function sonrakiDurum(durum: string): string {
  const i = DURUM_SIRASI.indexOf(durum);
  return i >= 0 && i < 3 ? DURUM_SIRASI[(i + 1) % 3]! : "planli";
}

/**
 * Slotun durumunu döndürür. Yalnızca durum değişir: süre, roadmap adımı ve
 * Todoist'e dokunulmaz (Hafta ekranıyla aynı davranış).
 */
export const slotDurumunuDondur = (v: Hafta, id: string): Hafta => ({
  ...v,
  slotlar: v.slotlar.map((x) => (x.id === id ? { ...x, durum: sonrakiDurum(x.durum) } : x)),
});

/** Alışkanlık o gün bekleniyor mu: `beklenenGunler` yoksa her gün. */
export const aliskanlikBekleniyor = (a: { beklenenGunler?: number[] | null }, gunNo: number): boolean =>
  a.beklenenGunler === null || a.beklenenGunler === undefined || a.beklenenGunler.includes(gunNo);

/** Alışkanlığın o günkü işaretini çevirir. İşaret kalkınca anahtar silinir, `false` yazılmaz. */
export function aliskanlikCevir(v: Hafta, ad: string, gunNo: number): Hafta {
  return {
    ...v,
    gunlukAliskanliklar: (v.gunlukAliskanliklar ?? []).map((a) => {
      if (a.ad !== ad) return a;
      const gunler = { ...(a.gunler ?? {}) };
      if (gunler[String(gunNo)]) delete gunler[String(gunNo)];
      else gunler[String(gunNo)] = true;
      return { ...a, gunler };
    }),
  };
}

/* --- şimdi / sıradaki ------------------------------------------------------ */

export interface SimdiSiradaki {
  /** Şu an süresi içinde olunan, henüz işaretlenmemiş slot. */
  simdi: Slot | null;
  /** Başlamamış ilk planlı slot. */
  siradaki: Slot | null;
}

/**
 * Günün slotlarından şu anki ve sıradaki. Yalnızca "planlı" olanlar sayılır:
 * yapılmış ya da kaçmış slot "şimdi" diye gösterilmez. `simdiDk` gece
 * yarısından bu yana dakika.
 */
export function simdiVeSiradaki(slotlar: Slot[], simdiDk: number): SimdiSiradaki {
  const planli = slotlar.filter((s) => s.durum === "planli").sort((a, b) => dakika(a.saat) - dakika(b.saat));
  const simdi = planli.find((s) => dakika(s.saat) <= simdiDk && simdiDk < dakika(s.saat) + s.sureDk) ?? null;
  const siradaki = planli.find((s) => dakika(s.saat) > simdiDk) ?? null;
  return { simdi, siradaki };
}
