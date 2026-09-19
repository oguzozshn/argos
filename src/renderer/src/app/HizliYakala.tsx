import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Check, CornerDownLeft, Inbox } from "lucide-react";
import type { TodoistGorev } from "@ortak/tipler";
import { cozulmusTema } from "@/ui/tema";
import { kopru } from "@/veri/kanca";
import s from "./hizliYakala.module.css";

/**
 * Hızlı yakalama penceresi: Ctrl+Alt+N ile, uygulama arkadayken de açılır.
 * Tek satır Todoist'in doğal dil hızlı eklemesine gider — proje, etiket,
 * öncelik ve tarih metinden çözülür. Enter ekler, Esc kapatır.
 *
 * Kabuğun hiçbir parçasını yüklemez: açılışı anlık olsun.
 */

type Durum =
  | { tur: "bos" }
  | { tur: "gonderiliyor" }
  | { tur: "eklendi"; gorev: TodoistGorev }
  | { tur: "hata"; mesaj: string };

/** Eklendi mesajı bu kadar görünür, sonra pencere kendiliğinden kapanır. */
const EKLENDI_SURE = 1100;

const tarihMetni = (g: TodoistGorev): string | null => {
  if (!g.tarih) return null;
  const [y, a, gun] = g.tarih.slice(0, 10).split("-").map(Number);
  const tarih = new Date(y!, a! - 1, gun!).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });
  const saat = g.tarih.length > 10 ? g.tarih.slice(11, 16) : "";
  return saat ? `${tarih} ${saat}` : tarih;
};

export function HizliYakala() {
  const [metin, setMetin] = useState("");
  const [durum, setDurum] = useState<Durum>({ tur: "bos" });
  const giris = useRef<HTMLInputElement>(null);
  const kapanis = useRef<number | undefined>(undefined);

  const temaUygula = () => {
    document.documentElement.dataset.tema = cozulmusTema();
  };

  const sifirla = () => {
    window.clearTimeout(kapanis.current);
    setMetin("");
    setDurum({ tur: "bos" });
  };

  const gizle = () => {
    window.clearTimeout(kapanis.current);
    void kopru()?.yakala.gizle();
  };

  useEffect(() => {
    temaUygula();
    giris.current?.focus();
    // Pencere gizlenip yeniden gösteriliyor, yeniden yüklenmiyor: her açılışta
    // temiz başlasın ve odak kutuda olsun. Tema o arada değişmiş olabilir.
    return kopru()?.yakala.acildiDinle(() => {
      temaUygula();
      // Eklendi mesajı görünürken kapatılıp açıldıysa temiz başla; yarım
      // kalmış bir yazı ya da hata varsa korunur.
      setDurum((d) => (d.tur === "eklendi" ? { tur: "bos" } : d));
      window.setTimeout(() => {
        giris.current?.focus();
        giris.current?.select();
      }, 0);
    });
  }, []);

  useEffect(() => () => window.clearTimeout(kapanis.current), []);

  const ekle = async () => {
    const k = kopru();
    const satir = metin.trim();
    if (!k || !satir || durum.tur === "gonderiliyor") return;
    setDurum({ tur: "gonderiliyor" });
    try {
      const gorev = await k.todoist.hizliEkle(satir);
      setMetin("");
      setDurum({ tur: "eklendi", gorev });
      kapanis.current = window.setTimeout(() => {
        gizle();
        setDurum({ tur: "bos" });
      }, EKLENDI_SURE);
    } catch (e) {
      // Metin korunur: yeniden denenebilir ya da düzeltilebilir.
      const ham = e instanceof Error ? e.message : String(e);
      const mesaj = ham.replace(/^Error invoking remote method '[^']+': (\w+: )?/, "");
      setDurum({
        tur: "hata",
        mesaj: /anahtar/i.test(mesaj)
          ? `${mesaj} — Argos'ta Yapılacaklar ekranından anahtar dosyasını seç.`
          : mesaj,
      });
    }
  };

  const tus = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void ekle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (metin && durum.tur !== "gonderiliyor") sifirla();
      else gizle();
    }
  };

  const tarih = durum.tur === "eklendi" ? tarihMetni(durum.gorev) : null;

  return (
    <div className={s.zemin}>
      <div className={s.kart}>
        <div className={s.satir}>
          <Inbox size={18} className={s.ikon} aria-hidden />
          <input
            ref={giris}
            className={s.giris}
            value={metin}
            onChange={(e) => {
              setMetin(e.target.value);
              if (durum.tur === "hata" || durum.tur === "eklendi") {
                window.clearTimeout(kapanis.current);
                setDurum({ tur: "bos" });
              }
            }}
            onKeyDown={tus}
            placeholder="Görev ekle — yarın 18:00 fatura öde #Ev p1"
            aria-label="Hızlı görev"
            spellCheck={false}
            // disabled değil: odak kutuda kalsın, hata sonrası hemen düzeltilebilsin.
            readOnly={durum.tur === "gonderiliyor"}
          />
          <kbd className={s.tus} aria-hidden>
            <CornerDownLeft size={13} />
          </kbd>
        </div>
        <div className={s.alt} role="status" aria-live="polite">
          {durum.tur === "eklendi" ? (
            <span className={s.iyi}>
              <Check size={14} /> Eklendi: {durum.gorev.icerik}
              {tarih && <span className={s.soluk}> · {tarih}</span>}
            </span>
          ) : durum.tur === "hata" ? (
            <span className={s.hata} role="alert">
              <AlertTriangle size={14} /> {durum.mesaj}
            </span>
          ) : durum.tur === "gonderiliyor" ? (
            <span className={s.soluk}>Todoist'e gönderiliyor…</span>
          ) : (
            <span className={s.soluk}>
              <b>#</b>proje · <b>@</b>etiket · <b>p1</b>–p4 · tarih doğal dille · Enter ekler · Esc kapatır
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
