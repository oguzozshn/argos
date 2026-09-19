import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { TodoistGorev } from "@ortak/tipler";
import { Etiket, Kart, Satir } from "@/ui/bilesenler";
import { silVeBildir } from "@/ui/toast";
import { kopru } from "@/veri/kanca";
import s from "./yapilacak.module.css";

/**
 * Bugün ekranındaki kart: bugün ve gecikmiş görevler, tüm projelerden.
 * Tek istek — Todoist'in kendi süzgeci kullanılıyor.
 */
export function YapilacakOzet() {
  const [gorevler, setGorevler] = useState<TodoistGorev[] | null>(null);
  const [gecikmisAcik, setGecikmisAcik] = useState(false);

  useEffect(() => {
    const k = kopru();
    if (!k) return;
    const yukle = () =>
      void k.todoist
        .durum()
        .then((d) => (d.anahtarVar ? k.todoist.bugunVeGecikmis() : []))
        .then(setGorevler)
        .catch(() => setGorevler([]));
    yukle();
    // Hızlı yakalamadan eklenen bugünkü görev kartta da görünsün.
    return k.todoistDegisimDinle(yukle);
  }, []);

  const kapat = (g: TodoistGorev) => {
    const k = kopru();
    if (!k) return;
    const geriEkle = () => setGorevler((x) => [g, ...(x ?? []).filter((y) => y.id !== g.id)]);
    setGorevler((x) => (x ?? []).filter((y) => y.id !== g.id));
    silVeBildir({
      metin: `"${g.icerik}" tamamlandı.`,
      hataMetni: "Görev tamamlanamadı.",
      sil: () =>
        k.todoist.kapat(g.id).then(
          () => true,
          () => {
            geriEkle();
            return false;
          },
        ),
      geriKoy: () =>
        k.todoist.ac(g.id).then(
          () => {
            geriEkle();
            return true;
          },
          () => false,
        ),
    });
  };

  if (!gorevler || gorevler.length === 0) return null;

  const bugun = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const gecikmisMi = (g: TodoistGorev) => Boolean(g.tarih && g.tarih.slice(0, 10) < bugun);
  const gecikmisler = gorevler.filter(gecikmisMi);
  const bugunkuler = gorevler.filter((g) => !gecikmisMi(g));
  // Gecikmişler bugünkülerin arasına karışınca liste taşıyordu: sayı olarak
  // durur, tıklanınca açılır.
  const liste = gecikmisAcik ? [...gecikmisler, ...bugunkuler] : bugunkuler;
  const gorunen = liste.slice(0, gecikmisAcik ? 15 : 7);

  const satir = (g: TodoistGorev) => (
    <Satir
      key={g.id}
      baslik={g.icerik}
      alt={g.tarihMetni ?? undefined}
      sol={
        <button
          type="button"
          className={s.kutucuk}
          onClick={() => void kapat(g)}
          aria-label={`"${g.icerik}" görevini tamamla`}
        >
          <Check size={12} strokeWidth={3} />
        </button>
      }
      sag={gecikmisMi(g) ? <Etiket tur="hata">gecikmiş</Etiket> : null}
    />
  );

  return (
    <Kart
      dolgulu={false}
      baslik="Bugün yapılacaklar"
      not={<Link to="/yapilacak/">Yapılacaklar →</Link>}
      bas={
        gecikmisler.length > 0 && (
          <button
            type="button"
            className={gecikmisAcik ? `${s.gecikmisCip} ${s.gecikmisAcik}` : s.gecikmisCip}
            onClick={() => setGecikmisAcik((x) => !x)}
            aria-expanded={gecikmisAcik}
          >
            {gecikmisler.length} gecikmiş {gecikmisAcik ? "▴" : "▾"}
          </button>
        )
      }
    >
      {gorunen.length === 0 ? (
        <p className={s.projeNot} style={{ borderTop: "none", marginTop: 0 }}>
          Bugüne görev yok.
        </p>
      ) : (
        gorunen.map(satir)
      )}
      {liste.length > gorunen.length && <p className={s.projeNot}>{liste.length - gorunen.length} görev daha</p>}
    </Kart>
  );
}
