import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DURUM_ISARETI, type Hafta as HaftaTipi, type Slot } from "@ortak/plan";
import { siklikMetni, siklikOku } from "@ortak/ozet";
import {
  dakika,
  gununSlotlari,
  haftalikYuk,
  ihlaller,
  yeniSlotId,
  type KuralSeti,
} from "@ortak/kural";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { saatMetni, usePlanVerisi } from "@/veri/plan";
import s from "./hafta.module.css";

/**
 * Hafta ekranı: slot düzenleme, günlük ızgara, sosyal kota, kural uyarıları.
 *
 * Yazma `useDosya` üzerinden gidiyor — atomik, yedekli ve çakışma kontrollü.
 * Eski uygulama ya da sabah mutabakatı aynı dosyayı değiştirdiyse yazma
 * yapılmaz, güncel hâl yüklenir.
 *
 * Todoist'e gönderme burada YOK: o Faz 5'in son adımı. Bugün olduğu gibi,
 * işaretleme dosyaya yazılır, eşitleme ayrı bir iştir.
 */

const DURUM_SIRASI = ["planli", "yapildi", "kacti", "tasindi"];

/* --- yan panel ---------------------------------------------------------- */

function SlotPaneli({
  slot,
  kurallar,
  gunler,
  onDegis,
  onSil,
  onKapat,
}: {
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
    <aside className={s.panel}>
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

/* --- ekran -------------------------------------------------------------- */

export function Hafta() {
  const { haftalar, kurallar, bugun, yukleniyor: listeYukleniyor } = usePlanVerisi();
  const [kod, setKod] = useState<string | null>(null);

  // Açılışta bugünü içeren hafta seçilir; yoksa en sonuncusu.
  useEffect(() => {
    if (kod || haftalar.length === 0) return;
    const iceren = haftalar.find((h) => {
      const t = h.veri.gunler.map((g) => g.isoTarih).filter(Boolean);
      return t.length > 0 && t[0]! <= bugun && bugun <= t[t.length - 1]!;
    });
    setKod(iceren?.kod ?? haftalar[haftalar.length - 1]!.kod);
  }, [haftalar, bugun, kod]);

  const kodlar = haftalar.map((h) => h.kod);
  const indeks = kod ? kodlar.indexOf(kod) : -1;

  if (listeYukleniyor || !kod) {
    return (
      <>
        <EkranBasi baslik="Hafta" />
        <Kart>{listeYukleniyor ? <Yuklenirken /> : <BosDurum baslik="Hafta dosyası yok" />}</Kart>
      </>
    );
  }

  return (
    <HaftaIcerik
      kod={kod}
      kurallar={kurallar as KuralSeti}
      bugun={bugun}
      onceki={indeks > 0 ? kodlar[indeks - 1]! : null}
      sonraki={indeks >= 0 && indeks < kodlar.length - 1 ? kodlar[indeks + 1]! : null}
      onGec={setKod}
    />
  );
}

function HaftaIcerik({
  kod,
  kurallar,
  bugun,
  onceki,
  sonraki,
  onGec,
}: {
  kod: string;
  kurallar: KuralSeti;
  bugun: string;
  onceki: string | null;
  sonraki: string | null;
  onGec: (k: string) => void;
}) {
  const { veri, yukleniyor, hata, disaridanDegisti, yaz } = useDosya<HaftaTipi>(`${kod}.json`);
  const [seciliId, setSeciliId] = useState<string | null>(null);

  const uyarilar = useMemo(
    () => (veri ? ihlaller(veri, kurallar) : []),
    [veri, kurallar],
  );

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Hafta" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  if (!veri) {
    return (
      <>
        <EkranBasi baslik="Hafta" />
        <Kart>
          <BosDurum baslik={`${kod}.json okunamadı`} metin={hata ?? undefined} />
        </Kart>
      </>
    );
  }

  const secili = veri.slotlar.find((x) => x.id === seciliId) ?? null;
  const yuk = haftalikYuk(veri);
  const hedef = kurallar.kapasite.haftalikHedefDk;

  const kaydet = (y: HaftaTipi) => void yaz(y);
  const slotDegis = (y: Slot) =>
    kaydet({ ...veri, slotlar: veri.slotlar.map((x) => (x.id === y.id ? y : x)) });

  const slotSil = (id: string) => {
    kaydet({ ...veri, slotlar: veri.slotlar.filter((x) => x.id !== id) });
    setSeciliId(null);
  };

  /** Durum işaretine tıklayınca sırayla döner: ☐ → ☑ → ⊘ → ☐. */
  const durumDondur = (x: Slot) => {
    const i = DURUM_SIRASI.indexOf(x.durum);
    const yeni = DURUM_SIRASI[(i + 1) % 3] ?? "planli";
    slotDegis({ ...x, durum: yeni });
  };

  const slotEkle = (gunNo: number) => {
    const gunSlot = gununSlotlari(veri, gunNo);
    const sonuncu = gunSlot[gunSlot.length - 1];
    const saat = sonuncu
      ? `${String(Math.min(22, Math.floor((dakika(sonuncu.saat) + sonuncu.sureDk + 15) / 60))).padStart(2, "0")}:00`
      : "19:00";
    const id = yeniSlotId(veri, gunNo, saat);
    const yeni: Slot = {
      id,
      gun: gunNo,
      saat,
      sureDk: 60,
      alan: kurallar.alanlar?.[0] ?? "Serbest",
      konu: "",
      durum: "planli",
    };
    kaydet({
      ...veri,
      slotlar: [...veri.slotlar, yeni],
      kullanilmisIdler: [...(veri.kullanilmisIdler ?? []), id],
    });
    setSeciliId(id);
  };

  const ofisGunuDegis = (no: number) => {
    const mevcut = veri.ofisGunleri ?? [];
    kaydet({
      ...veri,
      ofisGunleri: mevcut.includes(no)
        ? mevcut.filter((x) => x !== no)
        : [...mevcut, no].sort((a, b) => a - b),
    });
  };

  const aliskanlikDegis = (ad: string, gunNo: number) => {
    kaydet({
      ...veri,
      gunlukAliskanliklar: (veri.gunlukAliskanliklar ?? []).map((a) => {
        if (a.ad !== ad) return a;
        const gunler = { ...(a.gunler ?? {}) };
        if (gunler[String(gunNo)]) delete gunler[String(gunNo)];
        else gunler[String(gunNo)] = true;
        return { ...a, gunler };
      }),
    });
  };

  const kotaDegis = (alan: "haftaSonu" | "haftaIci") => {
    const k = veri.sosyalKota ?? {};
    kaydet({ ...veri, sosyalKota: { ...k, [alan]: !k[alan] } });
  };

  const kota = veri.sosyalKota ?? {};

  return (
    <>
      <EkranBasi
        baslik={veri.baslik || `Hafta ${veri.hafta}`}
        altyazi={`${saatMetni(yuk)} planlı · hedef ${saatMetni(hedef)}${
          disaridanDegisti ? " · dosya dışarıdan güncellendi" : ""
        }`}
        sag={
          <div className={s.gez}>
            <Dugme
              tur="sade"
              ikon={<ChevronLeft size={16} />}
              disabled={!onceki}
              onClick={() => onceki && onGec(onceki)}
              aria-label="Önceki hafta"
            />
            <Etiket tur={veri.durum === "kapandi" ? "iyi" : "vurgu"}>
              {veri.durum || "aktif"}
            </Etiket>
            <Dugme
              tur="sade"
              ikon={<ChevronRight size={16} />}
              disabled={!sonraki}
              onClick={() => sonraki && onGec(sonraki)}
              aria-label="Sonraki hafta"
            />
          </div>
        }
      />

      {hata && (
        <div className={s.uyari} style={{ marginBottom: "var(--b5)" }}>
          <span className={s.uyariSatir}>{hata}</span>
        </div>
      )}

      <div className={seciliId ? `${s.duzen} ${s.duzenPanelli}` : s.duzen}>
        <div className={s.sol}>
          {uyarilar.length > 0 && (
            <div className={s.uyari}>
              <span className={s.uyariBas}>
                <AlertTriangle size={12} style={{ verticalAlign: "-1px" }} /> Kural uyarısı
              </span>
              {uyarilar.map((u) => (
                <span key={u} className={s.uyariSatir}>
                  {u}
                </span>
              ))}
            </div>
          )}

          <Kart dolgulu={false}>
            <div className={s.bilgi}>
              <span className={s.bilgiParca}>Ofis günleri</span>
              <div className={s.gunSecim}>
                {veri.gunler.map((g) => (
                  <button
                    key={g.no}
                    type="button"
                    className={
                      (veri.ofisGunleri ?? []).includes(g.no)
                        ? `${s.gunKutu} ${s.gunKutuSecili}`
                        : s.gunKutu
                    }
                    onClick={() => ofisGunuDegis(g.no)}
                    title={g.ad}
                  >
                    {g.ad.slice(0, 2)}
                  </button>
                ))}
              </div>

              <span className={s.bilgiParca}>Sosyal kota</span>
              <div className={s.gunSecim}>
                <button
                  type="button"
                  className={kota.haftaSonu ? `${s.gunKutu} ${s.gunKutuSecili}` : s.gunKutu}
                  style={{ width: "auto", padding: "0 10px" }}
                  onClick={() => kotaDegis("haftaSonu")}
                >
                  hafta sonu
                </button>
                <button
                  type="button"
                  className={kota.haftaIci ? `${s.gunKutu} ${s.gunKutuSecili}` : s.gunKutu}
                  style={{ width: "auto", padding: "0 10px" }}
                  onClick={() => kotaDegis("haftaIci")}
                >
                  hafta içi
                </button>
              </div>
            </div>
          </Kart>

          {(veri.gunlukAliskanliklar ?? []).length > 0 && (
            <Kart dolgulu={false} baslik="Günlük" not="kaçan gün telafi edilmez">
              <table className={s.izgara}>
                <thead>
                  <tr>
                    <th>Alışkanlık</th>
                    {veri.gunler.map((g) => (
                      <th key={g.no}>{g.ad.slice(0, 2)}</th>
                    ))}
                    <th className={s.izgaraSon}>&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {(veri.gunlukAliskanliklar ?? []).map((a) => {
                    const sik = siklikOku(a, bugun);
                    const yapilanSayi = veri.gunler.filter((g) => (a.gunler ?? {})[String(g.no)])
                      .length;
                    return (
                      <tr key={a.ad}>
                        <td>
                          <span className={s.aliskanlikAd}>{a.ad}</span>
                          <span className={s.aliskanlikSiklik}>{siklikMetni(sik)}</span>
                        </td>
                        {veri.gunler.map((g) => {
                          const yapildi = Boolean((a.gunler ?? {})[String(g.no)]);
                          const bek = a.beklenenGunler;
                          const bekleniyor = !Array.isArray(bek) || bek.includes(g.no);
                          return (
                            <td key={g.no}>
                              <button
                                type="button"
                                className={[
                                  s.hucre,
                                  yapildi && s.hucreYapildi,
                                  !bekleniyor && !yapildi && s.hucreBeklenmiyor,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => aliskanlikDegis(a.ad, g.no)}
                                aria-label={`${a.ad} · ${g.ad}`}
                              >
                                {yapildi ? "☑" : "☐"}
                              </button>
                            </td>
                          );
                        })}
                        <td className={s.izgaraSon}>
                          {yapilanSayi}/
                          {Array.isArray(a.beklenenGunler)
                            ? a.beklenenGunler.length
                            : veri.gunler.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Kart>
          )}

          <Kart dolgulu={false} baslik="Slotlar" not={`${veri.slotlar.length} slot`}>
            {veri.gunler.map((g) => {
              const gunSlot = gununSlotlari(veri, g.no);
              const ofis = (veri.ofisGunleri ?? []).includes(g.no);
              return (
                <div key={g.no}>
                  <div className={s.gunBasi}>
                    <span className={s.gunAd}>{g.ad}</span>
                    <span className={s.gunTarih}>{g.tarih}</span>
                    {g.isoTarih === bugun && <Etiket tur="vurgu">bugün</Etiket>}
                    <span className={s.gunEtiket}>
                      {ofis && <Etiket tur="uyari">ofis</Etiket>}
                    </span>
                  </div>

                  {gunSlot.length === 0 ? (
                    <p className={s.bosGun}>—</p>
                  ) : (
                    gunSlot.map((x) => (
                      <div
                        key={x.id}
                        className={x.id === seciliId ? `${s.slot} ${s.slotSecili}` : s.slot}
                        onClick={() => setSeciliId(x.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setSeciliId(x.id)}
                      >
                        <button
                          type="button"
                          className={s.isaretDugme}
                          onClick={(e) => {
                            e.stopPropagation();
                            durumDondur(x);
                          }}
                          title="Durumu değiştir"
                          aria-label={`${x.konu || x.alan} durumu`}
                        >
                          {DURUM_ISARETI[x.durum] ?? "☐"}
                        </button>
                        <span className={s.slotSaat}>{x.saat}</span>
                        <span className={s.slotGovde}>
                          <span className={s.slotAlan}>{x.alan}</span>
                          <span className={s.slotKonu}>{x.konu}</span>
                        </span>
                        <span className={s.slotSure}>{x.sureDk} dk</span>
                      </div>
                    ))
                  )}

                  <div className={s.gunDip}>
                    <Dugme
                      tur="sade"
                      ikon={<Plus size={14} />}
                      onClick={() => slotEkle(g.no)}
                    >
                      Slot ekle
                    </Dugme>
                  </div>
                </div>
              );
            })}
          </Kart>
        </div>

        {secili && (
          <SlotPaneli
            slot={secili}
            kurallar={kurallar}
            gunler={veri.gunler}
            onDegis={slotDegis}
            onSil={() => slotSil(secili.id)}
            onKapat={() => setSeciliId(null)}
          />
        )}
      </div>
    </>
  );
}
