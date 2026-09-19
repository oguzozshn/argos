import { Trash2, X } from "lucide-react";
import type { KuralSeti } from "@ortak/kural";
import { DURUM_ISARETI, type Slot } from "@ortak/plan";
import { DURUM_SIRASI } from "@ortak/plan-islem";
import { Dugme, Giris } from "./bilesenler";
import s from "./slotPaneli.module.css";

/**
 * Bir slotun düzenleme paneli: alan, konu, gün, saat, süre, durum, esneklik.
 * Hafta ekranı ve Takvim aynı paneli kullanır. Değişiklik anında `onDegis`
 * ile verilir; yazmak çağıranın işi.
 */
export function SlotPaneli({
  slot,
  kurallar,
  gunler,
  onDegis,
  onSil,
  onKapat,
  gomulu = false,
}: {
  /** Başka bir panelin içinde: kendi kart çerçevesi olmadan. */
  gomulu?: boolean;
  slot: Slot;
  kurallar: KuralSeti;
  gunler: { no: number; ad: string }[];
  onDegis: (y: Slot) => void;
  onSil: () => void;
  onKapat: () => void;
}) {
  const alanlar = kurallar.alanlar ?? [];
  const sureler = kurallar.sureSecenekleriDk ?? [30, 45, 60, 90, 120];

  return (
    <aside className={gomulu ? s.gomulu : s.panel}>
      <div className={s.panelBas}>
        <span className={s.panelKimlik}>{slot.id}</span>
        <Dugme tur="sade" ikon={<X size={16} />} onClick={onKapat} aria-label="Paneli kapat" />
      </div>

      <div>
        <label className={s.alanEtiket} htmlFor="slot-alan">
          Alan
        </label>
        <select
          id="slot-alan"
          className={s.secim}
          value={slot.alan}
          onChange={(e) => onDegis({ ...slot, alan: e.target.value })}
        >
          {[...new Set([...alanlar, slot.alan])].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={s.alanEtiket} htmlFor="slot-konu">
          Konu
        </label>
        <Giris
          id="slot-konu"
          value={slot.konu}
          placeholder="En fazla 3-4 kelime"
          onChange={(e) => onDegis({ ...slot, konu: e.target.value })}
        />
      </div>

      <div className={s.ikiliAlan}>
        <div>
          <label className={s.alanEtiket} htmlFor="slot-gun">
            Gün
          </label>
          <select
            id="slot-gun"
            className={s.secim}
            value={slot.gun}
            onChange={(e) => onDegis({ ...slot, gun: Number(e.target.value) })}
          >
            {gunler.map((g) => (
              <option key={g.no} value={g.no}>
                {g.ad}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={s.alanEtiket} htmlFor="slot-saat">
            Saat
          </label>
          <input
            id="slot-saat"
            className={s.secim}
            type="time"
            value={slot.saat}
            onChange={(e) => onDegis({ ...slot, saat: e.target.value })}
          />
        </div>
      </div>

      <div className={s.ikiliAlan}>
        <div>
          <label className={s.alanEtiket} htmlFor="slot-sure">
            Süre
          </label>
          <select
            id="slot-sure"
            className={s.secim}
            value={slot.sureDk}
            onChange={(e) => onDegis({ ...slot, sureDk: Number(e.target.value) })}
          >
            {[...new Set([...sureler, slot.sureDk])]
              .sort((a, b) => a - b)
              .map((d) => (
                <option key={d} value={d}>
                  {d} dk
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={s.alanEtiket} htmlFor="slot-durum">
            Durum
          </label>
          <select
            id="slot-durum"
            className={s.secim}
            value={slot.durum}
            onChange={(e) => onDegis({ ...slot, durum: e.target.value })}
          >
            {DURUM_SIRASI.map((d) => (
              <option key={d} value={d}>
                {DURUM_ISARETI[d]} {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Esnek slot korumalı alanda uyarı üretmez — telafi oraya konabilir. */}
      <label className={s.onay}>
        <input
          type="checkbox"
          checked={Boolean(slot.esnek)}
          onChange={(e) => onDegis({ ...slot, esnek: e.target.checked })}
        />
        Esnek (telafi) — korumalı alan uyarısı vermez
      </label>

      <div className={s.panelDip}>
        <span className={s.gunTarih}>{slot.sureDk} dk</span>
        <Dugme tur="tehlike" ikon={<Trash2 size={15} />} onClick={onSil}>
          Slotu sil
        </Dugme>
      </div>
    </aside>
  );
}
