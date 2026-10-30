import { EMOJI_PATTERN, iconForEmoji } from '../components/PremiumIcon';

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

/** Real emoji only: ©, ™, ↔ and similar symbols are pictographic too but read as plain text. */
const isEmoji = (s: string) => s.includes('️') || s.codePointAt(0)! >= 0x2600;

function splitText(text: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const match of text.matchAll(EMOJI_PATTERN)) {
    const icon = iconForEmoji(match[0]);
    if (!icon && !isEmoji(match[0])) continue;
    let end = match.index + match[0].length;
    if (!icon && text[end] === ' ') end++; // a dropped emoji shouldn't leave a double space
    if (match.index > last) out.push({ type: 'text', value: text.slice(last, match.index) });
    if (icon) out.push({ type: 'emojiIcon', data: { hName: 'span', hProperties: { dataIcon: icon } }, children: [] });
    last = end;
  }
  if (last === 0) return [{ type: 'text', value: text }];
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

function walk(node: MdNode) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitText(child.value ?? '');
    walk(child);
    return [child];
  });
}

/** Remark plugin: emoji become `<span data-icon>` (rendered as PremiumIcon); unknown emoji are dropped. Code is untouched. */
export function remarkEmojiIcons() {
  return (tree: MdNode) => walk(tree);
}
