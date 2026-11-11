import { Popover } from "@/ui/Popover";
import s from "./sayfalar.module.css";

/** A fixed, small set: page icons are labels, not a full emoji keyboard. */
const EMOJIS = [
  "📄", "📝", "📒", "📓", "📔", "📕", "📗", "📘", "📙", "📚",
  "📌", "📎", "🔖", "🗂️", "🗒️", "🗓️", "📅", "⏰", "✅", "☑️",
  "💡", "🎯", "🚀", "⭐", "🔥", "✨", "⚡", "🏆", "🎓", "🧠",
  "💻", "🖥️", "⌨️", "🛠️", "⚙️", "🔧", "🔬", "🧪", "📐", "📊",
  "📈", "💰", "💳", "🏦", "🛒", "🏠", "🚗", "✈️", "🌍", "🗺️",
  "🏃", "🏋️", "🚴", "🧘", "🍎", "☕", "🍽️", "🎵", "🎬", "🎮",
  "📷", "🎨", "✏️", "📖", "🌱", "🌙", "☀️", "❤️", "🤝", "👤",
];

export function EmojiPicker({
  x,
  y,
  current,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  current: string;
  /** Empty string removes the icon. */
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <Popover x={x} y={y} onClose={onClose} label="Sayfa ikonu" className={s.emojiPicker}>
      <div className={s.emojiGrid}>
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className={e === current ? `${s.emojiButton} ${s.emojiButtonCurrent}` : s.emojiButton}
            onClick={() => onPick(e)}
          >
            {e}
          </button>
        ))}
      </div>
      {current && (
        <button type="button" className={s.emojiRemove} onClick={() => onPick("")}>
          İkonu kaldır
        </button>
      )}
    </Popover>
  );
}
