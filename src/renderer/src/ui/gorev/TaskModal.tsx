import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@ortak/task";
import type { TaskBoard } from "@/veri/task-board";
import { TaskPanel } from "./TaskPanel";
import s from "./gorev.module.css";

/**
 * The large task view (issue #55), like a Notion page opened over its
 * board: big title, properties in rows, and room to write the description.
 * Opened by double-clicking a task or the ⤢ of the side panel. Esc, the ✕
 * or a click outside closes it.
 *
 * It is rendered into the body: `position: fixed` is measured against a
 * transformed ancestor, and a Bugün card sits inside one (the grid moves its
 * cells with a transform), which would cut the modal down to the card.
 */
export function TaskModal({ task, board, onClose }: { task: Task; board: TaskBoard; onClose: () => void }) {
  useEffect(() => {
    // Capture phase, before the screen's own shortcuts: Esc closes this first, not the side panel under it.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const editing = (e.target as HTMLElement | null)?.closest("textarea, input");
      if (editing) return; // the field's own Esc undoes the edit first
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  return createPortal(
    <div className={s.modalArka} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={task.title}>
        <TaskPanel task={task} board={board} onClose={onClose} variant="buyuk" />
      </div>
    </div>,
    document.body,
  );
}
