import { Inbox, Monitor, Palette, Pencil, Plus, Star, StarOff, Trash2 } from "lucide-react";
import { useRef, useState, type MouseEvent } from "react";
import { LIST_COLORS } from "@ortak/local-tasks";
import type { TaskList } from "@ortak/task";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import type { TaskBoard } from "./useTaskBoard";
import s from "./board.module.css";

/**
 * The list column: Inbox, then "Favoriler" and "Projelerim" like Todoist's
 * sidebar. Todoist projects come first, Argos lists after them with a small
 * monitor mark (they do not reach the phone). Right-click opens the list menu.
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
      <button
        key={list.key}
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
          {menu.list.source === "local" && (
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
              <div className={s.swatches}>
                {LIST_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={c === menu.list.color ? `${s.swatch} ${s.swatchActive}` : s.swatch}
                    style={{ background: c }}
                    aria-label={`Renk ${c}`}
                    onClick={() => {
                      void board.recolorList(menu.list, c);
                      setMenu(null);
                    }}
                  />
                ))}
              </div>
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
          {menu.list.source === "todoist" && (
            <MenuLabel>Todoist projesi · adı ve rengi Todoist'ten değişir</MenuLabel>
          )}
        </Popover>
      )}
    </nav>
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
