# Argos

Kişisel modüler masaüstü uygulaması. Haftalık gelişim planı, takvim, görevler
ve hobi listeleri tek yerden.

Adı Argos Panoptes'ten geliyor — her şeyi gören bekçi.

## Neden var

Ayrı ayrı uygulamalar yerine tek bir yer. Daha önce haftalık plan için bir
yerel web uygulaması vardı (`personnal_assistant/app.py`); Argos onun yerini
alıyor ve üstüne kendi modüllerini ekliyor.

## Modüller

| Modül | Ne yapar |
|---|---|
| **Asistan** | Hafta (slot düzenleme, günlük ızgara, kural uyarıları) · Odak (pomodoro, kronometre) · Hatırla · Arşiv · Yol haritaları |
| **Takvim** | Ay ızgarası ve gün ekseni. Sorusu tek: hangi güne ne sığar. |
| **Yapılacaklar** | Todoist'in kendisi — ayrı bir liste tutulmuyor |
| **Harcama** | Defter, hesaplar, bütçeler, düzenli işlemler, kart borç tahmini, ekstre içe aktarma. Tutar kuruş cinsinden tam sayı. |
| **Hobiler** | Oyun, dizi, film, kitap listeleri. Envanter, plan değil. |

Yeni modül eklemek bir klasör ve `src/renderer/src/modules/index.ts`'e bir
satır demek. Modüller birbirini import etmez; ortak ihtiyaç `ui/`, `veri/`
veya `ortak/`'a çıkar.

## Çalıştırma

```bash
npm install
npm run dev     # geliştirme, anlık yenileme
npm run build   # derle
npm start       # derlenmiş sürümü çalıştır
npm test        # testler
npm run tipler  # tip denetimi
npm run paket   # kurulum dosyası (Windows, NSIS)
```

## Veri

Uygulama kendi veritabanını tutmaz. Kaynak `data/` klasöründeki JSON
dosyaları — hafta planları, kurallar, yol haritaları, hobi listeleri,
harcama defteri.

Harcama modülü `data/harcama/` altında durur: tanımlar (ayarlar, kategoriler,
hesaplar, bütçeler, düzenli kurallar) tek dosyada, işlemler takvim ayına göre
`2026-09.json` gibi bölünmüş, kategori kuralları ve içe aktarma partileri
`ekstre.json`'da. Defter yıllarla büyüyor; tek dosya her düzenlemede baştan
yazılırdı.

Yol `argos.config.json`'dan gelir. Makineye özel değer için
`argos.config.local.json` açılır; o dosya önce okunur ve depoya girmez.

Geliştirmede dosyalar proje kökünden okunur. Kurulu sürümde iki yere
bakılır, sırayla: **exe'nin yanı**, sonra **`%APPDATA%/argos`**. Kurulum klasörü
her sürümde silinip yeniden yazılıyor — orada tutulan ayar güncellemede
kaybolur, kalıcı yer ikincisi. Veri klasörü bulunamazsa uygulama üstte şerit
açar ve dosyanın yazılacağı tam yolu söyler.

```json
{
  "dataDir": "../personnal_assistant/data",
  "gizliYolu": "../personnal_assistant/gizli.json"
}
```

Aynı klasöre başka bir uygulama da yazabildiği için her yazma atomiktir,
yazmadan önce `.bak` bırakır ve çakışma kontrolü yapar: dosya okunduktan
sonra dışarıdan değiştiyse yazma iptal edilir.

`gizliYolu` Todoist API anahtarını taşır (`{"todoistToken": "…"}`). Anahtar
yalnızca ana süreçte okunur, arayüze inmez ve depoya girmez.

## Harcama defterini taşımak

Modül, ayrı bir uygulama olan ExpenseTracker'ın (Blazor + SQLite) yerini
alıyor. Eski defter bir kez aktarılır:

```bash
python araclar/harcama-aktar.py --db "%LOCALAPPDATA%/ExpenseTracker/expenses.db"
```

Dış bağımlılık yok, `--kuru` ile önce ne olacağı görülebilir. Mevcut
`harcama/` dosyalarının üzerine `--uzerine-yaz` verilmedikçe yazmaz.

Kategori kuralları ve içe aktarma partileri de geliyor — işyerlerini importer'a
yeniden öğretmek ve eski aktarmaların geri alınabilirliğini kaybetmek gerekmesin.

## Ekstre içe aktarma

Bankanın verdiği dosya **İçe aktar** ekranından yüklenir. Akış üç adım: dosya →
sütun eşlemesi → önizleme. Onaylamadan hiçbir şey yazılmaz, her içe aktarma tek
tıkla geri alınır.

Dosyadan okunanlar sezilir: ayraç (`;` `,` sekme), kodlama (UTF-8 ya da
windows-1254) ve gerçek başlık satırı — bankaların dosya başına koyduğu hesap
bilgisi blokları atlanır. `.xlsx` doğrudan okunur; okuyucu depoda, dış
bağımlılık yok.

**Sütunlar tahmin edilir**, kullanıcı düzeltir. Tek "Tutar" sütunu da, ayrı
"Borç/Alacak" sütunları da desteklenir. Bakiye sütunu asla tutar sanılmaz.
Kredi kartı ekstrelerinde harcamalar artı yazıldığı için işaret sezilip otomatik
çevrilir; önizlemeye bakarak geri alınabilir.

**Kategoriler kurallarla atanır.** Kurulumda MİGROS, ŞOK, SHELL, TURKCELL,
NETFLIX gibi yaygın işyerleri için kurallar hazır gelir; eşleşme büyük/küçük harf
ve Türkçe karakter farkını yok sayar. Bir satıra kategori verip **Kural yap**
denirse hem o ekstredeki benzerlerine uygulanır hem de gelecek ekstreler için
saklanır. Kategorisiz kalan satır aktarılmaz.

**Mükerrer kayıt engellenir.** Her satırın parmak izi `(tarih, tutar,
normalleştirilmiş açıklama, o gün içindeki sıra)` üzerinden hesaplanır ve hesap
bazında tutulur. Bankalar her seferinde son 90 günü verdiği için örtüşen
ekstreleri arka arkaya yüklemek güvenlidir; aynı gün aynı yerde yapılan iki ayrı
alışveriş ise iki satır olarak korunur. Parmak izi ExpenseTracker'la aynı
algoritmada olduğu için eski uygulamada aktarılmış satırlar da yakalanır.

## Mimari

```
src/
  main/       Electron ana süreç — tek fs ve ağ erişimi burada
  preload/    contextBridge, tipli köprü
  ortak/      saf mantık: ozet · kural · odak · plan-islem · gun · plan
              para · donem · harcama · duzenli · tahmin
              ekstre · ekstre-xlsx · ekstre-aktar
  renderer/   arayüz: modules · ui · veri · app
araclar/      testler ve parite koşumu
```

`ortak/` altındaki hiçbir şey Electron'a ya da DOM'a bağlı değil. Testler
düz Node ile koşuyor, ileride başka bir çağıran da aynı gövdeyi kullanabilir.

## Testler

```bash
npm test
```

Dokuz takım. Bunlardan biri **parite koşumu**: eski Python uygulamasının
(`personnal_assistant/app.py`) çıktısını doğrudan onun kendisinden üretip
TypeScript sürümüyle karşılaştırıyor. Arşiv, zaman özeti, alışkanlık serileri,
takvim, yol haritası tahminleri ve hedefler aynı veriden aynı sayıyı vermek
zorunda. Eski uygulama bulunamazsa o takım atlanır.

Harcama ve ekstre takımları da paritedir: para ayrıştırma, dönem sınırları,
düzenli tekrar, bütçe kapsamı, kart tahmini, ekstre okuma ve mükerrer yakalama
iddiaları ExpenseTracker'ın kendi testlerinden geliyor. Aynı defterden aynı sayı
çıkmak zorunda.

Todoist testinin canlı bölümü yalnızca okuma yapar; yazma yolları sahte
`fetch` ile, istek gönderilmeden doğrulanır.

## İkon

`build/icon.ico` — `python araclar/ikon-uret.py` ile üretiliyor. Dış
bağımlılık yok, renkler `token.css` ile aynı kaynaktan.
