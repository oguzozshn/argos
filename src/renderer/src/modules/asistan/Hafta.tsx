import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DURUM_ISARETI, type Hafta as HaftaTipi, type Slot } from "@ortak/plan";
import { siklikMetni, siklikOku } from "@ortak/ozet";
import { gunEkle } from "@ortak/gun";
import { aliskanlikCevir, slotDurumunuDondur, slotEkle as slotEkleIslem, slotTasi } from "@ortak/plan-islem";
import type { TodoistGorev } from "@ortak/tipler";
import { gununSlotlari, haftalikYuk, ihlaller, kuralSetiTamamla, type KuralSeti } from "@ortak/kural";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Yuklenirken } from "@/ui/bilesenler";
import { Kisayollar } from "@/ui/Kisayollar";
import { SlotPaneli } from "@/ui/SlotPaneli";
import { useDosya } from "@/veri/kanca";
import { saatMetni, usePlanVerisi } from "@/veri/plan";
import { gorevSaati, useTodoistAralik } from "@/veri/todoist";
import {
  hedefOzellikleri,
  hedefSinifi,
  kaynakOzellikleri,
  useSurukle,
} from "@/ui/surukle";
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


/* --- sürükleme ----------------------------------------------------------- */

/**
 * Hafta ekranında iki şey taşınıyor, o yüzden yük etiketli: hedef hangisini
 * kabul ettiğini söyleyebilsin. Gün ikisini de alır, slot yalnızca görevi.
 */
type Yuk = { tur: "gorev"; gorev: TodoistGorev } | { tur: "slot"; slot: Slot };

const GUN_ANAHTARI = (no: number) => `gun:${no}`;
const SLOT_ANAHTARI = (id: string) => `slot:${id}`;
const yalnizGorev = (y: Yuk) => y.tur === "gorev";

const GOREV_SURUKLENMEZ = "Tekrarlı görev sürüklenmez — tekrar düzeni silinir";
const SLOT_SURUKLENMEZ = "Taşınmış slot yeniden taşınmaz";

/* --- ekran -------------------------------------------------------------- */

export function Hafta() {
  const { haftalar, kurallar, bugun, yukleniyor: listeYukleniyor } = usePlanVerisi();
  const [kod, setKod] = useState<string | null>(null);
  const kuralSeti = useMemo(() => kuralSetiTamamla(kurallar), [kurallar]);

  const bugununHaftasi = useMemo(
    () =>
      haftalar.find((h) => {
        const t = h.veri.gunler.map((g) => g.isoTarih).filter(Boolean);
        return t.length > 0 && t[0]! <= bugun && bugun <= t[t.length - 1]!;
      })?.kod ?? null,
    [haftalar, bugun],
  );

  // Açılışta bugünü içeren hafta seçilir; yoksa en sonuncusu.
  useEffect(() => {
    if (kod || haftalar.length === 0) return;
    setKod(bugununHaftasi ?? haftalar[haftalar.length - 1]!.kod);
  }, [haftalar, bugununHaftasi, kod]);

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
      kurallar={kuralSeti}
      bugun={bugun}
      onceki={indeks > 0 ? kodlar[indeks - 1]! : null}
      sonraki={indeks >= 0 && indeks < kodlar.length - 1 ? kodlar[indeks + 1]! : null}
      bugununHaftasi={bugununHaftasi}
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
  bugununHaftasi,
  onGec,
}: {
  kod: string;
  kurallar: KuralSeti;
  bugun: string;
  onceki: string | null;
  sonraki: string | null;
  bugununHaftasi: string | null;
  onGec: (k: string) => void;
}) {
  const { veri, yukleniyor, hata, disaridanDegisti, yaz } = useDosya<HaftaTipi>(`${kod}.json`);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  /** Elle taşımanın sonucu: reddedildiyse sebep, yapıldıysa kural uyarısı. */
  const [tasimaNotu, setTasimaNotu] = useState<string | null>(null);

  const uyarilar = useMemo(
    () => (veri ? ihlaller(veri, kurallar) : []),
    [veri, kurallar],
  );

  // Haftanın görevleri. Todoist süzgeci uç değerleri dışlıyor, bir gün pay
  // bırakılıyor — takvimdeki sorguyla aynı.
  const gunListesi = veri?.gunler ?? [];
  const ilkGun = gunListesi[0]?.isoTarih ?? bugun;
  const sonGun = gunListesi[gunListesi.length - 1]?.isoTarih ?? bugun;
  const td = useTodoistAralik(gunEkle(ilkGun, -1), gunEkle(sonGun, 1));

  const birakildi = useCallback(
    (yuk: Yuk, anahtar: string) => {
      if (!veri) return;
      const ayrac = anahtar.indexOf(":");
      const tur = anahtar.slice(0, ayrac);
      const deger = anahtar.slice(ayrac + 1);
      setTasimaNotu(null);

      if (tur === "gun") {
        const gunNo = Number(deger);
        // Görev güne bırakılınca Todoist tarihi değişir; slot bırakılınca
        // hafta dosyası yazılır. İki ayrı kaynak, tek hareket.
        if (yuk.tur === "gorev") {
          const g = veri.gunler.find((x) => x.no === gunNo);
          if (g?.isoTarih) void td.tarihiDegistir(yuk.gorev, g.isoTarih);
          return;
        }
        const r = slotTasi(veri, kurallar, yuk.slot.id, gunNo);
        setTasimaNotu(r.not);
        if (r.tasindi) void yaz(r.hafta);
        return;
      }

      // Görev slota bırakıldı: slotun konusu olur. Görevin tarihine
      // dokunulmaz — bağlamak planı yazmaktır, görevi ertelemek değil.
      if (tur === "slot" && yuk.tur === "gorev") {
        void yaz({
          ...veri,
          slotlar: veri.slotlar.map((x) =>
            x.id === deger ? { ...x, konu: yuk.gorev.icerik } : x,
          ),
        });
      }
    },
    [veri, yaz, kurallar, td],
  );

  const surukle = useSurukle<Yuk>(birakildi);

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
  /** Bu hafta bugünü içeriyorsa bugünün gün numarası. */
  const bugunNo = veri.gunler.find((g) => g.isoTarih === bugun)?.no ?? null;
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
  const durumDondur = (x: Slot) => kaydet(slotDurumunuDondur(veri, x.id));

  const slotEkle = (gunNo: number) => {
    const { hafta, id } = slotEkleIslem(veri, gunNo, kurallar);
    kaydet(hafta);
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

  const aliskanlikDegis = (ad: string, gunNo: number) => kaydet(aliskanlikCevir(veri, ad, gunNo));

  const kotaDegis = (alan: "haftaSonu" | "haftaIci") => {
    const k = veri.sosyalKota ?? {};
    kaydet({ ...veri, sosyalKota: { ...k, [alan]: !k[alan] } });
  };

  const kota = veri.sosyalKota ?? {};

  return (
    <>
      <EkranBasi
        baslik={veri.baslik || `Hafta ${veri.hafta}`}
        altyazi={`${saatMetni(yuk)} planlı${hedef > 0 ? ` · hedef ${saatMetni(hedef)}` : ""}${
          disaridanDegisti ? " · dosya dışarıdan güncellendi" : ""
        }`}
        sag={
          <div className={s.gez}>
            <Kisayollar
              grup="Hafta"
              liste={[
                { tus: "ArrowLeft", aciklama: "Önceki hafta", eylem: onceki ? () => onGec(onceki) : null },
                { tus: "ArrowRight", aciklama: "Sonraki hafta", eylem: sonraki ? () => onGec(sonraki) : null },
                {
                  tus: "t",
                  aciklama: "Bu haftaya dön",
                  eylem: bugununHaftasi && bugununHaftasi !== kod ? () => onGec(bugununHaftasi) : null,
                },
                { tus: "n", aciklama: "Bugüne slot ekle", eylem: bugunNo ? () => slotEkle(bugunNo) : null },
                { tus: "Escape", aciklama: "Slot panelini kapat", eylem: secili ? () => setSeciliId(null) : null },
              ]}
            />
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

      {/* Görevler gelmediyse boş gün "görev yok" sanılmasın. */}
      {td.hata && (
        <div className={s.uyari} style={{ marginBottom: "var(--b5)" }}>
          <span className={s.uyariSatir}>
            Todoist'e ulaşılamadı — görevler gösterilmiyor. ({td.hata})
          </span>
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
            {tasimaNotu && <p className={s.tasimaNotu}>{tasimaNotu}</p>}
            {veri.gunler.map((g) => {
              const gunSlot = gununSlotlari(veri, g.no);
              const ofis = (veri.ofisGunleri ?? []).includes(g.no);
              const gunGorevleri = td.gunlere.get(g.isoTarih) ?? [];
              return (
                <div
                  key={g.no}
                  className={
                    [s.gunBlok, hedefSinifi(GUN_ANAHTARI(g.no), surukle)]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  {...hedefOzellikleri(GUN_ANAHTARI(g.no), surukle)}
                >
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
                        className={[
                          s.slot,
                          x.id === seciliId && s.slotSecili,
                          hedefSinifi(SLOT_ANAHTARI(x.id), surukle, yalnizGorev),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setSeciliId(x.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setSeciliId(x.id)}
                        title={
                          x.durum === "tasindi"
                            ? SLOT_SURUKLENMEZ
                            : "başka güne sürükle · üstüne görev bırakınca konusu olur"
                        }
                        {...kaynakOzellikleri({ tur: "slot", slot: x } as Yuk, surukle, {
                          kapali: x.durum === "tasindi",
                        })}
                        {...hedefOzellikleri(SLOT_ANAHTARI(x.id), surukle, yalnizGorev)}
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

                  {gunGorevleri.map((gr) => (
                    <div
                      key={gr.id}
                      className={gr.tekrarli ? `${s.gorevSatir} ${s.gorevTekrarli}` : s.gorevSatir}
                      title={
                        gr.tekrarli
                          ? GOREV_SURUKLENMEZ
                          : "başka güne sürükle, ya da bir slotun üstüne bırak"
                      }
                      {...kaynakOzellikleri({ tur: "gorev", gorev: gr } as Yuk, surukle, {
                        kapali: gr.tekrarli,
                      })}
                    >
                      <button
                        type="button"
                        className={s.gorevKutucuk}
                        onClick={(e) => {
                          e.stopPropagation();
                          void td.kapat(gr);
                        }}
                        title="Tamamla"
                        aria-label={`${gr.icerik} görevini tamamla`}
                      />
                      <span className={s.gorevSaat}>{gorevSaati(gr) ?? ""}</span>
                      <span className={s.gorevAd}>{gr.icerik}</span>
                    </div>
                  ))}

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
