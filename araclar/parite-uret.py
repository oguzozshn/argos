"""Referans çıktıyı app.py'nin KENDİSİNDEN üretir.

Kullanım: python araclar/parite-uret.py <personnal_assistant yolu>

Çıktı stdout'a JSON olarak yazılır; parite-testi.mts bunu okuyup TypeScript
sürümüyle karşılaştırır. Burada hiçbir mantık yeniden yazılmaz — app.py ne
diyorsa o. Yalnızca okuma çağrıları yapılır, hafta dosyalarına yazılmaz.

(roadmap_ozet eksik `ilkTahminSaat` alanını dosyaya yazabilir; bu app.py'nin
kendi davranışı ve testten önce çalıştığı için iki taraf da aynı değeri görür.)
"""

import importlib.util
import json
import sys
from datetime import date


def yukle(kok):
    spec = importlib.util.spec_from_file_location("app_ref", kok + "/app.py")
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def main():
    if len(sys.argv) < 2:
        print("kullanım: parite-uret.py <personnal_assistant yolu>", file=sys.stderr)
        return 2

    app = yukle(sys.argv[1])
    bugun = date.today().isoformat()

    zaman = {}
    for kapsam in ("gun", "hafta", "ay", "yil"):
        for tarih in (bugun, "2026-08-15", "2026-09-01"):
            zaman[f"{kapsam}|{tarih}"] = app.zaman_ozet(kapsam, tarih)

    takvim = {}
    for yil, ay in ((2026, 7), (2026, 8), (2026, 9), (2026, 10)):
        takvim[f"{yil}-{ay:02d}"] = app.takvim(yil, ay)

    # roadmap_ozet önce koşsun: hedef_ozet onu çağırıyor ve eksik alanı
    # yazması gerekiyorsa iki taraf da aynı dosyayı görsün.
    rm = app.roadmap_ozet()

    json.dump(
        {
            "bugun": bugun,
            "arsiv": app.arsiv(),
            "roadmapOzet": rm,
            "hedefOzet": app.hedef_ozet(),
            "aliskanlikOzet": app.aliskanlik_ozet(),
            "aliskanlikOzet2026": app.aliskanlik_ozet(2026),
            "zamanOzet": zaman,
            "takvim": takvim,
            "haftalikHiz": {a: list(v) for a, v in app.haftalik_hiz().items()},
            "planliHiz": app.planli_hiz(),
        },
        sys.stdout,
        # ASCII kaçışlı: Windows konsolunun kod sayfası JSON'u bozmasın.
        ensure_ascii=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
