import { Ellipsis, Inbox, Monitor, Palette, Pencil, Plus, Star, StarOff, Trash2 } from "lucide-react";
import { useRef, useState, type MouseEvent } from "react";
import { LIST_COLORS } from "@ortak/local-tasks";
import { TODOIST_COLOR_LABELS, TODOIST_COLORS, todoistColorName, type TaskList } from "@ortak/task";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import type { TaskBoard } from "./useTaskBoard";
import s from "./board.module.css";

/**
 * The list column: Inbox, then "Favoriler" and "Projelerim" like Todoist's
 * sidebar. Todoist projects come first, Argos lists after them with a small
 * monitor mark (they do not reach the phone). Right-click, or the ⋯ that
 * replaces the count on hover, opens the list menu:
 * favourite, rename and colour for both; delete only for Argos lists.
 */
export function ListSidebar({
  board,
  activeKey,
  onSelect,
}: {
  board: TaskBoard;
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [menu, setMenu] = useState<{ list: TaskList; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const inbox = board.lists.find((l) => l.inbox);
  const favorites = board.lists.filter((l) => l.favorite && !l.inbox);
  const projects = board.lists.filter((l) => !l.inbox);

  const openMenu = (list: TaskList) => (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ list, x: e.clientX, y: e.clientY });
  };

  const openMenuBelow = (list: TaskList) => (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ list, x: r.left, y: r.bottom + 4 });
  };

  const row = (list: TaskList) =>
    renaming === list.key ? (
      <NameInput
        key={list.key}
        color={list.color}
        initial={list.name}
        onDone={(name) => {
          setRenaming(null);
          if (name && name !== list.name) void board.renameList(list, name);
        }}
      />
    ) : (
      <div key={list.key} className={menu?.list.key === list.key ? `${s.listRow} ${s.listRowMenu}` : s.listRow}>
        <button
          type="button"
          className={list.key === activeKey ? `${s.list} ${s.listActive}` : s.list}
          onClick={() => onSelect(list.key)}
          onContextMenu={openMenu(list)}
        >
          {list.inbox ? <Inbox size={15} className={s.listIcon} /> : <span className={s.dot} style={{ background: list.color }} />}
          <span className={s.listName}>{list.name}</span>
          {list.source === "local" && (
            <span className={s.localMark} title="Argos listesi — telefondaki Todoist'te görünmez">
              <Monitor size={12} />
            </span>
          )}
          <span className={s.count}>{board.counts.get(list.key) || ""}</span>
        </button>
        <button
          type="button"
          className={s.listMore}
          aria-label={`${list.name} menüsü`}
          title="Liste menüsü"
          onClick={openMenuBelow(list)}
        >
          <Ellipsis size={15} />
        </button>
      </div>
    );

  return (
    <nav className={s.sidebar} aria-label="Listeler">
      {inbox && row(inbox)}

      {favorites.length > 0 && (
        <>
          <div className={s.groupTitle}>Favoriler</div>
          {favorites.map(row)}
        </>
      )}

      <div className={s.groupTitle}>
        Projelerim
        <button type="button" className={s.groupAdd} onClick={() => setAdding(true)} title="Yeni Argos listesi">
          <Plus size={14} />
        </button>
      </div>
      {projects.map(row)}
      {adding && (
        <NameInput
          color={LIST_COLORS[board.lists.filter((l) => l.source === "local").length % LIST_COLORS.length]!}
          initial=""
          placeholder="Liste adı"
          onDone={async (name) => {
            setAdding(false);
            const key = name ? await board.createList(name) : null;
            if (key) onSelect(key);
          }}
        />
      )}

      {menu && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)} label={menu.list.name}>
          <MenuItem
            icon={menu.list.favorite ? <StarOff size={15} /> : <Star size={15} />}
            onSelect={() => {
              void board.toggleFavorite(menu.list);
              setMenu(null);
            }}
          >
            {menu.list.favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          </MenuItem>
          {!menu.list.inbox && (
            <>
              <MenuItem
                icon={<Pencil size={15} />}
                onSelect={() => {
                  setRenaming(menu.list.key);
                  setMenu(null);
                }}
              >
                Yeniden adlandır
              </MenuItem>
              <MenuLabel>
                <span className={s.menuLabelIcon}>
                  <Palette size={12} /> Renk
                </span>
              </MenuLabel>
              <ColorSwatches
                list={menu.list}
                onPick={(color) => {
                  void board.recolorList(menu.list, color);
                  setMenu(null);
                }}
              />
            </>
          )}
          {menu.list.source === "local" && (
            <>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 size={15} />}
                onSelect={() => {
                  void board.removeList(menu.list);
                  setMenu(null);
                }}
              >
                Listeyi sil
              </MenuItem>
            </>
          )}
          {menu.list.source === "todoist" && !menu.list.inbox && (
            <MenuLabel>Todoist projesi · değişiklik telefona da gider</MenuLabel>
          )}
        </Popover>
      )}
    </nav>
  );
}

/**
 * Argos lists pick from Argos's own soft palette (stored as hex). Todoist
 * projects pick from Todoist's twenty named colours, so the phone shows the
 * same colour.
 */
function ColorSwatches({ list, onPick }: { list: TaskList; onPick: (color: string) => void }) {
  const todoist = list.source === "todoist";
  const current = todoist ? todoistColorName(list.color) : list.color;
  const options = todoist
    ? Object.entries(TODOIST_COLORS).map(([name, hex]) => ({ value: name, hex, label: TODOIST_COLOR_LABELS[name] ?? name }))
    : LIST_COLORS.map((hex) => ({ value: hex, hex, label: hex }));
  return (
    <div className={todoist ? `${s.swatches} ${s.swatchesWide}` : s.swatches}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === current ? `${s.swatch} ${s.swatchActive}` : s.swatch}
          style={{ background: o.hex }}
          title={todoist ? o.label : undefined}
          aria-label={`Renk ${o.label}`}
          onClick={() => onPick(o.value)}
        />
      ))}
    </div>
  );
}

/** Inline name field for a new or renamed list. Enter saves, Escape or an empty name cancels. */
function NameInput({
  color,
  initial,
  placeholder,
  onDone,
}: {
  color: string;
  initial: string;
  placeholder?: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  // Enter unmounts the field; a blur arriving after that must not save twice.
  const finished = useRef(false);
  const finish = (name: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(name?.trim() || null);
  };
  return (
    <div className={s.nameInput}>
      <span className={s.dot} style={{ background: color }} />
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(value);
          if (e.key === "Escape") finish(null);
        }}
        onBlur={() => finish(value)}
      />
    </div>
  );
}
