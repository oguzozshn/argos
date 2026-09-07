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
dosyaları — hafta planları, kurallar, yol haritaları, hobi listeleri.

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

## Mimari

```
src/
  main/       Electron ana süreç — tek fs ve ağ erişimi burada
  preload/    contextBridge, tipli köprü
  ortak/      saf mantık: ozet · kural · odak · plan-islem · gun · plan
  renderer/   arayüz: modules · ui · veri · app
araclar/      testler ve parite koşumu
```

`ortak/` altındaki hiçbir şey Electron'a ya da DOM'a bağlı değil. Testler
düz Node ile koşuyor, ileride başka bir çağıran da aynı gövdeyi kullanabilir.

## Testler

```bash
npm test
```

Yedi takım. Bunlardan biri **parite koşumu**: eski Python uygulamasının
(`personnal_assistant/app.py`) çıktısını doğrudan onun kendisinden üretip
TypeScript sürümüyle karşılaştırıyor. Arşiv, zaman özeti, alışkanlık serileri,
takvim, yol haritası tahminleri ve hedefler aynı veriden aynı sayıyı vermek
zorunda. Eski uygulama bulunamazsa o takım atlanır.

Todoist testinin canlı bölümü yalnızca okuma yapar; yazma yolları sahte
`fetch` ile, istek gönderilmeden doğrulanır.

## İkon

`build/icon.ico` — `python araclar/ikon-uret.py` ile üretiliyor. Dış
bağımlılık yok, renkler `token.css` ile aynı kaynaktan.
