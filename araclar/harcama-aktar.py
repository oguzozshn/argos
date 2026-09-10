"""ExpenseTracker defterini Argos'un harcama modülüne aktarır.

    python araclar/harcama-aktar.py [--db YOL] [--kuru] [--uzerine-yaz]

Kaynak, ExpenseTracker'ın SQLite dosyası (varsayılan
`%LOCALAPPDATA%/ExpenseTracker/expenses.db`). Hedef, Argos'un veri klasöründeki
`harcama/` altı: tanımlar tek dosyada, işlemler takvim ayına göre bölünmüş.

Dış bağımlılık yok — Python'un yerleşik `sqlite3`'ü yetiyor. Bir kez
çalıştırılır; mevcut dosyaların üzerine `--uzerine-yaz` verilmedikçe yazmaz.

Kuruş, tarih ve kimlik dönüşümü dışında hiçbir şeye dokunulmuyor: aktarımın
işi biçim değiştirmek, defteri yorumlamak değil.
"""

import argparse
import json
import os
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent

TUR = {0: "gider", 1: "gelir"}
ODEME = {0: "nakit", 1: "kart", 2: "havale", 3: "diger"}
HESAP_TURU = {0: "nakit", 1: "banka", 2: "kredi"}


def ayar_oku() -> dict:
    """`argos.config.local.json` önce okunur — uygulamanın ve testlerin sırası."""
    for ad in ("argos.config.local.json", "argos.config.json"):
        dosya = KOK / ad
        if not dosya.exists():
            continue
        try:
            return json.loads(dosya.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass  # Bozuk ayar yok sayılır.
    return {}


def veri_yolu() -> Path:
    deger = os.environ.get("ARGOS_DATA") or ayar_oku().get("dataDir") or "../personnal_assistant/data"
    yol = Path(deger)
    return yol if yol.is_absolute() else (KOK / yol).resolve()


def varsayilan_db() -> Path:
    yerel = os.environ.get("LOCALAPPDATA")
    if yerel:
        return Path(yerel) / "ExpenseTracker" / "expenses.db"
    return Path.home() / ".local" / "share" / "ExpenseTracker" / "expenses.db"


def sutunlar(baglanti: sqlite3.Connection, tablo: str) -> set[str]:
    return {s[1] for s in baglanti.execute(f"PRAGMA table_info({tablo})")}


def satirlar(baglanti: sqlite3.Connection, tablo: str) -> list[sqlite3.Row]:
    """Tablo yoksa boş liste — eski bir dosyada henüz açılmamış olabilir."""
    try:
        return list(baglanti.execute(f"SELECT * FROM {tablo}"))
    except sqlite3.OperationalError:
        return []


def al(satir: sqlite3.Row, alan: str, varsayilan=None):
    return satir[alan] if alan in satir.keys() and satir[alan] is not None else varsayilan


def kimlik(deger) -> str | None:
    """Sayısal kimlikler dizgeye çevrilir; Argos tarafında kimlik dizgedir."""
    return None if deger is None else str(deger)


def tarih(deger) -> str | None:
    """SQLite'ta DateOnly TEXT; saat taşıyan bir değer gelirse ilk on hane alınır."""
    if deger is None:
        return None
    return str(deger)[:10]


def yaz(dosya: Path, icerik: dict, kuru: bool) -> None:
    if kuru:
        return
    dosya.parent.mkdir(parents=True, exist_ok=True)
    # Argos'un yazdığı biçimin aynısı: iki boşluk girinti, sonda satır başı.
    dosya.write_text(json.dumps(icerik, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    ayristirici = argparse.ArgumentParser(description="ExpenseTracker → Argos harcama modülü")
    ayristirici.add_argument("--db", type=Path, default=None, help="expenses.db yolu")
    ayristirici.add_argument("--veri", type=Path, default=None, help="hedef veri klasörü")
    ayristirici.add_argument("--kuru", action="store_true", help="yazmadan yalnızca ne olacağını söyler")
    ayristirici.add_argument("--uzerine-yaz", action="store_true", help="mevcut harcama dosyalarını değiştirir")
    secenek = ayristirici.parse_args()

    db = secenek.db or varsayilan_db()
    if not db.exists():
        print(f"Veritabanı bulunamadı: {db}", file=sys.stderr)
        print("Yolu --db ile verin.", file=sys.stderr)
        return 1

    hedef = (secenek.veri or veri_yolu()) / "harcama"
    if hedef.exists() and any(hedef.glob("*.json")) and not secenek.uzerine_yaz and not secenek.kuru:
        print(f"{hedef} zaten dolu. Üzerine yazmak için --uzerine-yaz verin.", file=sys.stderr)
        return 1

    baglanti = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    baglanti.row_factory = sqlite3.Row

    ayarlar_ham = {s["Key"]: s["Value"] for s in satirlar(baglanti, "Settings")}
    try:
        baslangic_gunu = int(ayarlar_ham.get("app.periodStartDay", "1"))
    except ValueError:
        baslangic_gunu = 1

    tanimlar = {
        "ayarlar": {
            "simge": ayarlar_ham.get("app.currency") or "₺",
            "donemBaslangicGunu": min(28, max(1, baslangic_gunu)),
        },
        "kategoriler": [
            {
                "id": kimlik(k["Id"]),
                "ad": k["Name"],
                "tur": TUR.get(k["Kind"], "gider"),
                "renk": al(k, "Color", "#5b8def"),
                "simge": al(k, "Icon", ""),
                "arsiv": bool(al(k, "Archived", 0)),
                "sira": al(k, "SortOrder", 0),
            }
            for k in satirlar(baglanti, "Categories")
        ],
        "hesaplar": [
            {
                "id": kimlik(h["Id"]),
                "ad": h["Name"],
                "tur": HESAP_TURU.get(h["Type"], "nakit"),
                "renk": al(h, "Color", "#5b8def"),
                "simge": al(h, "Icon", ""),
                "acilisKurus": al(h, "OpeningBalanceMinor", 0),
                "referans": al(h, "Reference", ""),
                "arsiv": bool(al(h, "Archived", 0)),
                "sira": al(h, "SortOrder", 0),
            }
            for h in satirlar(baglanti, "Accounts")
        ],
        "butceler": [
            {"kategoriId": kimlik(b["CategoryId"]), "sinirKurus": b["MonthlyLimitMinor"]}
            for b in satirlar(baglanti, "Budgets")
        ],
        "duzenliler": [
            {
                "id": kimlik(d["Id"]),
                "ad": d["Name"],
                "kategoriId": kimlik(d["CategoryId"]),
                "tur": TUR.get(d["Kind"], "gider"),
                "kurus": abs(d["AmountMinor"]),
                "ayinGunu": min(31, max(1, al(d, "DayOfMonth", 1))),
                "karsiTaraf": al(d, "Payee", ""),
                "odeme": ODEME.get(al(d, "Method", 3), "diger"),
                "hesapId": kimlik(al(d, "AccountId")),
                "baslangic": tarih(d["StartDate"]),
                "bitis": tarih(al(d, "EndDate")),
                "durdu": bool(al(d, "Paused", 0)),
            }
            for d in satirlar(baglanti, "RecurringRules")
        ],
    }

    islem_sutunlari = sutunlar(baglanti, "Transactions")
    aylar: dict[str, list[dict]] = defaultdict(list)

    for i in satirlar(baglanti, "Transactions"):
        gun = tarih(i["OccurredOn"])
        if not gun:
            continue
        islem = {
            "id": kimlik(i["Id"]),
            "kategoriId": kimlik(i["CategoryId"]),
            "tur": TUR.get(i["Kind"], "gider"),
            "kurus": abs(i["AmountMinor"]),
            "tarih": gun,
            "not": al(i, "Note", ""),
            "karsiTaraf": al(i, "Payee", ""),
            "odeme": ODEME.get(al(i, "Method", 3), "diger"),
            "hesapId": kimlik(al(i, "AccountId")),
            "transfer": bool(al(i, "IsTransfer", 0)),
        }
        eklendi = tarih(al(i, "CreatedAtUtc"))
        if eklendi:
            islem["eklendi"] = eklendi
        if "RecurringRuleId" in islem_sutunlari and al(i, "RecurringRuleId") is not None:
            islem["duzenliId"] = kimlik(i["RecurringRuleId"])
        # İçe aktarma arayüzü henüz yok ama parmak izi taşınıyor: ileride aynı
        # ekstre yüklendiğinde mükerrer satırı geçmişe dönük yakalayabilsin.
        if al(i, "ImportHash") is not None:
            islem["ekstreIzi"] = i["ImportHash"]
        if al(i, "ImportBatchId") is not None:
            islem["partiId"] = kimlik(i["ImportBatchId"])

        aylar[gun[:7]].append(islem)

    baglanti.close()

    yaz(hedef / "tanimlar.json", tanimlar, secenek.kuru)
    for ay in sorted(aylar):
        aylar[ay].sort(key=lambda x: (x["tarih"], x["id"]))
        yaz(hedef / f"{ay}.json", {"ay": ay, "islemler": aylar[ay]}, secenek.kuru)

    toplam = sum(len(g) for g in aylar.values())
    gunler = sorted(i["tarih"] for g in aylar.values() for i in g)

    print(f"Kaynak : {db}")
    print(f"Hedef  : {hedef}{' (kuru koşum, yazılmadı)' if secenek.kuru else ''}")
    print(
        f"Tanım  : {len(tanimlar['kategoriler'])} kategori · {len(tanimlar['hesaplar'])} hesap · "
        f"{len(tanimlar['butceler'])} bütçe · {len(tanimlar['duzenliler'])} düzenli kural"
    )
    print(f"İşlem  : {toplam} kayıt, {len(aylar)} ay dosyası")
    if gunler:
        print(f"Aralık : {gunler[0]} … {gunler[-1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
