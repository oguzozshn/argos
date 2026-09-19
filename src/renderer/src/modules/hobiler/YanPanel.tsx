import { Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Dugme } from "@/ui/bilesenler";
import s from "./hobiler.module.css";
import type { Alan, Madde } from "./tipler";

const tarihYil = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const tarihKisa = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" });

/** "2026-09-05" → "5 Eylül"; başka yıldansa yıl da yazılır. */
function tarihYaz(iso: string): string {
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
}: {
  alan: Alan;
  madde: Madde;
  onDegis: (yeni: Madde) => void;
  onSil: () => void;
  onKapat: () => void;
}) {
  // Ad tuş tuş yazılmıyor: bir an boş kalan ad listede "Adsız" diye
  // görünür, liste de her harfte yeniden dizilirdi. Taslak, alandan çıkınca yazılır.
  const [taslak, setTaslak] = useState<string | null>(null);

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
        <label className={s.etiketMetni} htmlFor="panel-not">
          Not
        </label>
        <textarea
          id="panel-not"
          className={s.notAlani}
          value={madde.not}
          rows={1}
          placeholder="Not ekle…"
          onChange={(e) => onDegis({ ...madde, not: e.target.value })}
        />
      </div>

      <div className={s.panelDip}>
        <span className={s.eklendi}>Eklendi {tarihYaz(madde.eklendi)}</span>
        <Dugme tur="tehlike" ikon={<Trash2 size={15} />} onClick={onSil}>
          Sil
        </Dugme>
      </div>
    </aside>
  );
}
