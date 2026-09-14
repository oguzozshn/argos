import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Inbox,
  KeyRound,
  RefreshCw,
  Repeat,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import type { TodoistGorev } from "@ortak/tipler";
import { BosDurum, Dugme, EkranBasi, Giris, Kart, Yuklenirken } from "@/ui/bilesenler";
import { maddeGecisi } from "@/ui/hareket";
import { kopru } from "@/veri/kanca";
import { OBEK_SIRASI, useGorevler, useObekler, useProjeler } from "./kanca";
import s from "./yapilacak.module.css";

/**
 * Todoist'in kendisi. Bu modül yeni bir görev veritabanı kurmaz — kişisel
 * görevler zaten Todoist'te ve telefon yüzeyi de orası. İkinci bir liste
 * ikinci bir gerçek demek olurdu.
 */

const tarihBicimi = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
const saatBicimi = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

function tarihYaz(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const gunluk = tarihBicimi.format(t);
  return iso.length > 10 ? `${gunluk} ${saatBicimi.format(t)}` : gunluk;
}

/** Todoist'te 4 = p1. Renk yalnızca p1–p3'te var; p4 sessiz. */
const ONCELIK_RENGI: Record<number, string | undefined> = {
  4: "var(--hata)",
  3: "var(--uyari)",
  2: "var(--vurgu)",
};

const HIZLI_TARIH = [
  { ad: "bugün", metin: "bugün" },
  { ad: "yarın", metin: "yarın" },
  { ad: "gelecek hafta", metin: "gelecek pazartesi" },
];

function GorevSatiri({
  gorev,
  gecikmis,
  onKapat,
  onTarih,
}: {
  gorev: TodoistGorev;
  gecikmis: boolean;
  onKapat: () => void;
  onTarih: (metin: string | null) => void;
}) {
  const [tarihAcik, setTarihAcik] = useState(false);

  return (
    <motion.div variants={maddeGecisi} initial="giris" animate="duruyor" exit="cikis" layout>
      <div className={s.gorev}>
        <button
          type="button"
          className={s.kutucuk}
          style={{ borderColor: ONCELIK_RENGI[gorev.oncelik] }}
          onClick={onKapat}
          aria-label={`"${gorev.icerik}" görevini tamamla`}
          title="Tamamla"
        >
          <Check size={12} strokeWidth={3} />
        </button>

        <div className={s.govde}>
          <span className={s.icerik}>{gorev.icerik}</span>
          {(gorev.tarihMetni || gorev.aciklama || gorev.etiketler.length > 0) && (
            <span className={s.altSatir}>
              {gorev.tarihMetni && (
                <span className={gecikmis ? `${s.tarih} ${s.tarihGecikmis}` : s.tarih}>
                  {gorev.tekrarli ? <Repeat size={12} /> : <Calendar size={12} />}
                  {gorev.tekrarli ? gorev.tarihMetni : gorev.tarih ? tarihYaz(gorev.tarih) : ""}
                </span>
              )}
              {gorev.etiketler.map((e) => (
                <span key={e}>@{e}</span>
              ))}
              {gorev.aciklama && <span className={s.aciklama}>{gorev.aciklama}</span>}
            </span>
          )}
        </div>

        <div className={s.eylemler}>
          {/* Tekrarlı görevin tarihi buradan değişmez: due_string'i ezmek
              tekrar düzenini siler (CLAUDE.md). Tekrar metni satırda görünür. */}
          {!gorev.tekrarli && (
            <Dugme
              tur="sade"
              ikon={<Calendar size={15} />}
              onClick={() => setTarihAcik((x) => !x)}
              title="Tarihi değiştir"
              aria-label="Tarihi değiştir"
            />
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {tarihAcik && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "10px 20px 14px 46px",
                borderBottom: "1px solid var(--cizgi)",
                flexWrap: "wrap",
              }}
            >
              {HIZLI_TARIH.map((h) => (
                <Dugme
                  key={h.ad}
                  onClick={() => {
                    onTarih(h.metin);
                    setTarihAcik(false);
                  }}
                >
                  {h.ad}
                </Dugme>
              ))}
              {gorev.tarih && (
                <Dugme
                  tur="sade"
                  onClick={() => {
                    onTarih(null);
                    setTarihAcik(false);
                  }}
                >
                  tarihi kaldır
                </Dugme>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GorevListesi({ projeId, projeAd }: { projeId: string; projeAd: string }) {
  const { gorevler, yukleniyor, hata, sonKapatilan, tazele, kapat, geriAl, ekle, tarihVer } =
    useGorevler(projeId);
  const obekler = useObekler(gorevler);
  const [yeni, setYeni] = useState("");
  const [yeniTarih, setYeniTarih] = useState("");

  const gonder = () => {
    const icerik = yeni.trim();
    if (!icerik) return;
    void ekle(icerik, yeniTarih.trim() || undefined);
    setYeni("");
    setYeniTarih("");
  };

  return (
    <Kart
      dolgulu={false}
      baslik={projeAd}
      not={`${gorevler.length} açık görev`}
      bas={
        <Dugme
          tur="sade"
          ikon={<RefreshCw size={15} />}
          onClick={() => void tazele()}
          title="Yenile"
          aria-label="Yenile"
          style={{ marginLeft: "auto" }}
        />
      }
    >
      <div className={s.ekleme}>
        <Giris
          value={yeni}
          placeholder={`${projeAd} listesine ekle…`}
          onChange={(e) => setYeni(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && gonder()}
        />
        <div className={s.tarihKutusu}>
          <Giris
            value={yeniTarih}
            placeholder="yarın 18:00"
            onChange={(e) => setYeniTarih(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && gonder()}
            title="Todoist doğal dili anlar: yarın, pazartesi, her salı…"
          />
        </div>
        <Dugme tur="dolu" onClick={gonder} disabled={!yeni.trim()}>
          Ekle
        </Dugme>
      </div>

      {hata && (
        <div className={s.hataSerit}>
          <AlertTriangle size={15} />
          <span>{hata}</span>
        </div>
      )}

      <AnimatePresence initial={false}>
        {sonKapatilan && (
          <motion.div
            className={s.geriAl}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <Check size={15} />
            <span className={s.geriAlAd}>{sonKapatilan.icerik}</span>
            <Dugme tur="sade" ikon={<RotateCcw size={14} />} onClick={() => void geriAl()}>
              Geri al
            </Dugme>
          </motion.div>
        )}
      </AnimatePresence>

      {yukleniyor ? (
        <Yuklenirken />
      ) : gorevler.length === 0 ? (
        <BosDurum baslik="Açık görev yok" metin="Yukarıdaki kutudan yenisini ekle." />
      ) : (
        OBEK_SIRASI.filter((o) => obekler.get(o)?.length).map((o) => (
          <div key={o}>
            <p className={o === "gecikmiş" ? `${s.obekBasi} ${s.obekGecikmis}` : s.obekBasi}>
              {o} <span className={s.obekSayi}>{obekler.get(o)!.length}</span>
            </p>
            <AnimatePresence initial={false}>
              {obekler.get(o)!.map((g) => (
                <GorevSatiri
                  key={g.id}
                  gorev={g}
                  gecikmis={o === "gecikmiş"}
                  onKapat={() => void kapat(g)}
                  onTarih={(metin) => void tarihVer(g.id, metin)}
                />
              ))}
            </AnimatePresence>
          </div>
        ))
      )}
    </Kart>
  );
}

export function Yapilacak() {
  const { projeler, anahtarVar, gizliYolu, hata, yukleniyor, yenile } = useProjeler();

  // Anahtar yolunu elle JSON düzenleyerek kurmak tek yol olmasın.
  const gizliSec = async () => {
    const k = kopru();
    if (!k) return;
    if (await k.gizliSec()) yenile();
  };
  const [secili, setSecili] = useState<string | null>(null);

  const aktif = projeler.find((p) => p.id === secili) ?? projeler[0] ?? null;

  return (
    <>
      <EkranBasi
        baslik="Yapılacaklar"
        altyazi="Todoist'in kendisi — ayrı bir liste tutulmuyor, aynı görevler."
      />

      {yukleniyor ? (
        <Kart>
          <Yuklenirken />
        </Kart>
      ) : anahtarVar === false ? (
        <Kart>
          <BosDurum
            ikon={<KeyRound size={34} strokeWidth={1.4} />}
            baslik="Todoist anahtarı bulunamadı"
            metin={`Anahtar şurada aranıyor: ${gizliYolu} — içinde {"todoistToken": "…"} olmalı.`}
            eylem={
              <Dugme tur="dolu" onClick={() => void gizliSec()}>
                Dosya seç
              </Dugme>
            }
          />
        </Kart>
      ) : hata ? (
        <Kart>
          <BosDurum
            ikon={<AlertTriangle size={34} strokeWidth={1.4} />}
            baslik="Todoist'e ulaşılamadı"
            metin={hata}
            eylem={
              // Yanlış dosya seçildiyse (401) geri dönüş yolu burada kalmasın.
              <Dugme onClick={() => void gizliSec()}>Anahtar dosyasını değiştir</Dugme>
            }
          />
        </Kart>
      ) : !aktif ? (
        <Kart>
          <BosDurum ikon={<Inbox size={34} strokeWidth={1.4} />} baslik="Proje yok" />
        </Kart>
      ) : (
        <div className={s.duzen}>
          <div className={s.projeler}>
            {projeler.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === aktif.id ? `${s.projeBag} ${s.projeEtkin}` : s.projeBag}
                onClick={() => setSecili(p.id)}
              >
                {p.inbox && <Inbox size={15} />}
                <span className={s.projeAd}>{p.ad}</span>
              </button>
            ))}
            <p className={s.projeNot}>
              Gelişim Planı projesi burada görünmez — slotlar ve alışkanlıklar Asistan modülünün
              işi.
            </p>
          </div>

          <GorevListesi key={aktif.id} projeId={aktif.id} projeAd={aktif.ad} />
        </div>
      )}
    </>
  );
}
