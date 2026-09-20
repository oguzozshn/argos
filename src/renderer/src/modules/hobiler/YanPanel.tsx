import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { bugunIso } from "@ortak/plan";
import { Dugme } from "@/ui/bilesenler";
import s from "./hobiler.module.css";
import {
  kategoriCikar,
  kategoriEkle,
  kategorileriYaz,
  kategoriyiEsle,
  notDegistir,
  notEkle,
  notSil,
  notlariOku,
  type Alan,
  type Madde,
} from "./tipler";

const tarihYil = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const tarihKisa = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" });

/** "2026-09-05" → "5 Eylül"; başka yıldansa yıl da yazılır. */
function tarihYaz(iso: string | undefined): string {
  // Eski ya da dışarıdan gelen kayıtta alan olmayabilir; panel bu yüzden çökmesin.
  if (!iso) return "";
  const [y, a, g] = iso.split("-").map(Number);
  if (!y || !a || !g) return iso;
  const t = new Date(y, a - 1, g);
  return (y === new Date().getFullYear() ? tarihKisa : tarihYil).format(t);
}

/**
 * Seçili kaydın paneli. Form gibi değil, kart gibi: ad başlıkta düzenlenir
 * (ayrı bir "Ad" kutusu aynı şeyi ikinci kez yazıyordu), durum tek tıklık
 * çiplerle seçilir, not boşken tek satır yer tutar ve yazdıkça büyür.
 *
 * Kayıt değişince panel `key` ile yeniden kuruluyor; yarım kalmış ad taslağı
 * başka kayda taşınmaz.
 */
export function YanPanel({
  alan,
  madde,
  onDegis,
  onSil,
  onKapat,
  kategoriOnerileri,
}: {
  alan: Alan;
  madde: Madde;
  onDegis: (yeni: Madde) => void;
  onSil: () => void;
  onKapat: () => void;
  /** Alandaki diğer kayıtların kategorileri: aynı adı iki yazımla girmeyelim. */
  kategoriOnerileri: string[];
}) {
  // Ad tuş tuş yazılmıyor: bir an boş kalan ad listede "Adsız" diye
  // görünür, liste de her harfte yeniden dizilirdi. Taslak, alandan çıkınca yazılır.
  const [taslak, setTaslak] = useState<string | null>(null);

  const [kategoriTaslak, setKategoriTaslak] = useState("");
  const [taslakNot, setTaslakNot] = useState("");
  const notlar = notlariOku(madde);
  // Notlar alt alta: her biri ayrı satır, en yenisi üstte, tek tek silinir.
  const notuEkle = () => {
    if (!taslakNot.trim()) return;
    onDegis(notEkle(madde, taslakNot, bugunIso()));
    setTaslakNot("");
  };
  const kategoriler = madde.kategoriler ?? [];
  const oneriler = kategoriOnerileri.filter(
    (k) => !kategoriler.some((x) => x.toLocaleLowerCase("tr") === k.toLocaleLowerCase("tr")),
  );
  const kategoriyiEkle = (ham: string) => {
    const k = kategoriyiEsle(ham, kategoriOnerileri);
    const yeni = kategoriEkle(kategoriler, k);
    setKategoriTaslak("");
    if (yeni !== kategoriler) onDegis(kategorileriYaz(madde, yeni));
  };

  const adiYaz = () => {
    if (taslak === null) return;
    const ad = taslak.trim();
    setTaslak(null);
    if (ad && ad !== madde.ad) onDegis({ ...madde, ad });
  };

  return (
    <aside className={s.panel}>
      <div className={s.panelBas}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className={s.panelUst}>{alan.ad}</p>
          {taslak !== null ? (
            <input
              className={s.baslikGiris}
              value={taslak}
              autoFocus
              aria-label="Ad"
              onChange={(e) => setTaslak(e.target.value)}
              onBlur={adiYaz}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setTaslak(null);
              }}
            />
          ) : (
            <button
              type="button"
              className={s.baslikDugme}
              onClick={() => setTaslak(madde.ad)}
              title="Adı değiştir"
            >
              <span className={s.panelBaslik}>{madde.ad || "Adsız"}</span>
              <Pencil size={13} className={s.kalem} />
            </button>
          )}
        </div>
        <Dugme tur="sade" ikon={<X size={16} />} onClick={onKapat} aria-label="Paneli kapat" />
      </div>

      <div>
        <p className={s.etiketMetni} id="panel-durum">
          Durum
        </p>
        <div className={s.durumCipleri} role="radiogroup" aria-labelledby="panel-durum">
          {alan.durumlar.map((d) => {
            const secili = d.ad === madde.durum;
            return (
              <button
                key={d.ad}
                type="button"
                role="radio"
                aria-checked={secili}
                className={secili ? `${s.durumCip} ${s.durumCipSecili}` : s.durumCip}
                onClick={() => !secili && onDegis({ ...madde, durum: d.ad })}
              >
                <span className={s.durumNokta} style={{ background: d.renk }} />
                {d.ad}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={s.etiketMetni} htmlFor="panel-kategori">
          Kategoriler <span className={s.istege}>· isteğe bağlı</span>
        </label>
        {kategoriler.length > 0 && (
          <div className={s.durumCipleri} style={{ marginBottom: 6 }}>
            {kategoriler.map((k) => (
              <span key={k} className={s.kategoriCip}>
                {k}
                <button
                  type="button"
                  className={s.kategoriSil}
                  onClick={() => onDegis(kategorileriYaz(madde, kategoriCikar(kategoriler, k)))}
                  aria-label={`${k} kategorisini kaldır`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          id="panel-kategori"
          className={s.kategoriGiris}
          value={kategoriTaslak}
          list="panel-kategori-onerileri"
          placeholder={kategoriler.length ? "Bir tane daha…" : "Kategori ekle (RPG, Souls…)"}
          onChange={(e) => setKategoriTaslak(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              kategoriyiEkle(kategoriTaslak);
            }
          }}
          onBlur={() => kategoriTaslak.trim() && kategoriyiEkle(kategoriTaslak)}
        />
        <datalist id="panel-kategori-onerileri">
          {oneriler.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        {/* Önerilen kategoriler tek tıkla: yazmadan seçilebilsin. */}
        {oneriler.length > 0 && (
          <div className={s.oneriler}>
            {oneriler.slice(0, 8).map((k) => (
              <button key={k} type="button" className={s.oneri} onClick={() => kategoriyiEkle(k)}>
                + {k}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className={s.etiketMetni} htmlFor="panel-not">
          Notlar
        </label>
        <div className={s.notEkleSatir}>
          <textarea
            id="panel-not"
            className={s.notAlani}
            value={taslakNot}
            rows={1}
            placeholder="Not ekle… (Enter kaydeder, Shift+Enter satır atlar)"
            onChange={(e) => setTaslakNot(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              notuEkle();
            }}
            onBlur={notuEkle}
          />
          <Dugme
            tur="sade"
            ikon={<Plus size={15} />}
            onClick={notuEkle}
            disabled={!taslakNot.trim()}
            aria-label="Notu ekle"
          />
        </div>

        {notlar.map((n) => (
          <div key={n.id} className={s.notSatir}>
            <textarea
              className={s.notMetin}
              value={n.metin}
              rows={1}
              aria-label="Not"
              onChange={(e) => onDegis(notDegistir(madde, n.id, e.target.value))}
            />
            <span className={s.notTarih}>{tarihYaz(n.eklendi)}</span>
            <button
              type="button"
              className={s.notSil}
              onClick={() => onDegis(notSil(madde, n.id))}
              aria-label="Notu sil"
              title="Notu sil"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className={s.panelDip}>
        <span className={s.eklendi}>{madde.eklendi ? `Eklendi ${tarihYaz(madde.eklendi)}` : ""}</span>
        <Dugme tur="tehlike" ikon={<Trash2 size={15} />} onClick={onSil}>
          Sil
        </Dugme>
      </div>
    </aside>
  );
}
