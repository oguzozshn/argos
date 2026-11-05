import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isoWeek, newWeek, weekCode } from "@ortak/hafta-kur";
import { GUN_KISA } from "@ortak/gun";
import { aliskanlikCevir } from "@ortak/plan-islem";
import type { Hafta as HaftaTipi } from "@ortak/plan";
import { aliskanlikOzet, siklikMetni, siklikOku } from "@ortak/ozet";
import { BosDurum, Dugme, EkranBasi, Etiket, Kart, Yuklenirken } from "@/ui/bilesenler";
import { Kisayollar } from "@/ui/Kisayollar";
import { useDosya } from "@/veri/kanca";
import { usePlanVerisi } from "@/veri/plan";
import s from "./aliskanliklar.module.css";

/**
 * Alışkanlıklar: the daily grid of one week, and what every habit has done
 * across every week file on disk.
 *
 * The grid used to live on the Hafta screen, which showed the newest week
 * file it could find. Once a week went by without a new file being written,
 * last month's ticks stayed on screen as if they were this week's (issue
 * #87). Here the week is the one the date says it is: when its file is
 * missing, Argos opens it — seven empty days and the habits from
 * `kurallar.json` — and the earlier weeks stay where they are, a step back
 * in the picker.
 *
 * The summaries come from `@ortak/ozet`, which is tested against app.py, so
 * the streaks here are the ones the old application counts.
 */

/** Week codes, oldest first, the order `usePlanVerisi` already puts files in. */
const haftaSirala = (a: string, b: string) => Number(a.slice(1)) - Number(b.slice(1));

function Izgara({
  veri,
  bugun,
  onCevir,
}: {
  veri: HaftaTipi;
  bugun: string;
  onCevir: (ad: string, gunNo: number) => void;
}) {
  const aliskanliklar = veri.gunlukAliskanliklar ?? [];
  if (aliskanliklar.length === 0) {
    return (
      <BosDurum
        baslik="Bu haftada alışkanlık yok"
        metin="Liste kurallar.json dosyasından gelir."
      />
    );
  }

  return (
    <table className={s.izgara}>
      <thead>
        <tr>
          <th>Alışkanlık</th>
          {veri.gunler.map((g) => (
            <th key={g.no} className={g.isoTarih === bugun ? s.bugunSutun : undefined}>
              {GUN_KISA[g.no - 1]}
            </th>
          ))}
          <th className={s.izgaraSon}>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {aliskanliklar.map((a) => {
          const sik = siklikOku(a, bugun);
          const yapilanSayi = veri.gunler.filter((g) => (a.gunler ?? {})[String(g.no)]).length;
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
                  <td key={g.no} className={g.isoTarih === bugun ? s.bugunSutun : undefined}>
                    <button
                      type="button"
                      className={[
                        s.hucre,
                        yapildi && s.hucreYapildi,
                        !bekleniyor && !yapildi && s.hucreBeklenmiyor,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => onCevir(a.ad, g.no)}
                      aria-label={`${a.ad} · ${g.ad}`}
                      aria-pressed={yapildi}
                    >
                      {yapildi ? "☑" : "☐"}
                    </button>
                  </td>
                );
              })}
              <td className={s.izgaraSon}>
                {yapilanSayi}/
                {Array.isArray(a.beklenenGunler) ? a.beklenenGunler.length : veri.gunler.length}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Aliskanliklar() {
  const { haftalar, kurallar, bugun, yukleniyor: listeYukleniyor, tazele } = usePlanVerisi();
  const [kod, setKod] = useState<string | null>(null);

  const buHafta = useMemo(() => isoWeek(bugun), [bugun]);
  const buKod = weekCode(buHafta.week);

  // This week is in the picker whether or not its file exists yet.
  const kodlar = useMemo(
    () => [...new Set([...haftalar.map((h) => h.kod), buKod])].sort(haftaSirala),
    [haftalar, buKod],
  );

  const secili = kod ?? buKod;
  const indeks = kodlar.indexOf(secili);
  const onceki = indeks > 0 ? kodlar[indeks - 1]! : null;
  const sonraki = indeks >= 0 && indeks < kodlar.length - 1 ? kodlar[indeks + 1]! : null;

  const { veri, yukleniyor, hata, disaridanDegisti, yaz } = useDosya<HaftaTipi>(`${secili}.json`);

  /**
   * Opening the week: once, and only for the week the date falls in. An
   * earlier week with no file was never lived through Argos, so nothing is
   * invented for it — the picker simply does not offer it.
   */
  const acilan = useRef<string | null>(null);
  useEffect(() => {
    if (secili !== buKod || veri || yukleniyor || hata || listeYukleniyor) return;
    // No habits defined means nothing to track; an empty week file would only
    // get in the way of the plan being laid out later.
    if ((kurallar.gunlukAliskanliklar ?? []).length === 0) return;
    if (acilan.current === buKod) return;
    acilan.current = buKod;
    void (async () => {
      const yazildi = await yaz(newWeek(buHafta.year, buHafta.week, kurallar, bugun));
      // The week list is read once at start-up; without this the new file
      // reaches the picker only when the watcher gets round to it.
      if (yazildi) await tazele();
    })();
  }, [
    secili,
    buKod,
    veri,
    yukleniyor,
    hata,
    listeYukleniyor,
    yaz,
    buHafta,
    kurallar,
    bugun,
    tazele,
  ]);

  const ozet = useMemo(
    () => aliskanlikOzet(haftalar, kurallar, null, bugun),
    [haftalar, kurallar, bugun],
  );

  if (listeYukleniyor || yukleniyor) {
    return (
      <>
        <EkranBasi baslik="Alışkanlıklar" />
        <Kart>
          <Yuklenirken />
        </Kart>
      </>
    );
  }

  const cevir = (ad: string, gunNo: number) => {
    if (veri) void yaz(aliskanlikCevir(veri, ad, gunNo));
  };

  return (
    <>
      <EkranBasi
        baslik="Alışkanlıklar"
        altyazi={`${veri?.baslik || secili}${disaridanDegisti ? " · dosya dışarıdan güncellendi" : ""}`}
        sag={
          <div className={s.gez}>
            <Kisayollar
              grup="Alışkanlıklar"
              liste={[
                {
                  tus: "ArrowLeft",
                  aciklama: "Önceki hafta",
                  eylem: onceki ? () => setKod(onceki) : null,
                },
                {
                  tus: "ArrowRight",
                  aciklama: "Sonraki hafta",
                  eylem: sonraki ? () => setKod(sonraki) : null,
                },
                {
                  tus: "t",
                  aciklama: "Bu haftaya dön",
                  eylem: secili !== buKod ? () => setKod(buKod) : null,
                },
              ]}
            />
            <Dugme
              tur="sade"
              ikon={<ChevronLeft size={16} />}
              disabled={!onceki}
              onClick={() => onceki && setKod(onceki)}
              aria-label="Önceki hafta"
            />
            <Etiket tur={secili === buKod ? "vurgu" : "sade"}>{secili}</Etiket>
            <Dugme
              tur="sade"
              ikon={<ChevronRight size={16} />}
              disabled={!sonraki}
              onClick={() => sonraki && setKod(sonraki)}
              aria-label="Sonraki hafta"
            />
          </div>
        }
      />

      {hata && (
        <div className={s.uyari}>
          <span>{hata}</span>
        </div>
      )}

      <div className={s.dizi}>
        <Kart dolgulu={false} baslik="Günlük" not="kaçan gün telafi edilmez">
          {veri ? (
            <Izgara veri={veri} bugun={bugun} onCevir={cevir} />
          ) : (
            <BosDurum baslik="Hafta dosyası yok" metin={`${secili} için kayıt bulunamadı.`} />
          )}
        </Kart>

        <Kart dolgulu={false} baslik="Seriler" not="tüm hafta dosyaları">
          {ozet.aliskanliklar.length === 0 ? (
            <BosDurum baslik="Henüz kayıt yok" />
          ) : (
            <table className={s.seriler}>
              <thead>
                <tr>
                  <th>Alışkanlık</th>
                  <th>Sıklık</th>
                  <th>Seri</th>
                  <th>En uzun</th>
                  <th className={s.izgaraSon}>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {ozet.aliskanliklar.map((a) => (
                  <tr key={a.ad} className={a.aktif ? undefined : s.birakilan}>
                    <td>
                      <span className={s.aliskanlikAd}>{a.ad}</span>
                      {!a.aktif && <span className={s.aliskanlikSiklik}>bırakıldı</span>}
                    </td>
                    <td>{a.siklik}</td>
                    <td>
                      {a.siklikTip === "haftada" || a.siklikTip === "serbest"
                        ? "—"
                        : `${a.seri} gün`}
                    </td>
                    <td>{a.enUzun} gün</td>
                    <td className={s.izgaraSon}>{a.toplam} gün</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Kart>
      </div>
    </>
  );
}
