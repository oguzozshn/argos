import type { ComponentType } from "react";
import type { KartAyari } from "@ortak/bugun-duzen";
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
  /** This screen alone goes wide, in a module that is narrow otherwise (`Modul.genis`). */
  genis?: boolean;
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

/** One choice of a card setting: a list, a period… */
export interface KartSecenegi {
  deger: string;
  ad: string;
}

/** A setting of a card type, with its choices read live (the lists that exist now). */
export interface KartAyarTanimi {
  anahtar: string;
  ad: string;
  useSecenekler: () => KartSecenegi[];
}

/**
 * A card type a module offers on Bugün besides its `Ozet`/`Ust` cards. It
 * can be added more than once, each copy with its own settings; a card
 * whose setting is not chosen yet (or points to something deleted) falls
 * back to the first choice.
 */
export interface KartTuru {
  /** Within the module: "liste" is the type "hobiler:liste". */
  id: string;
  /** Name in the "Kart ekle" menu. */
  ad: string;
  Bilesen: ComponentType<{ ayar: KartAyari }>;
  ayarlar?: KartAyarTanimi[];
  /** Size of a new copy, in grid columns and rows. */
  w?: number;
  h?: number;
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
  /**
   * Ekran içerik genişlik sınırını (`--icerik-en`) aşsın mı. Metin ağırlıklı
   * ekranlar dar kalır; ızgara gibi yayılması gerekenler geniş açılır.
   */
  genis?: boolean;
  /** Bugün ekranında görünecek kart. Modül isterse vermez. */
  Ozet?: ComponentType;
  /** The card's name in Bugün's "Kart ekle" menu; the module name when absent. */
  ozetAd?: string;
  /** Same for the `Ust` card. */
  ustAd?: string;
  /** How many grid rows the `Ust` card gets in a fresh layout; 5 when absent. */
  ustH?: number;
  /** More card types for Bugün, each addable more than once with its own settings. */
  kartlar?: KartTuru[];
  /**
   * Bugün ekranında ızgaranın üstünde, tam genişlikte duran kart. Her an
   * görünmesi gereken şeyler için (önemli tarihlerin geri sayımı); modül
   * sırasından bağımsız olarak en üstte durur. Göstereceği yoksa null döner.
   */
  Ust?: ComponentType;
  /** Komut paletine verdiği eylemler. Ekranlara gitme komutları kabukta kendiliğinden üretilir. */
  komutlar?: Komut[];
  /**
   * Her ekranda çalışan, çizim yapmayan parça: sayaç bitişi, bildirim gibi
   * modülün ekranı kapalıyken de sürmesi gereken işler.
   */
  ArkaPlan?: ComponentType;
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
