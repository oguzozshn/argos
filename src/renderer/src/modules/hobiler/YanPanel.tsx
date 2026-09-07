import { Trash2, X } from "lucide-react";
import { Dugme, Giris } from "@/ui/bilesenler";
import s from "./hobiler.module.css";
import { durumRengi, type Alan, type Madde } from "./tipler";

/**
 * Seçili kaydın paneli. Satır-içi açılır düzenleyicinin yerine geçti:
 * not alanı çok satırlı, liste yerinden oynamıyor.
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
  return (
    <aside className={s.panel}>
      <div className={s.panelBas}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className={s.panelUst}>{alan.ad}</p>
          <h2 className={s.panelBaslik}>{madde.ad || "Adsız"}</h2>
        </div>
        <Dugme tur="sade" ikon={<X size={16} />} onClick={onKapat} aria-label="Paneli kapat" />
      </div>

      <div>
        <label className={s.etiketMetni} htmlFor="panel-ad">
          Ad
        </label>
        <Giris
          id="panel-ad"
          value={madde.ad}
          onChange={(e) => onDegis({ ...madde, ad: e.target.value })}
        />
      </div>

      <div>
        <label className={s.etiketMetni} htmlFor="panel-durum">
          Durum
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={s.durumNokta}
            style={{ background: durumRengi(alan.durumlar, madde.durum) }}
          />
          <select
            id="panel-durum"
            className={s.secim}
            style={{ flex: 1 }}
            value={madde.durum}
            onChange={(e) => onDegis({ ...madde, durum: e.target.value })}
          >
            {alan.durumlar.map((d) => (
              <option key={d.ad} value={d.ad}>
                {d.ad}
              </option>
            ))}
          </select>
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
          placeholder="Nerede kaldın, kimden duydun, nereden alınacak…"
          onChange={(e) => onDegis({ ...madde, not: e.target.value })}
        />
      </div>

      <div className={s.panelDip}>
        <span className={s.eklendi}>Eklendi: {madde.eklendi}</span>
        <Dugme tur="tehlike" ikon={<Trash2 size={15} />} onClick={onSil}>
          Sil
        </Dugme>
      </div>
    </aside>
  );
}
