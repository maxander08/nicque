/**
 * Display text layout policy (independent from canvas / rendering):
 *
 *  - explicit line breaks are preserved;
 *  - lines wrap on word boundaries, over-long words wrap by character;
 *  - the font size shrinks automatically (from maxFont to minFont) until all lines fit;
 *  - if the text still does not fit at minFont it is clipped and the last visible line ends with "…".
 */

export interface LayoutOptions {
  width: number;
  height: number;
  maxFont: number;
  minFont: number;
  lineHeight: number;
  measure: (text: string, fontSize: number) => number;
}

export interface TextLayout {
  fontSize: number;
  lines: string[];
  truncated: boolean;
}

function wrapParagraph(paragraph: string, size: number, o: LayoutOptions): string[] {
  if (paragraph.length === 0) return [''];
  const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  const push = () => {
    lines.push(current.trimEnd());
    current = '';
  };
  for (const word of words) {
    const isSpace = /^\s+$/.test(word);
    if (isSpace && current === '') continue;
    if (o.measure(current + word, size) <= o.width) {
      current += word;
      continue;
    }
    if (isSpace) {
      push();
      continue;
    }
    if (current !== '') push();
    if (o.measure(word, size) <= o.width) {
      current = word;
      continue;
    }
    // Break an over-long word by code point.
    for (const ch of Array.from(word)) {
      if (current !== '' && o.measure(current + ch, size) > o.width) push();
      current += ch;
    }
  }
  if (current !== '' || lines.length === 0) push();
  return lines;
}

function wrapAll(text: string, size: number, o: LayoutOptions): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((p) => wrapParagraph(p, size, o));
}

function ellipsize(line: string, size: number, o: LayoutOptions): string {
  let chars = Array.from(line);
  while (chars.length > 0 && o.measure(chars.join('') + '…', size) > o.width) chars = chars.slice(0, -1);
  return chars.join('').trimEnd() + '…';
}

export function layoutText(text: string, o: LayoutOptions): TextLayout {
  let size = o.maxFont;
  for (;;) {
    const lines = wrapAll(text, size, o);
    if (lines.length * size * o.lineHeight <= o.height) {
      return { fontSize: size, lines, truncated: false };
    }
    if (size <= o.minFont) {
      const max = Math.max(1, Math.floor(o.height / (size * o.lineHeight)));
      const visible = lines.slice(0, max);
      visible[visible.length - 1] = ellipsize(visible[visible.length - 1], size, o);
      return { fontSize: size, lines: visible, truncated: true };
    }
    size = Math.max(o.minFont, Math.floor(size * 0.93));
  }
}
