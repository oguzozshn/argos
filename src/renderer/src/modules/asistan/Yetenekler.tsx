import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { arsiv, roadmapOzet, zamanOzet } from "@ortak/ozet";
import { bugunIso } from "@ortak/plan";
import {
  BOS_YETENEKLER,
  YETENEK_YOLU,
  alanEkle,
  normalizeYetenekler,
  olcumEkle,
  olcumGruplari,
  olcumSil,
  yetenekGuncelle,
  yetenekAlanlari,
  yetenekRolu,
  type YetenekDosyasi,
  type YetenekRolu,
} from "@ortak/yetenek";
import { BosDurum, Dugme, EkranBasi, Etiket, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { saatMetni, usePlanVerisi } from "@/veri/plan";
import { DuzenMetni } from "./DuzenMetni";
import s from "./duzen.module.css";

/**
 * Yetenekler (issue #56): one card per area of the plan (İngilizce,
 * Gitar…). What the plan already knows — its place in the week, the time
 * spent, its roadmap — next to what only the user knows: the dream it
 * serves, the activities, and dated measurements (IELTS score, pages…).
 */

const ROL: Record<YetenekRolu, { ad: string; tur: "vurgu" | "iyi" | "sade" }> = {
  sabit: { ad: "her hafta", tur: "vurgu" },
  rotasyon: { ad: "rotasyonda", tur: "iyi" },
  diger: { ad: "plan dışı", tur: "sade" },
};

type KurallarDosyasi = { alanlar?: string[] } & Record<string, unknown>;

const kisaTarih = (iso: string): string => {
  const [y, a, g] = iso.split("-");
  return `${Number(g)}.${a}.${y!.slice(2)}`;
};

let sayac = 0;
const olcumId = () => `o-${Date.now().toString(36)}-${(sayac++).toString(36)}`;

export function Yetenekler() {
  const plan = usePlanVerisi();
  const { haftalar, kurallar, roadmapler, bugun } = plan;
  const kuralDosyasi = useDosya<KurallarDosyasi>("kurallar.json");
  const dosya = useDosya<YetenekDosyasi>(YETENEK_YOLU);
  const [yeniAlan, setYeniAlan] = useState("");

  const veri = useMemo(() => normalizeYetenekler(dosya.veri), [dosya.veri]);
  const degistir = (f: (d: YetenekDosyasi) => YetenekDosyasi) =>
    void dosya.degistir((d) => f(d ? normalizeYetenekler(d) : BOS_YETENEKLER));

  // Time per area: all time, this month and this week, from the same summaries as Arşiv.
  const sure = useMemo(() => {
    const toplam = new Map(arsiv(haftalar, bugun).alanlar.map((a) => [a.alan, a.toplamDk]));
    const ay = new Map(zamanOzet(haftalar, "ay", bugun, bugun).alanlar.map((a) => [a.alan, a.dk]));
    const hafta = new Map(zamanOzet(haftalar, "hafta", bugun, bugun).alanlar.map((a) => [a.alan, a.dk]));
    return (alan: string) => ({ toplam: toplam.get(alan) ?? 0, ay: ay.get(alan) ?? 0, hafta: hafta.get(alan) ?? 0 });
  }, [haftalar, bugun]);
  const haritalar = useMemo(() => roadmapOzet(haftalar, kurallar, roadmapler, bugun), [haftalar, kurallar, roadmapler, bugun]);

  if (plan.yukleniyor || dosya.yukleniyor || kuralDosyasi.yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Yetenekler" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const alanlar = kuralDosyasi.veri?.alanlar ?? kurallar.alanlar ?? [];
  const sirali = yetenekAlanlari(alanlar, kurallar);
  const ekle = () => {
    if (!yeniAlan.trim()) return;
    void kuralDosyasi.degistir((k) => alanEkle(k ?? {}, yeniAlan));
    setYeniAlan("");
  };

  return (
    <>
      <EkranBasi
        baslik="Yetenekler"
        altyazi="Planın alanları. Süre ve yol haritası plandan gelir; hayal, aktiviteler ve ölçümler buraya yazılır."
      />

      <div className={s.ust}>
        <Giris
          value={yeniAlan}
          placeholder="Yeni yetenek: Almanca"
          aria-label="Yeni yeteneğin adı"
          onChange={(e) => setYeniAlan(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ekle()}
        />
        <Dugme tur="dolu" ikon={<Plus size={15} />} onClick={ekle} disabled={!yeniAlan.trim()}>
          Ekle
        </Dugme>
      </div>
      {(dosya.hata || kuralDosyasi.hata) && <p className={s.soluk}>{dosya.hata ?? kuralDosyasi.hata}</p>}

      {sirali.length === 0 ? (
        <Kart>
          <BosDurum baslik="Henüz yetenek yok" metin="Yukarıdan bir yetenek ekle; plan bu alanlara slot açar." />
        </Kart>
      ) : (
        <div className={s.izgara}>
          {sirali.map((alan) => (
            <YetenekKarti
              key={alan}
              alan={alan}
              rol={yetenekRolu(alan, kurallar)}
              sure={sure(alan)}
              harita={haritalar.find((r) => r.alan === alan) ?? null}
              kayit={veri.yetenekler[alan] ?? {}}
              bugun={bugun}
              degistir={degistir}
            />
          ))}
        </div>
      )}
    </>
  );
}

function YetenekKarti({
  alan,
  rol,
  sure,
  harita,
  kayit,
  bugun,
  degistir,
}: {
  alan: string;
  rol: YetenekRolu;
  sure: { toplam: number; ay: number; hafta: number };
  harita: ReturnType<typeof roadmapOzet>[number] | null;
  kayit: YetenekDosyasi["yetenekler"][string];
  bugun: string;
  degistir: (f: (d: YetenekDosyasi) => YetenekDosyasi) => void;
}) {
  const [olcumAd, setOlcumAd] = useState("");
  const [olcumDeger, setOlcumDeger] = useState("");
  const [olcumTarih, setOlcumTarih] = useState(bugun);
  const gruplar = olcumGruplari(kayit.olcumler ?? []);
  const olcumKaydet = () => {
    if (!olcumAd.trim() || !olcumDeger.trim()) return;
    degistir((d) => olcumEkle(d, alan, { id: olcumId(), ad: olcumAd.trim(), deger: olcumDeger.trim(), tarih: olcumTarih || bugunIso() }));
    setOlcumDeger("");
  };
  const listeId = `olcumler-${alan}`;

  return (
    <Kart dolgulu={false} baslik={alan} bas={<Etiket tur={ROL[rol].tur}>{ROL[rol].ad}</Etiket>}>
      <div className={s.govde}>
        <DuzenMetni
          cokSatir
          deger={kayit.hayal ?? ""}
          etiket={`${alan}: hayal`}
          placeholder={harita?.hedef ? `Hayal: ${harita.hedef}` : "Hayal: bu yetenekle ne yapmak istiyorsun?"}
          onKaydet={(hayal) => degistir((d) => yetenekGuncelle(d, alan, { hayal }))}
        />

        <div className={s.sayilar}>
          {(
            [
              ["Bu hafta", sure.hafta],
              ["Bu ay", sure.ay],
              ["Toplam", sure.toplam],
            ] as const
          ).map(([ad, dk]) => (
            <div key={ad} className={s.sayi}>
              <span className={s.soluk}>{ad}</span>
              <span className={s.sayiDeger}>{dk ? saatMetni(dk) : "—"}</span>
            </div>
          ))}
        </div>

        <div className={s.bolum}>
          <span className={s.bolumAd}>Yol haritası</span>
          {harita ? (
            <>
              <div className={s.cubukYuva}>
                <div className={s.cubuk} style={{ width: `${harita.adimToplam ? (harita.adimBiten / harita.adimToplam) * 100 : 0}%` }} />
              </div>
              <div className={s.satir}>
                <span className={s.soluk}>
                  Aşama {Math.min(harita.suAnAsama + 1, harita.asamaSayisi)}/{harita.asamaSayisi} · {harita.suAnAsamaAd} ·{" "}
                  {harita.adimBiten}/{harita.adimToplam} adım
                </span>
                <Link to="/asistan/roadmap" className={s.bag} style={{ marginLeft: "auto" }}>
                  Yol haritası →
                </Link>
              </div>
            </>
          ) : (
            <div className={s.satir}>
              <span className={s.soluk}>Yok.</span>
              <Link to={`/asistan/roadmap?yeni=${encodeURIComponent(alan)}`} className={s.bag}>
                Oluştur →
              </Link>
            </div>
          )}
        </div>

        <div className={s.bolum}>
          <span className={s.bolumAd}>Aktiviteler</span>
          <DuzenMetni
            cokSatir
            deger={kayit.aktiviteler ?? ""}
            etiket={`${alan}: aktiviteler`}
            placeholder="Bir oturumda ne yapılır: 15 dk ısınma, ana çalışma…"
            onKaydet={(aktiviteler) => degistir((d) => yetenekGuncelle(d, alan, { aktiviteler }))}
          />
        </div>

        <div className={s.bolum}>
          <span className={s.bolumAd}>Ölçümler</span>
          {gruplar.map((g) => (
            <div key={g.ad} className={s.olcum}>
              <span className={s.olcumAd}>{g.ad}</span>
              <span className={s.olcumDeger}>{g.kayitlar[0]!.deger}</span>
              <span className={s.soluk}>{kisaTarih(g.kayitlar[0]!.tarih)}</span>
              {g.kayitlar.length > 1 && (
                <span className={s.olcumGecmis} title={g.kayitlar.slice(1).map((o) => `${o.deger} · ${kisaTarih(o.tarih)}`).join("\n")}>
                  ← {g.kayitlar.slice(1, 4).map((o) => o.deger).join(" ← ")}
                </span>
              )}
              <button
                type="button"
                className={`${s.ikonDugme} ${s.tehlike}`}
                aria-label={`${g.ad} ${g.kayitlar[0]!.deger} ölçümünü sil`}
                title="Son ölçümü sil"
                onClick={() => degistir((d) => olcumSil(d, alan, g.kayitlar[0]!.id))}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <div className={s.satir}>
            <input
              className={`${s.kucukGiris} ${s.genisGiris}`}
              list={listeId}
              value={olcumAd}
              placeholder="ölçüm: IELTS reading"
              aria-label={`${alan}: ölçüm adı`}
              onChange={(e) => setOlcumAd(e.target.value)}
            />
            <datalist id={listeId}>
              {gruplar.map((g) => (
                <option key={g.ad} value={g.ad} />
              ))}
            </datalist>
            <input
              className={`${s.kucukGiris} ${s.dar}`}
              value={olcumDeger}
              placeholder="değer"
              aria-label={`${alan}: ölçüm değeri`}
              onChange={(e) => setOlcumDeger(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && olcumKaydet()}
            />
            <input
              type="date"
              className={`${s.kucukGiris} ${s.orta}`}
              value={olcumTarih}
              aria-label={`${alan}: ölçüm tarihi`}
              onChange={(e) => setOlcumTarih(e.target.value)}
            />
            <button
              type="button"
              className={s.ikonDugme}
              aria-label={`${alan}: ölçüm ekle`}
              title="Ölçüm ekle"
              disabled={!olcumAd.trim() || !olcumDeger.trim()}
              onClick={olcumKaydet}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
    </Kart>
  );
}
