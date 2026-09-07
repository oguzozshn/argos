"""Argos uygulama ikonunu üretir: `python araclar/ikon-uret.py`

Çıktı: build/icon.ico (electron-builder'ın varsayılan aradığı yer) ve
build/icon-256.png (önizleme için).

Dış bağımlılık yok — PNG ve ICO elle kodlanıyor. Sisteme paket kurmamak için
böyle; ikonun kaynağı da depoda kalsın diye.

Tasarım: Argos Panoptes, her şeyi gören bekçi. Uygulamanın vurgu renginde
yuvarlatılmış kare, üzerinde kâğıt renginde bir göz. 16 pikselde de okunsun
diye tek ve büyük bir biçim; ince ayrıntı yok.
"""

import math
import struct
import sys
import zlib
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
CIKTI = KOK / "build"

# token.css ile aynı renkler.
VURGU = (0x4C, 0x63, 0xB6, 255)
KAGIT = (0xF5, 0xF4, 0xF0, 255)
GOZBEBEGI = (0x2B, 0x2E, 0x52, 255)
PARILTI = (0xFF, 0xFF, 0xFF, 255)
SEFFAF = (0, 0, 0, 0)

BOYUTLAR = [16, 24, 32, 48, 64, 128, 256]
ORNEK = 4  # kenar yumuşatma için alt piksel örneklemesi

# Badem biçimi iki dairenin kesişimi. Genişlik 0.62, yükseklik 0.34 olacak
# şekilde çözüldü: sqrt(R²-d²) = 0.31 ve R - d = 0.17.
BADEM_D = 0.1976
BADEM_R = BADEM_D + 0.17

KOSE = 0.22  # yuvarlatma yarıçapı (kenar uzunluğuna oranla)
KENAR = 0.03  # dış boşluk


def yuvarlak_karede(x: float, y: float) -> bool:
    """İç dikdörtgene olan uzaklık yarıçaptan küçükse içeridedir."""
    a, b = KENAR, 1.0 - KENAR
    r = KOSE
    cx = min(max(x, a + r), b - r)
    cy = min(max(y, a + r), b - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def bademde(x: float, y: float) -> bool:
    ust = (x - 0.5) ** 2 + (y - (0.5 + BADEM_D)) ** 2 <= BADEM_R**2
    alt = (x - 0.5) ** 2 + (y - (0.5 - BADEM_D)) ** 2 <= BADEM_R**2
    return ust and alt


def dairede(x: float, y: float, cx: float, cy: float, r: float) -> bool:
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def renk(x: float, y: float):
    if not yuvarlak_karede(x, y):
        return SEFFAF
    if dairede(x, y, 0.455, 0.452, 0.035):
        return PARILTI
    if dairede(x, y, 0.5, 0.5, 0.105):
        return GOZBEBEGI
    if bademde(x, y):
        return KAGIT
    return VURGU


def piksel_uret(boyut: int) -> bytes:
    veri = bytearray()
    adim = 1.0 / (boyut * ORNEK)
    for py in range(boyut):
        for px in range(boyut):
            r = g = b = a = 0
            for sy in range(ORNEK):
                for sx in range(ORNEK):
                    x = (px * ORNEK + sx + 0.5) * adim
                    y = (py * ORNEK + sy + 0.5) * adim
                    c = renk(x, y)
                    # Alfa ağırlıklı toplam: şeffaf kenarlarda renk taşmasın.
                    r += c[0] * c[3]
                    g += c[1] * c[3]
                    b += c[2] * c[3]
                    a += c[3]
            n = ORNEK * ORNEK
            if a == 0:
                veri += bytes((0, 0, 0, 0))
            else:
                veri += bytes((round(r / a), round(g / a), round(b / a), round(a / n)))
    return bytes(veri)


def parca(tur: bytes, govde: bytes) -> bytes:
    return (
        struct.pack(">I", len(govde))
        + tur
        + govde
        + struct.pack(">I", zlib.crc32(tur + govde) & 0xFFFFFFFF)
    )


def png_yaz(boyut: int, piksel: bytes) -> bytes:
    ham = b"".join(
        b"\x00" + piksel[y * boyut * 4 : (y + 1) * boyut * 4] for y in range(boyut)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + parca(b"IHDR", struct.pack(">IIBBBBB", boyut, boyut, 8, 6, 0, 0, 0))
        + parca(b"IDAT", zlib.compress(ham, 9))
        + parca(b"IEND", b"")
    )


def ico_yaz(pngler: list[tuple[int, bytes]]) -> bytes:
    bas = struct.pack("<HHH", 0, 1, len(pngler))
    kayit_boyu = 16
    ofset = len(bas) + kayit_boyu * len(pngler)
    kayitlar = b""
    govde = b""
    for boyut, veri in pngler:
        # 256 piksel ICO'da 0 olarak yazılır.
        kayitlar += struct.pack(
            "<BBBBHHII",
            0 if boyut == 256 else boyut,
            0 if boyut == 256 else boyut,
            0,
            0,
            1,
            32,
            len(veri),
            ofset,
        )
        govde += veri
        ofset += len(veri)
    return bas + kayitlar + govde


def main() -> int:
    CIKTI.mkdir(exist_ok=True)
    pngler = []
    for boyut in BOYUTLAR:
        veri = png_yaz(boyut, piksel_uret(boyut))
        pngler.append((boyut, veri))
        print(f"  {boyut}x{boyut}  {len(veri):>6} bayt")

    ico = CIKTI / "icon.ico"
    ico.write_bytes(ico_yaz(pngler))
    (CIKTI / "icon-256.png").write_bytes(dict(pngler)[256])
    print(f"\n{ico} — {ico.stat().st_size} bayt, {len(BOYUTLAR)} boy")
    return 0


if __name__ == "__main__":
    sys.exit(main())
