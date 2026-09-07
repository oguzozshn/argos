import { CalendarOff, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AY_TAM, GUN_ADLARI, GUN_KISA, gunEkle, isoyaTarih } from "@ortak/gun";
import type { Hafta as HaftaTipi, Slot } from "@ortak/plan";
import { takvim } from "@ortak/ozet";
import { dakika, gununSlotlari, yeniSlotId, type KuralSeti } from "@ortak/kural";
import { gunBosalt, gunTipi, type BosaltRaporu } from "@ortak/plan-islem";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Yuklenirken } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { usePlanVerisi } from "@/veri/plan";
import s from "./takvim.module.css";

/**
 * Takvim — geçmişe değil ÖNE bakar.
 *
 * Eski panodaki hâli her hücreye alışkanlık oranı basıyordu; bir ay boyunca
 * sıralanan oran hem istenmeden tamamlanma yorumu yapıyor hem de sekmeyi
 * işlevsiz bırakıyordu (`siradaki.md`). Geçmiş zaten Arşiv'de.
 *
 * Buranın işi **boşluk görmek**: hangi güne ne sığar, korumalı alan nerede,
 * sosyal kota hangi güne konabilir. İki görünüm var — ay ızgarası ve gün
 * ekseni. Güne tıklayınca tek adımda slot eklenir ya da gün boşaltılır.
 */

const kisaltAlan = (a: string): string => (a.length <= 4 ? a : a.slice(0, 3));

const TIP_ADI: Record<string, string> = { ofis: "ofis", ev: "ev", haftaSonu: "h.sonu" };

type Gorunum = "ay" | "gun";

/** Gün ekseninin saat aralığı ve bir saatin piksel yüksekliği. */
const ILK_SAAT = 6;
const SON_SAAT = 24;
const SAAT_YUKSEKLIK = 46;

const yerDk = (dk: number): number => ((dk - ILK_SAAT * 60) / 60) * SAAT_YUKSEKLIK;

interface GunBilgisi {
  iso: string;
  ayIcinde: boolean;
  gecmis: boolean;
  bugunMu: boolean;
  haftaKodu: string | null;
  tip: string | null;
  korumali: boolean;
  slotlar: { id: string; saat: string; alan: string; konu: string; durum: string }[];
  seansDk: number;
  bos: boolean;
  kotaBos: boolean;
}

export function Takvim() {
  const { haftalar, kurallar, bugun, yukleniyor } = usePlanVerisi();
  const [gorunum, setGorunum] = useState<Gorunum>("ay");
  const [ay, setAy] = useState(() => bugun.slice(0, 7));
  const [secili, setSecili] = useState<string | null>(null);

  const kuralSeti = kurallar as KuralSeti;
  const yil = Number(ay.slice(0, 4));
  const ayNo = Number(ay.slice(5, 7));

  const tk = useMemo(() => takvim(haftalar, yil, ayNo), [haftalar, yil, ayNo]);

  /** Bir ISO tarihin hangi hafta dosyasında, kaçıncı gün olduğu. */
  const gunHaritasi = useMemo(() => {
    const m = new Map<string, { kod: string; gunNo: number; veri: HaftaTipi }>();
    for (const h of haftalar) {
      for (const g of h.veri.gunler) {
        if (g.isoTarih) m.set(g.isoTarih, { kod: h.kod, gunNo: g.no, veri: h.veri });
      }
    }
    return m;
  }, [haftalar]);

  const hucreler = useMemo<GunBilgisi[]>(() => {
    const ilk = `${ay}-01`;
    const basla = gunEkle(ilk, -((isoyaTarih(ilk).getUTCDay() + 6) % 7));
    const korumaliAlanlar = kuralSeti.korumaliAlanlar ?? [];

    return Array.from({ length: 42 }, (_, i) => {
      const iso = gunEkle(basla, i);
      const kayit = gunHaritasi.get(iso);
      const gun = tk.gunler[iso] as
        | { slotlar?: GunBilgisi["slotlar"]; seansDk?: number }
        | undefined;
      const slotlar = gun?.slotlar ?? [];
      const tip = kayit ? gunTipi(kayit.gunNo, kayit.veri.ofisGunleri ?? []) : null;
      const korumali =
        kayit !== undefined && korumaliAlanlar.some((k) => k.gunler.includes(kayit.gunNo));
      const aktif = slotlar.filter((x) => x.durum !== "tasindi" && x.alan !== "Kapanış");
      const kota = kayit?.veri.sosyalKota ?? {};
      const kotaBos =
        kayit !== undefined &&
        (kayit.gunNo >= 6 ? kota.haftaSonu !== true : kota.haftaIci !== true);

      return {
        iso,
        ayIcinde: iso.slice(0, 7) === ay,
        gecmis: iso < bugun,
        bugunMu: iso === bugun,
        haftaKodu: kayit?.kod ?? null,
        tip,
        korumali,
        slotlar,
        seansDk: gun?.seansDk ?? 0,
        bos: aktif.length === 0,
        kotaBos,
      };
    });
  }, [ay, tk, gunHaritasi, bugun, kuralSeti]);

  // Gün görünümüne geçilince bir gün seçili olmalı.
  useEffect(() => {
    if (gorunum === "gun" && !secili) setSecili(bugun);
  }, [gorunum, secili, bugun]);

  if (yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Takvim" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const seciliKayit = secili ? (gunHaritasi.get(secili) ?? null) : null;

  const gorunumSecici = (
    <div className={s.gorunumler}>
      {(["ay", "gun"] as Gorunum[]).map((g) => (
        <button
          key={g}
          type="button"
          className={g === gorunum ? `${s.gorunumDugme} ${s.gorunumSecili}` : s.gorunumDugme}
          onClick={() => setGorunum(g)}
        >
          {g === "ay" ? "ay" : "gün"}
        </button>
      ))}
    </div>
  );

  /* --- gün görünümü ------------------------------------------------------ */

  if (gorunum === "gun") {
    const gun = secili ?? bugun;
    return (
      <>
        <EkranBasi
          baslik="Takvim"
          altyazi={`${Number(gun.slice(8, 10))} ${
            AY_TAM[Number(gun.slice(5, 7)) - 1]
          } ${gun.slice(0, 4)} · ${GUN_ADLARI[(isoyaTarih(gun).getUTCDay() + 6) % 7]}`}
          sag={
            <div className={s.gez}>
              {gorunumSecici}
              <Dugme
                tur="sade"
                ikon={<ChevronLeft size={16} />}
                onClick={() => setSecili(gunEkle(gun, -1))}
                aria-label="Önceki gün"
              />
              {gun !== bugun && (
                <Dugme tur="sade" onClick={() => setSecili(bugun)}>
                  bugün
                </Dugme>
              )}
              <Dugme
                tur="sade"
                ikon={<ChevronRight size={16} />}
                onClick={() => setSecili(gunEkle(gun, 1))}
                aria-label="Sonraki gün"
              />
            </div>
          }
        />

        {seciliKayit ? (
          <GunEkrani
            kod={seciliKayit.kod}
            gunNo={seciliKayit.gunNo}
            iso={gun}
            bugun={bugun}
            kurallar={kuralSeti}
          />
        ) : (
          <Kart>
            <BosDurum
              baslik="Bu gün bir hafta dosyasında değil"
              metin="Plan yalnızca kurulmuş haftalarda düzenlenebilir."
            />
          </Kart>
        )}
      </>
    );
  }

  /* --- ay görünümü ------------------------------------------------------- */

  return (
    <>
      <EkranBasi
        baslik="Takvim"
        altyazi="Hangi güne ne sığar. Geçmişin dökümü Arşiv'de."
        sag={
          <div className={s.gez}>
            {gorunumSecici}
            <Dugme
              tur="sade"
              ikon={<ChevronLeft size={16} />}
              onClick={() => setAy(gunEkle(`${ay}-01`, -1).slice(0, 7))}
              aria-label="Önceki ay"
            />
            <span style={{ minWidth: 120, textAlign: "center" }}>
              {AY_TAM[ayNo - 1]} {yil}
            </span>
            <Dugme
              tur="sade"
              ikon={<ChevronRight size={16} />}
              onClick={() => setAy(gunEkle(`${ay}-01`, 32).slice(0, 7))}
              aria-label="Sonraki ay"
            />
          </div>
        }
      />

      <div className={secili ? `${s.duzen} ${s.duzenPanelli}` : s.duzen}>
        <Kart dolgulu={false}>
          <div className={s.baslikSatiri}>
            {GUN_KISA.map((g) => (
              <span key={g} className={s.baslikGun}>
                {g}
              </span>
            ))}
          </div>

          <div className={s.izgara}>
            {hucreler.map((h) => {
              if (!h.ayIcinde) return <div key={h.iso} className={`${s.hucre} ${s.hucreDisi}`} />;
              const yapilan = h.slotlar.filter((x) => x.durum === "yapildi").length;
              const planli = h.slotlar.filter((x) => x.durum !== "tasindi").length;
              return (
                <button
                  key={h.iso}
                  type="button"
                  className={[
                    s.hucre,
                    h.bugunMu && s.hucreBugun,
                    h.iso === secili && s.hucreSecili,
                    h.gecmis && s.hucreGecmis,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSecili(h.iso === secili ? null : h.iso)}
                  onDoubleClick={() => {
                    setSecili(h.iso);
                    setGorunum("gun");
                  }}
                >
                  <span className={s.hucreBas}>
                    <span className={s.gunNo}>{Number(h.iso.slice(8, 10))}</span>
                    {h.tip && (
                      <span className={h.tip === "ofis" ? `${s.gunTipi} ${s.tipOfis}` : s.gunTipi}>
                        {TIP_ADI[h.tip]}
                      </span>
                    )}
                    {h.korumali && (
                      <span className={s.korumaliIsaret} title="16:00 sonrası korumalı">
                        ⌾
                      </span>
                    )}
                  </span>

                  <span className={s.alanlar}>
                    {h.slotlar
                      .filter((x) => x.durum !== "tasindi")
                      .slice(0, 4)
                      .map((x) => (
                        <span
                          key={x.id}
                          className={[
                            s.alanRozet,
                            x.durum === "yapildi" && s.alanRozetYapildi,
                            x.durum === "kacti" && s.alanRozetKacti,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          title={`${x.saat} · ${x.alan} — ${x.konu}`}
                        >
                          {kisaltAlan(x.alan)}
                        </span>
                      ))}
                  </span>

                  <span className={s.hucreDip}>
                    {/* Oran yalnızca geçmiş günlerde, küçük punto. */}
                    {h.gecmis && planli > 0 && (
                      <span>
                        {yapilan}/{planli}
                      </span>
                    )}
                    {h.seansDk > 0 && <span>{h.seansDk} dk</span>}
                    {!h.gecmis && h.bos && h.kotaBos && h.haftaKodu && (
                      <span className={s.bosluk}>kota boş</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Kart>

        {secili && seciliKayit ? (
          <GunPaneli
            kod={seciliKayit.kod}
            gunNo={seciliKayit.gunNo}
            iso={secili}
            kurallar={kuralSeti}
            onKapat={() => setSecili(null)}
            onGunGorunumu={() => setGorunum("gun")}
          />
        ) : secili ? (
          <Kart>
            <BosDurum
              baslik="Bu gün bir hafta dosyasında değil"
              metin="Plan yalnızca kurulmuş haftalarda düzenlenebilir."
            />
          </Kart>
        ) : null}
      </div>
    </>
  );
}

/* --- gün ekseni ---------------------------------------------------------- */

function GunEkrani({
  kod,
  gunNo,
  iso,
  bugun,
  kurallar,
}: {
  kod: string;
  gunNo: number;
  iso: string;
  bugun: string;
  kurallar: KuralSeti;
}) {
  const dosya = useDosya<HaftaTipi>(`${kod}.json`);
  const [seciliSlot, setSeciliSlot] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(() => new Date());

  // "Şimdi" çizgisi dakikada bir kayar; saniye hassasiyeti gereksiz.
  useEffect(() => {
    const t = window.setInterval(() => setSimdi(new Date()), 60000);
    return () => window.clearInterval(t);
  }, []);

  const veri = dosya.veri;
  if (dosya.yukleniyor || !veri) {
    return (
      <Kart>
        <Yuklenirken />
      </Kart>
    );
  }

  const slotlar = gununSlotlari(veri, gunNo);
  const tip = gunTipi(gunNo, veri.ofisGunleri ?? []);
  const ofisK = kurallar.ofisGunuKurallari ?? {};

  // Yasak ve korumalı bantlar: nereye slot konmayacağı gözle görünsün.
  const bantlar: { bas: number; son: number; ad: string }[] = [];
  if (tip === "ofis") {
    if (ofisK.sabahSlotuYok && ofisK.sabahSiniri) {
      bantlar.push({ bas: ILK_SAAT * 60, son: dakika(ofisK.sabahSiniri), ad: "sabah slotu yok" });
    }
    if (ofisK.sonSlotBitisEnGec) {
      bantlar.push({ bas: dakika(ofisK.sonSlotBitisEnGec), son: SON_SAAT * 60, ad: "geç" });
    }
  }
  for (const k of kurallar.korumaliAlanlar ?? []) {
    if (k.gunler.includes(gunNo)) {
      bantlar.push({ bas: dakika(k.saattenSonra), son: SON_SAAT * 60, ad: "korumalı" });
    }
  }

  const gunSeanslari = (veri.seanslar ?? []).filter(
    (x) => (x.baslangic ?? "").slice(0, 10) === iso,
  );

  const yukseklik = (SON_SAAT - ILK_SAAT) * SAAT_YUKSEKLIK;
  const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
  const simdiGorunur = iso === bugun && simdiDk >= ILK_SAAT * 60 && simdiDk <= SON_SAAT * 60;

  return (
    <div className={`${s.duzen} ${s.duzenPanelli}`}>
      <Kart dolgulu={false}>
        <div className={s.sutunBasi}>
          <span className={s.sutunBasiPlan}>plan</span>
          <span className={s.sutunBasiOlcum}>ölçülen</span>
        </div>

        <div className={s.eksen} style={{ height: yukseklik + 24 }}>
          <div className={s.saatSutunu}>
            {Array.from({ length: SON_SAAT - ILK_SAAT + 1 }, (_, i) => (
              <span key={i} className={s.saatEtiket} style={{ top: i * SAAT_YUKSEKLIK }}>
                {String(ILK_SAAT + i).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          <div className={s.slotSutunu} style={{ height: yukseklik }}>
            {Array.from({ length: (SON_SAAT - ILK_SAAT) * 2 + 1 }, (_, i) => (
              <div
                key={i}
                className={i % 2 ? `${s.saatCizgi} ${s.saatCizgiYarim}` : s.saatCizgi}
                style={{ top: (i * SAAT_YUKSEKLIK) / 2 }}
              />
            ))}

            {bantlar.map((b, i) => (
              <div
                key={i}
                className={s.bant}
                style={{ top: yerDk(b.bas), height: yerDk(b.son) - yerDk(b.bas) }}
              >
                <span className={s.bantEtiket}>{b.ad}</span>
              </div>
            ))}

            {slotlar.map((x) => (
              <button
                key={x.id}
                type="button"
                className={[
                  s.blok,
                  x.id === seciliSlot && s.blokSecili,
                  x.durum === "yapildi" && s.blokYapildi,
                  x.durum === "kacti" && s.blokKacti,
                  x.durum === "tasindi" && s.blokTasindi,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  top: yerDk(dakika(x.saat)),
                  height: Math.max(22, (x.sureDk / 60) * SAAT_YUKSEKLIK - 3),
                }}
                onClick={() => setSeciliSlot(x.id === seciliSlot ? null : x.id)}
                title={`${x.saat} · ${x.alan} — ${x.konu} · ${x.sureDk} dk`}
              >
                <span className={s.blokBas}>
                  {x.saat} · {x.alan}
                </span>
                {x.konu && <span className={s.blokAlt}>{x.konu}</span>}
              </button>
            ))}

            {simdiGorunur && <div className={s.simdiCizgi} style={{ top: yerDk(simdiDk) }} />}
            {simdiGorunur && <div className={s.simdiNokta} style={{ top: yerDk(simdiDk) }} />}
          </div>

          {/* Ölçülen seanslar ayrı sütunda: plan ile gerçek yan yana durur. */}
          <div className={s.seansSutunu} style={{ height: yukseklik }}>
            {gunSeanslari.map((x) => {
              const t = (x.baslangic ?? "").slice(11, 16) || "00:00";
              const bas = dakika(t);
              return (
                <div key={x.id}>
                  <div
                    className={s.seansBlok}
                    style={{
                      top: yerDk(bas),
                      height: Math.max(3, ((x.sureDk ?? 0) / 60) * SAAT_YUKSEKLIK),
                    }}
                    title={`${t} · ${x.sureDk} dk`}
                  />
                  <span className={s.seansEtiket} style={{ top: yerDk(bas) }}>
                    {x.sureDk} dk
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Kart>

      <GunPaneliIc
        veri={veri}
        yaz={dosya.yaz}
        gunNo={gunNo}
        iso={iso}
        kurallar={kurallar}
        onKapat={null}
        onGunGorunumu={null}
      />
    </div>
  );
}

/* --- gün paneli ---------------------------------------------------------- */

function GunPaneli(p: {
  kod: string;
  gunNo: number;
  iso: string;
  kurallar: KuralSeti;
  onKapat: () => void;
  onGunGorunumu: () => void;
}) {
  const { veri, yukleniyor, yaz } = useDosya<HaftaTipi>(`${p.kod}.json`);
  if (yukleniyor || !veri) {
    return (
      <aside className={s.panel}>
        <Yuklenirken satir={2} />
      </aside>
    );
  }
  return (
    <GunPaneliIc
      veri={veri}
      yaz={yaz}
      gunNo={p.gunNo}
      iso={p.iso}
      kurallar={p.kurallar}
      onKapat={p.onKapat}
      onGunGorunumu={p.onGunGorunumu}
    />
  );
}

function GunPaneliIc({
  veri,
  yaz,
  gunNo,
  iso,
  kurallar,
  onKapat,
  onGunGorunumu,
}: {
  veri: HaftaTipi;
  yaz: (y: HaftaTipi) => Promise<boolean>;
  gunNo: number;
  iso: string;
  kurallar: KuralSeti;
  onKapat: (() => void) | null;
  onGunGorunumu: (() => void) | null;
}) {
  const [rapor, setRapor] = useState<BosaltRaporu | null>(null);

  const gun = veri.gunler.find((g) => g.no === gunNo);
  const slotlar = gununSlotlari(veri, gunNo);
  const tip = gunTipi(gunNo, veri.ofisGunleri ?? []);

  const slotEkle = () => {
    const sonuncu = slotlar[slotlar.length - 1];
    const saat = sonuncu
      ? `${String(
          Math.min(22, Math.floor((dakika(sonuncu.saat) + sonuncu.sureDk + 15) / 60)),
        ).padStart(2, "0")}:00`
      : tip === "haftaSonu"
        ? "09:30"
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
    void yaz({
      ...veri,
      slotlar: [...veri.slotlar, yeni],
      kullanilmisIdler: [...(veri.kullanilmisIdler ?? []), id],
    });
    setRapor(null);
  };

  const bosalt = (kota: "haftaSonu" | "haftaIci" | null) => {
    const { hafta, rapor: r } = gunBosalt(veri, kurallar, gunNo, kota);
    setRapor(r);
    if (r.tasinan > 0 || r.dusen > 0 || kota) void yaz(hafta);
  };

  return (
    <aside className={s.panel}>
      <div className={s.panelBas}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className={s.panelUst}>
            {gun?.ad} · {TIP_ADI[tip]}
          </p>
          <h2 className={s.panelBaslik}>{gun?.tarih ?? iso}</h2>
        </div>
        {onKapat && (
          <Dugme tur="sade" ikon={<X size={16} />} onClick={onKapat} aria-label="Paneli kapat" />
        )}
      </div>

      {slotlar.length === 0 ? (
        <p className={s.aciklama}>Bu güne slot konmamış.</p>
      ) : (
        slotlar.map((x) => (
          <div key={x.id} className={s.panelSlot}>
            <span className={s.panelSlotSaat}>{x.saat}</span>
            <span className={s.panelSlotAd}>
              {x.alan}
              {x.konu ? ` — ${x.konu}` : ""}
            </span>
            <Etiket tur={x.durum === "yapildi" ? "iyi" : x.durum === "kacti" ? "hata" : "sade"}>
              {x.durum}
            </Etiket>
          </div>
        ))
      )}

      {rapor && (
        <div className={s.rapor}>
          {rapor.not ?? `${rapor.tasinan} slot taşındı, ${rapor.dusen} düştü.`}
          {rapor.hedefler.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>
      )}

      <div className={s.panelDip}>
        <Dugme ikon={<Plus size={15} />} onClick={slotEkle}>
          Slot ekle
        </Dugme>
        <Dugme
          tur="cizgili"
          ikon={<CalendarOff size={15} />}
          onClick={() => bosalt(gunNo >= 6 ? "haftaSonu" : "haftaIci")}
          disabled={slotlar.filter((x) => x.durum === "planli").length === 0}
        >
          Günü boşalt (buluşma)
        </Dugme>
        {onGunGorunumu && (
          <Dugme tur="sade" onClick={onGunGorunumu}>
            Gün görünümünde aç
          </Dugme>
        )}
        <p className={s.aciklama}>
          Slot taşınır, sıkıştırılmaz. Hafta sonuna sığmayan düşer ve ⊘ olarak kalır.
        </p>
      </div>
    </aside>
  );
}
