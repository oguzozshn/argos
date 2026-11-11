import {
  ChevronRight,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  TextQuote,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { BlockType } from "@ortak/sayfalar";

/**
 * What the slash menu and the "turn into" menu list: one row per block type
 * the user can pick. Names are UI text, so they stay in the app's language.
 */
export interface BlockTypeInfo {
  type: Exclude<BlockType, "unknown">;
  name: string;
  description: string;
  /** Markdown shortcut that produces the same block, shown as a hint. */
  hint: string;
  icon: LucideIcon;
  /** Extra words the slash search matches, Turkish and English. */
  keywords: string;
}

export const BLOCK_TYPE_INFO: BlockTypeInfo[] = [
  { type: "paragraph", name: "Metin", description: "Düz metinle yazmaya başla", hint: "", icon: Type, keywords: "yazı paragraf text paragraph" },
  { type: "heading1", name: "Başlık 1", description: "Büyük bölüm başlığı", hint: "#", icon: Heading1, keywords: "baslik h1 heading" },
  { type: "heading2", name: "Başlık 2", description: "Orta bölüm başlığı", hint: "##", icon: Heading2, keywords: "baslik h2 heading" },
  { type: "heading3", name: "Başlık 3", description: "Küçük bölüm başlığı", hint: "###", icon: Heading3, keywords: "baslik h3 heading" },
  { type: "bulleted", name: "Madde listesi", description: "Basit madde imli liste", hint: "-", icon: List, keywords: "madde liste bullet list" },
  { type: "numbered", name: "Numaralı liste", description: "Sıralı liste", hint: "1.", icon: ListOrdered, keywords: "numara sirali liste numbered list" },
  { type: "todo", name: "Yapılacaklar listesi", description: "İşaretlenebilen görevler", hint: "[]", icon: ListTodo, keywords: "yapilacak gorev kutucuk todo checkbox" },
  { type: "toggle", name: "Katlanır liste", description: "İçeriği gizlenip açılır", hint: ">", icon: ChevronRight, keywords: "katlanir ac kapa toggle" },
  { type: "quote", name: "Alıntı", description: "Bir alıntıyı öne çıkar", hint: '"', icon: TextQuote, keywords: "alinti quote" },
  { type: "callout", name: "Not kutusu", description: "Öne çıkan, renkli zeminli not", hint: "", icon: Lightbulb, keywords: "not kutu vurgu callout" },
  { type: "code", name: "Kod", description: "Eş aralıklı kod bloğu", hint: "```", icon: Code, keywords: "kod code" },
  { type: "divider", name: "Ayraç", description: "Blokları ayıran ince çizgi", hint: "---", icon: Minus, keywords: "ayrac cizgi divider line" },
];

/** Search key: lowercase, Turkish letters folded so "baslik" finds "Başlık". */
const fold = (text: string): string =>
  text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

export function searchBlockTypes(query: string): BlockTypeInfo[] {
  const q = fold(query.trim());
  if (q === "") return BLOCK_TYPE_INFO;
  return BLOCK_TYPE_INFO.filter((t) => fold(`${t.name} ${t.keywords}`).includes(q));
}
