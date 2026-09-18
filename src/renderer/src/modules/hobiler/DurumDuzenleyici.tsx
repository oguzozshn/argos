import { GripVertical, Plus, X } from "lucide-react";
import { useState } from "react";
import { Dugme } from "@/ui/bilesenler";
import s from "./hobiler.module.css";
import { PALET, type Alan, type Durum } from "./tipler";

/**
 * Durumları düzenler: ad, renk, sıra, ekleme, silme.
 *
 * İki kural veri kaybını engelliyor:
 * 1. Ad değişince o durumdaki maddelerin `durum` alanı da güncellenir —
 *    maddeler durumun ADIYLA bağlı, sırasıyla değil.
 * 2. İçinde kayıt olan durum silinirken nereye taşınacağı sorulur.
 */
export function DurumDuzenleyici({
  alan,
  onDegis,
  onKapat,
}: {
  alan: Alan;
  onDegis: (yeni: Alan) => void;
  onKapat: () => void;
}) {
  const [renkAcik, setRenkAcik] = useState<number | null>(null);
  const [silinecek, setSilinecek] = useState<number | null>(null);
  const [tasiHedef, setTasiHedef] = useState<string>("");
  const [surukleniyor, setSurukleniyor] = useState<number | null>(null);
  const [uzerinde, setUzerinde] = useState<number | null>(null);
  /**
   * Ad yazılırken tuş tuş kaydedilmiyor. Ad bir an boş kalınca durum listeden
   * düşüyor, maddeleri de boş durumla kalıyordu; başka bir durumun adından
   * geçerken de harfler yutuluyordu. Taslak, alandan çıkınca yazılır.
   */
  const [taslak, setTaslak] = useState<{ i: number; ad: string } | null>(null);

  const taslagiYaz = () => {
    if (!taslak) return;
    const ad = taslak.ad.trim();
    setTaslak(null);
    if (ad && ad !== alan.durumlar[taslak.i]?.ad) adDegistir(taslak.i, ad);
  };

  const yaz = (durumlar: Durum[], maddeler = alan.maddeler) =>
    onDegis({ ...alan, durumlar, maddeler });

  const adDegistir = (i: number, yeniAd: string) => {
    const eski = alan.durumlar[i]!.ad;
    // Başka bir durumla aynı ada çakışırsa yazma — iki durum tek isim olamaz.
    if (alan.durumlar.some((d, j) => j !== i && d.ad === yeniAd)) return;
    const durumlar = alan.durumlar.map((d, j) => (j === i ? { ...d, ad: yeniAd } : d));
    const maddeler = alan.maddeler.map((m) => (m.durum === eski ? { ...m, durum: yeniAd } : m));
    yaz(durumlar, maddeler);
  };

  const renkDegistir = (i: number, renk: string) => {
    yaz(alan.durumlar.map((d, j) => (j === i ? { ...d, renk } : d)));
    setRenkAcik(null);
  };

  const ekle = () => {
    let ad = "yeni durum";
    let n = 2;
    while (alan.durumlar.some((d) => d.ad === ad)) ad = `yeni durum ${n++}`;
    yaz([...alan.durumlar, { ad, renk: PALET[alan.durumlar.length % PALET.length]! }]);
  };

  const silmeyiBaslat = (i: number) => {
    const ad = alan.durumlar[i]!.ad;
    const sayi = alan.maddeler.filter((m) => m.durum === ad).length;
    if (sayi === 0) {
      yaz(alan.durumlar.filter((_, j) => j !== i));
      return;
    }
    setSilinecek(i);
    setTasiHedef(alan.durumlar.find((_, j) => j !== i)?.ad ?? "");
  };

  const silmeyiBitir = () => {
    if (silinecek === null || !tasiHedef) return;
    const ad = alan.durumlar[silinecek]!.ad;
    yaz(
      alan.durumlar.filter((_, j) => j !== silinecek),
      alan.maddeler.map((m) => (m.durum === ad ? { ...m, durum: tasiHedef } : m)),
    );
    setSilinecek(null);
  };

  const birak = (hedef: number) => {
    if (surukleniyor === null || surukleniyor === hedef) return;
    const yeni = [...alan.durumlar];
    const [tasinan] = yeni.splice(surukleniyor, 1);
    yeni.splice(hedef, 0, tasinan!);
    yaz(yeni);
    setSurukleniyor(null);
    setUzerinde(null);
  };

  return (
    <aside className={s.panel}>
      <div className={s.panelBas}>
        <div style={{ flex: 1 }}>
          <p className={s.panelUst}>{alan.ad}</p>
          <h2 className={s.panelBaslik}>Durumlar</h2>
        </div>
        <Dugme tur="sade" ikon={<X size={16} />} onClick={onKapat} aria-label="Kapat" />
      </div>

      <p className={s.eklendi}>Sürükleyerek sırala, adına tıklayarak değiştir.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {alan.durumlar.map((d, i) => (
          <div key={i}>
            <div
              className={[
                s.durumSatir,
                surukleniyor === i && s.durumSurukleniyor,
                uzerinde === i && surukleniyor !== null && s.durumHedef,
              ]
                .filter(Boolean)
                .join(" ")}
              onDragOver={(e) => {
                e.preventDefault();
                setUzerinde(i);
              }}
              onDrop={() => birak(i)}
            >
              <span
                className={s.tutamak}
                draggable
                onDragStart={() => setSurukleniyor(i)}
                onDragEnd={() => {
                  setSurukleniyor(null);
                  setUzerinde(null);
                }}
              >
                <GripVertical size={15} />
              </span>
              <button
                type="button"
                className={s.renkDugme}
                style={{ background: d.renk }}
                onClick={() => setRenkAcik(renkAcik === i ? null : i)}
                aria-label={`${d.ad} rengi`}
              />
              <input
                className={s.durumGiris}
                value={taslak?.i === i ? taslak.ad : d.ad}
                onChange={(e) => setTaslak({ i, ad: e.target.value })}
                onBlur={taslagiYaz}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setTaslak(null);
                }}
                aria-label="Durum adı"
              />
              {alan.durumlar.length > 1 && (
                <Dugme
                  tur="sade"
                  ikon={<X size={14} />}
                  onClick={() => silmeyiBaslat(i)}
                  aria-label={`${d.ad} durumunu sil`}
                />
              )}
            </div>

            {renkAcik === i && (
              <div className={s.renkSecim}>
                {PALET.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={s.renkDugme}
                    style={{ background: r, width: "100%", height: 16 }}
                    onClick={() => renkDegistir(i, r)}
                    aria-label={`Renk ${r}`}
                  />
                ))}
              </div>
            )}

            {silinecek === i && (
              <div className={s.silmeOnay}>
                <span>
                  "{d.ad}" durumunda{" "}
                  {alan.maddeler.filter((m) => m.durum === d.ad).length} kayıt var. Nereye taşınsın?
                </span>
                <select
                  className={s.secim}
                  value={tasiHedef}
                  onChange={(e) => setTasiHedef(e.target.value)}
                >
                  {alan.durumlar
                    .filter((_, j) => j !== i)
                    .map((x) => (
                      <option key={x.ad} value={x.ad}>
                        {x.ad}
                      </option>
                    ))}
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <Dugme tur="dolu" onClick={silmeyiBitir}>
                    Taşı ve sil
                  </Dugme>
                  <Dugme tur="sade" onClick={() => setSilinecek(null)}>
                    Vazgeç
                  </Dugme>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dugme ikon={<Plus size={15} />} onClick={ekle}>
        Durum ekle
      </Dugme>
    </aside>
  );
}
