/**
 * Düzenli işlemler: kira, abonelik, maaş gibi her ay tekrar eden kalemler.
 * Kaynağı ExpenseTracker'ın `Services/RecurringService.cs` dosyası.
 *
 * Kural doğrudan hiçbir toplama girmez — vadesi gelince gerçek işlem yazılır,
 * böylece raporların tek bir gerçeği olur.
 */

import { ayEkle, ayGunSayisi } from "./donem.ts";
import { ayAl, gunEkle, yilAl } from "./gun.ts";
import type { Duzenli, Islem } from "./harcama.ts";

/**
 * Tek geçişte kural başına yazılacak en fazla kayıt. Yalnızca başlangıç tarihi
 * yıllarca geriye atılmışsa devreye girer; o yazının defteri on yıllık kirayla
 * doldurmasını engeller.
 */
export const TEK_GECISTE_EN_FAZLA = 120;

/**
 * Ayın verilen günü, o ayın gerçek uzunluğuna kırpılmış. Her ay için yeniden
 * hesaplanır, önceki aydan taşınmaz: 31'e ayarlı bir kural her ayın son gününe
 * düşer — 30 günlük aydan 31 günlüğe geçerken de — kısa bir ayda takılıp
 * kalmaz.
 */
function ayinGununde(iso: string, gun: number): string {
  const yil = yilAl(iso);
  const ay = ayAl(iso);
  const g = Math.min(Math.max(1, Math.trunc(gun)), ayGunSayisi(yil, ay));
  return `${iso.slice(0, 7)}-${String(g).padStart(2, "0")}`;
}

const sonrakiAy = (iso: string): string => ayEkle(`${iso.slice(0, 7)}-01`, 1);

/** Kuralın `tarihten` itibaren ilk çalışacağı gün; bittiyse null. */
export function sonrakiTekrar(kural: Duzenli, tarihten: string): string | null {
  if (kural.durdu) return null;

  const capa = tarihten < kural.baslangic ? kural.baslangic : tarihten;

  let aday = ayinGununde(capa, kural.ayinGunu);
  if (aday < capa) aday = ayinGununde(sonrakiAy(capa), kural.ayinGunu);
  if (aday < kural.baslangic) aday = ayinGununde(sonrakiAy(aday), kural.ayinGunu);

  return kural.bitis && aday > kural.bitis ? null : aday;
}

/** Bitiş tarihi ikinci tekrarın önünü kesiyorsa kural aslında tek seferliktir. */
export function tekSeferlik(kural: Duzenli): boolean {
  if (!kural.bitis) return false;
  const ilk = sonrakiTekrar(kural, kural.baslangic);
  return ilk !== null && kural.bitis < ayEkle(ilk, 1);
}

/**
 * `bugun` dâhil vadesi gelmiş ve henüz yazılmamış tekrarlar. Tekrar tekrar
 * çağrılabilir: `(duzenliId, tarih)` çifti zaten varsa atlanır, yani bir hafta
 * kapalı kalan makine açılışta arayı kapatır, mükerrer kayıt üretmez.
 *
 * Kimlik verilmez — onu yazan taraf koyar; burada kimse rastgele üretmiyor.
 */
export function vadesiGelenler(
  kurallar: Duzenli[],
  mevcut: Islem[],
  bugun: string,
): Omit<Islem, "id">[] {
  const yazilmis = new Set(
    mevcut.filter((i) => i.duzenliId).map((i) => `${i.duzenliId}|${i.tarih}`),
  );

  const uretilen: Omit<Islem, "id">[] = [];

  for (const kural of kurallar) {
    if (kural.durdu) continue;
    const atlanan = new Set(kural.atlananlar ?? []);

    let tarih = sonrakiTekrar(kural, kural.baslangic);
    let sayi = 0;

    while (tarih !== null && tarih <= bugun && sayi < TEK_GECISTE_EN_FAZLA) {
      if (!yazilmis.has(`${kural.id}|${tarih}`) && !atlanan.has(tarih)) {
        uretilen.push({
          kategoriId: kural.kategoriId,
          tur: kural.tur,
          kurus: Math.abs(kural.kurus),
          tarih,
          not: kural.ad,
          karsiTaraf: kural.karsiTaraf,
          odeme: kural.odeme,
          hesapId: kural.hesapId,
          transfer: false,
          duzenliId: kural.id,
        });
        sayi++;
      }
      tarih = sonrakiTekrar(kural, gunEkle(tarih, 1));
    }
  }

  return uretilen;
}

/**
 * Kullanıcı üretilen bir kaydı sildiğinde ya da tarihini kaydırdığında o
 * tekrar "yapıldı" sayılır. Yeni kural döner; verilen değişmez.
 */
export function tekrarAtla(kural: Duzenli, tarih: string): Duzenli {
  const mevcut = kural.atlananlar ?? [];
  if (mevcut.includes(tarih)) return kural;
  return { ...kural, atlananlar: [...mevcut, tarih].sort() };
}
