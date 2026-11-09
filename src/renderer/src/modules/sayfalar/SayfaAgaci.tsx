import { ChevronDown, ChevronRight, CornerUpLeft, Ellipsis, FileText, Plus, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { pageTitle, type PageMeta } from "@ortak/sayfalar";
import { MenuItem, MenuSeparator, Popover } from "@/ui/Popover";
import type { SayfaAgaci as Agac } from "./kanca";
import s from "./sayfalar.module.css";

/**
 * Sol sütun: sayfa ağacı. Satırın üstüne gelince + (alt sayfa) ve ⋯ (menü)
 * çıkar; sağ tık da menüyü açar. Katlama ağaç dosyasında duruyor, böylece
 * pencere kapanıp açılınca aynı yerden devam ediyor.
 */
export function SayfaAgaci({
  agac,
  acikId,
  onSec,
}: {
  agac: Agac;
  acikId: string | null;
  onSec: (id: string) => void;
}) {
  const [menu, setMenu] = useState<{ page: PageMeta; x: number; y: number } | null>(null);
  const [silinecek, setSilinecek] = useState<PageMeta | null>(null);

  const menuAc = (page: PageMeta) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ page, x: e.clientX, y: e.clientY });
  };

  const altEkle = async (parentId: string) => {
    const id = await agac.ekle(parentId);
    if (!id) return;
    // Yeni sayfa görünsün: üstü katlıysa açılır.
    void agac.guncelle(parentId, { collapsed: false });
    onSec(id);
  };

  return (
    <aside className={s.kenar}>
      <div className={s.kenarBas}>
        <h2 className={s.kenarBaslik}>Sayfalar</h2>
        <button
          type="button"
          className={s.kenarEkle}
          title="Yeni sayfa"
          aria-label="Yeni sayfa"
          onClick={() => void agac.ekle(null).then((id) => id && onSec(id))}
        >
          <Plus size={15} />
        </button>
      </div>

      {agac.anahat.length === 0 && !agac.yukleniyor && (
        <p className={s.kenarBos}>Henüz sayfa yok. Üstteki + ile ilk sayfanı aç.</p>
      )}

      <div className={s.agac}>
        {agac.anahat.map(({ page, depth, hasChildren }) => (
          <div
            key={page.id}
            className={page.id === acikId ? `${s.agacSatir} ${s.agacSatirAcik}` : s.agacSatir}
            style={{ paddingLeft: 6 + depth * 14 }}
          >
            <button
              type="button"
              className={s.katla}
              aria-label={hasChildren ? (page.collapsed ? "Alt sayfaları aç" : "Alt sayfaları kapat") : "Alt sayfa yok"}
              disabled={!hasChildren}
              onClick={() => void agac.guncelle(page.id, { collapsed: !page.collapsed })}
            >
              {hasChildren ? page.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} /> : <span />}
            </button>
            <button type="button" className={s.agacAd} onClick={() => onSec(page.id)} onContextMenu={menuAc(page)}>
              <span className={s.agacIkon}>{page.icon || <FileText size={14} />}</span>
              <span className={s.agacMetin}>{pageTitle(page)}</span>
            </button>
            <button
              type="button"
              className={s.agacDugme}
              title="Alt sayfa ekle"
              aria-label={`${pageTitle(page)} altına sayfa ekle`}
              onClick={() => void altEkle(page.id)}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className={s.agacDugme}
              title="Sayfa menüsü"
              aria-label={`${pageTitle(page)} menüsü`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ page, x: r.left, y: r.bottom + 4 });
              }}
            >
              <Ellipsis size={14} />
            </button>
          </div>
        ))}
      </div>

      {menu && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)} label={pageTitle(menu.page)}>
          <MenuItem
            icon={<Plus size={15} />}
            onSelect={() => {
              void altEkle(menu.page.id);
              setMenu(null);
            }}
          >
            Alt sayfa ekle
          </MenuItem>
          {menu.page.parentId !== null && (
            <MenuItem
              icon={<CornerUpLeft size={15} />}
              onSelect={() => {
                void agac.tasi(menu.page.id, null);
                setMenu(null);
              }}
            >
              En üste taşı
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem
            danger
            icon={<Trash2 size={15} />}
            onSelect={() => {
              setSilinecek(menu.page);
              setMenu(null);
            }}
          >
            Sil
          </MenuItem>
        </Popover>
      )}

      {/*
        Silme onayı: bir sayfayı silmek altındaki bütün ağacı ve gövde
        dosyalarını götürüyor, geri alma yok — sorulmadan yapılmaz.
      */}
      {silinecek && (
        <div className={s.onayZemini} role="dialog" aria-modal="true" aria-label="Sayfayı sil">
          <div className={s.onay}>
            <p>
              <strong>{pageTitle(silinecek)}</strong> silinsin mi? Altındaki sayfalar da silinir, geri alınamaz.
            </p>
            <div className={s.onayDugmeler}>
              <button type="button" className={s.onayVazgec} onClick={() => setSilinecek(null)}>
                Vazgeç
              </button>
              <button
                type="button"
                className={s.onaySil}
                onClick={() => {
                  void agac.sil(silinecek.id);
                  setSilinecek(null);
                }}
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
