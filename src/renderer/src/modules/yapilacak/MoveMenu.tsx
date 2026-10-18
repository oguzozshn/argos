import { Search } from "lucide-react";
import { useState } from "react";
import { plain } from "@ortak/hobi-ara";
import type { Task, TaskList } from "@ortak/task";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui/Popover";
import s from "./board.module.css";

/**
 * "Listeye taşı": every other list, Todoist projects and Argos lists alike
 * (issue #54), with a search box on top (issue #53). The search ignores case
 * and Turkish letters; Enter moves to the first match.
 */
export function MoveMenu({
  task,
  lists,
  x,
  y,
  onMove,
  onClose,
  header,
}: {
  task: Task;
  lists: TaskList[];
  x: number;
  y: number;
  onMove: (list: TaskList) => void;
  onClose: () => void;
  /** Items above the search (the row menu's "Geri"). */
  header?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const q = plain(query.trim());
  const targets = lists.filter((l) => !(l.source === task.listSource && l.id === task.listId));
  const shown = q ? targets.filter((l) => plain(l.name).includes(q)) : targets;
  const groups: { label: string; lists: TaskList[] }[] = [
    { label: "Todoist", lists: shown.filter((l) => l.source === "todoist") },
    { label: "Argos listeleri", lists: shown.filter((l) => l.source === "local") },
  ].filter((g) => g.lists.length > 0);

  return (
    <Popover x={x} y={y} onClose={onClose} label="Listeye taşı" className={s.moveMenu}>
      {header}
      <div className={s.moveSearch}>
        <Search size={14} />
        <input
          autoFocus
          value={query}
          placeholder="Liste ara…"
          aria-label="Liste ara"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              e.preventDefault();
              onMove(shown[0]);
            }
          }}
        />
      </div>
      {groups.length === 0 && <MenuLabel>{q ? "Eşleşen liste yok" : "Taşınacak başka liste yok"}</MenuLabel>}
      {groups.map((g, i) => (
        <div key={g.label}>
          {i > 0 && <MenuSeparator />}
          <MenuLabel>{g.label}</MenuLabel>
          {g.lists.map((l) => (
            <MenuItem key={l.key} icon={<span className={s.dot} style={{ background: l.color }} />} onSelect={() => onMove(l)}>
              {l.name}
            </MenuItem>
          ))}
        </div>
      ))}
      {task.source === "todoist" && shown.some((l) => l.source === "local") && (
        <MenuLabel>Argos listesine taşınan görev telefondaki Todoist'ten kalkar.</MenuLabel>
      )}
    </Popover>
  );
}
