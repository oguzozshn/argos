import { FileText } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PAGES_PATH, emptyPages, normalizePages, pageTitle, type PagesFile } from "@ortak/sayfalar";
import { Kart, Satir } from "@/ui/bilesenler";
import { useDosya } from "@/veri/kanca";
import { secimiYaz } from "./kanca";
import s from "./sayfalar.module.css";

/** Kaç sayfa listelenir. Kart Bugün ızgarasında küçük duruyor. */
const ADET = 6;

/**
 * Bugün kartı: en son düzenlenen sayfalar. Sayfa adına tıklamak onu açar —
 * ağaçta aramaya gerek kalmasın.
 */
export function SayfalarOzet() {
  const dosya = useDosya<PagesFile>(PAGES_PATH);
  const git = useNavigate();
  const sayfalar = useMemo(() => {
    const f = dosya.veri ? normalizePages(dosya.veri) : emptyPages();
    return [...f.pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, ADET);
  }, [dosya.veri]);

  if (dosya.yukleniyor && sayfalar.length === 0) return null;

  return (
    <Kart dolgulu={false} baslik="Sayfalar" git={{ yol: "/sayfalar/", metin: "Sayfalar" }}>
      {sayfalar.length === 0 ? (
        <p className={s.kartNot}>Henüz sayfa yok.</p>
      ) : (
        sayfalar.map((p) => (
          <Satir
            key={p.id}
            baslik={pageTitle(p)}
            alt={p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : undefined}
            sol={<span className={s.kartIkon}>{p.icon || <FileText size={14} />}</span>}
            onClick={() => {
              // Ekran açık sayfayı hatırlanan seçimden okuyor: yazıp gidiliyor.
              secimiYaz(p.id);
              git("/sayfalar/");
            }}
          />
        ))
      )}
    </Kart>
  );
}
