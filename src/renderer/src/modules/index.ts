import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Modül sözleşmesi. Kabuk modüller hakkında başka hiçbir şey bilmez —
 * yeni modül eklemek bir klasör ve aşağıdaki diziye bir satır demektir.
 *
 * Modüller birbirini import etmez. Ortak ihtiyaç `ui/` veya `veri/`'ye çıkar.
 * Modüllerin buluştuğu tek yer Bugün ekranıdır ve orada da yalnızca kendi
 * `Ozet` kartlarını verirler.
 */

export interface Rota {
  /** Modül içi yol parçası. Boş dizge modülün varsayılan ekranıdır. */
  yol: string;
  ad: string;
  Ekran: ComponentType;
}

/** Komut çalışırken kabuğun verdiği olanaklar. */
export interface KomutOrtami {
  /** Uygulama içi yola git: "/asistan/odak". */
  git: (yol: string) => void;
}

/**
 * Komut paletinde (Ctrl+K) görünen bir eylem. Kabuk komutları modülleri
 * tanımadan toplar; `Ozet` kartlarıyla aynı desen.
 */
export interface Komut {
  id: string;
  ad: string;
  ikon?: LucideIcon;
  /** Aramada ada ek olarak eşleşen sözcükler. */
  anahtarlar?: string[];
  /**
   * Metin alan komutun tetik sözcükleri. Yazılan ilk sözcük bunlardan biriyse
   * kalan metin argümandır: "görev süt al yarın".
   */
  onekler?: string[];
  /** Argüman örneği; önek yazılınca gri ipucu olarak görünür. */
  ornek?: string;
  /** Şu an listelensin mi (ör. sayaç çalışmıyorsa "duraklat" yok). */
  uygun?: () => boolean;
  /**
   * Eylem. Dönen metin başarı bildirimi olur; hata fırlatırsa mesajı hata
   * bildirimi olur. Argümanlı komutta boş argümanla çağrılmaz.
   */
  calistir: (arguman: string, o: KomutOrtami) => Promise<string | void> | string | void;
}

export interface Modul {
  id: string;
  ad: string;
  ikon: LucideIcon;
  /** Kenar çubuğunda modül adının altında görünen kısa açıklama. */
  aciklama?: string;
  /**
   * Ekranları. Boş bırakılabilir: yalnızca Bugün kartı veren bir modül
   * kenar çubuğunda görünmez. Henüz ekranı olmayan modüller böyle durur.
   */
  rotalar: Rota[];
  /** Bugün ekranında görünecek kart. Modül isterse vermez. */
  Ozet?: ComponentType;
  /** Komut paletine verdiği eylemler. Ekranlara gitme komutları kabukta kendiliğinden üretilir. */
  komutlar?: Komut[];
}

// Kayıt. Yeni modül eklemek = klasör + buraya bir satır.
// (Modül dosyaları buradan yalnızca tip alır, o da derlemede silinir — döngü yok.)
import { asistanModulu } from "./asistan";
import { harcamaModulu } from "./harcama";
import { hobilerModulu } from "./hobiler";
import { takvimModulu } from "./takvim";
import { yapilacakModulu } from "./yapilacak";

export const moduller: Modul[] = [
  asistanModulu,
  takvimModulu,
  yapilacakModulu,
  harcamaModulu,
  hobilerModulu,
];
