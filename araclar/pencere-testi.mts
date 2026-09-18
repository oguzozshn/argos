/**
 * Pencere durumu testi: `node araclar/pencere-testi.mts`
 *
 * Asıl risk: kayıtlı konum artık var olmayan bir ekranı gösteriyorsa pencere
 * görünmez bir yerde açılır ve kullanıcı onu geri getiremez.
 */

import { durumuDogrula } from "../src/main/pencere-durumu.ts";

let gecen = 0;
let kalan = 0;

function kontrol(ad: string, kosul: unknown): void {
  if (kosul) {
    gecen++;
    console.log(`  ✓ ${ad}`);
  } else {
    kalan++;
    console.log(`  ✗ ${ad}`);
  }
}

const anaEkran = { x: 0, y: 0, width: 1920, height: 1040 };
const sagEkran = { x: 1920, y: 0, width: 1920, height: 1040 };
const enAz = { width: 880, height: 600 };
const kayit = { x: 100, y: 80, width: 1300, height: 900, buyuk: false };

console.log("Pencere durumu");
kontrol("geçerli kayıt aynen döner", durumuDogrula(kayit, [anaEkran], enAz)?.width === 1300);
kontrol(
  "büyütülmüş bilgisi korunur",
  durumuDogrula({ ...kayit, buyuk: true }, [anaEkran], enAz)?.buyuk,
);
kontrol(
  "ikinci ekrandaki pencere o ekran takılıyken geçerli",
  durumuDogrula({ ...kayit, x: 2100 }, [anaEkran, sagEkran], enAz) !== null,
);
kontrol(
  "ikinci ekran çıkarıldıysa reddedilir (pencere kaybolmasın)",
  durumuDogrula({ ...kayit, x: 2100 }, [anaEkran], enAz) === null,
);
kontrol(
  "kenarından birazı görünen pencere reddedilir",
  durumuDogrula({ ...kayit, x: 1880 }, [anaEkran], enAz) === null,
);
kontrol(
  "en küçük boyuttan küçükse reddedilir",
  durumuDogrula({ ...kayit, width: 400 }, [anaEkran], enAz) === null,
);
kontrol("bozuk kayıt reddedilir", durumuDogrula({ x: "a" }, [anaEkran], enAz) === null);
kontrol("boş kayıt reddedilir", durumuDogrula(null, [anaEkran], enAz) === null);
kontrol(
  "kesirli değerler yuvarlanır",
  durumuDogrula({ ...kayit, x: 100.6 }, [anaEkran], enAz)?.x === 101,
);

console.log(`\n${gecen} geçti, ${kalan} kaldı`);
if (kalan > 0) process.exitCode = 1;
