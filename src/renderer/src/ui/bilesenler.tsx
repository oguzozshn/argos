import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";
import s from "./bilesenler.module.css";

const birlestir = (...x: (string | false | undefined)[]): string => x.filter(Boolean).join(" ");

/* --- ekran başlığı ---------------------------------------------------- */

export function EkranBasi({
  ustyazi,
  baslik,
  altyazi,
  sag,
}: {
  ustyazi?: string;
  baslik: string;
  altyazi?: string;
  sag?: ReactNode;
}) {
  return (
    <div className={s.ekranBasi}>
      <div className={s.ekranBasiSol}>
        {ustyazi && <p className={s.ustyazi}>{ustyazi}</p>}
        <h1 className={s.baslik}>{baslik}</h1>
        {altyazi && <p className={s.altyazi}>{altyazi}</p>}
      </div>
      {sag}
    </div>
  );
}

/* --- kart -------------------------------------------------------------- */

export function Kart({
  baslik,
  not,
  bas,
  dolgulu = true,
  children,
  className,
  git,
}: {
  baslik?: string;
  not?: ReactNode;
  bas?: ReactNode;
  /** Başlığın sağında, kartın ayrıntısına götüren bağlantı: { yol, metin }. */
  git?: { yol: string; metin: string };
  /** Liste taşıyan kartlarda iç boşluk satırlara aittir, karta değil. */
  dolgulu?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={birlestir(s.kart, className)}>
      {(baslik || bas || git) && (
        <div className={s.kartBas}>
          {baslik && <h2 className={s.kartBaslik}>{baslik}</h2>}
          <span className={s.kartNot}>{not}</span>
          {bas}
          {git && (
            <Link to={git.yol} className={s.kartGit}>
              {git.metin} →
            </Link>
          )}
        </div>
      )}
      {children && <div className={dolgulu ? s.kartIc : undefined}>{children}</div>}
    </section>
  );
}

/* --- satır ------------------------------------------------------------- */

export function Satir({
  baslik,
  alt,
  sol,
  sag,
  onClick,
}: {
  baslik: ReactNode;
  alt?: ReactNode;
  sol?: ReactNode;
  sag?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={birlestir(s.satir, onClick && s.satirTiklanir)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {sol}
      <div className={s.satirSol}>
        <span className={s.satirBaslik}>{baslik}</span>
        {alt && <span className={s.satirAlt}>{alt}</span>}
      </div>
      {sag && <div className={s.satirSag}>{sag}</div>}
    </div>
  );
}

/* --- düğme ------------------------------------------------------------- */

type DugmeTuru = "dolu" | "cizgili" | "sade" | "tehlike";

export function Dugme({
  tur = "cizgili",
  ikon,
  children,
  className,
  ...kalan
}: {
  tur?: DugmeTuru;
  ikon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const bicim = { dolu: s.dolu, cizgili: s.cizgili, sade: s.sade, tehlike: s.tehlike }[tur];
  return (
    <button
      type="button"
      className={birlestir(s.dugme, bicim, !children && s.ikonDugme, className)}
      {...kalan}
    >
      {ikon}
      {children}
    </button>
  );
}

/* --- giriş ------------------------------------------------------------- */

export function Giris({
  ikon,
  sag,
  ...kalan
}: { ikon?: ReactNode; sag?: ReactNode } & ComponentProps<"input">) {
  return (
    <div className={s.girisSarmal}>
      {ikon && <span className={s.girisIkon}>{ikon}</span>}
      <input className={s.giris} {...kalan} />
      {sag}
    </div>
  );
}

/* --- etiket ------------------------------------------------------------ */

export function Etiket({
  tur = "sade",
  children,
}: {
  tur?: "sade" | "vurgu" | "iyi" | "uyari" | "hata";
  children: ReactNode;
}) {
  const bicim = {
    sade: s.etiketSade,
    vurgu: s.etiketVurgu,
    iyi: s.etiketIyi,
    uyari: s.etiketUyari,
    hata: s.etiketHata,
  }[tur];
  return <span className={birlestir(s.etiket, bicim)}>{children}</span>;
}

/* --- boş durum · yükleniyor ------------------------------------------- */

export function BosDurum({
  ikon,
  baslik,
  metin,
  eylem,
}: {
  ikon?: ReactNode;
  baslik: string;
  metin?: string;
  eylem?: ReactNode;
}) {
  return (
    <div className={s.bos}>
      {ikon && <span className={s.bosIkon}>{ikon}</span>}
      <p className={s.bosBaslik}>{baslik}</p>
      {metin && <p className={s.bosMetin}>{metin}</p>}
      {eylem && <div className={s.bosEylem}>{eylem}</div>}
    </div>
  );
}

export function Yuklenirken({ satir = 3 }: { satir?: number }) {
  return (
    <div className={s.yukleniyor} aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: satir }, (_, i) => (
        <div key={i} className={s.iskelet} style={{ width: `${100 - i * 14}%` }} />
      ))}
    </div>
  );
}
