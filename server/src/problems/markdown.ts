import { NodeType, parse, type HTMLElement, type Node } from 'node-html-parser';

// Math is kept as LaTeX ($…$ inline, $$…$$ blocks) and typeset by the client, like the judges do.

const SUPERSCRIPT: Record<string, string> = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ', k: 'ᵏ', m: 'ᵐ', x: 'ˣ',
};
const SUBSCRIPT: Record<string, string> = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋',
  i: 'ᵢ', j: 'ⱼ', k: 'ₖ', n: 'ₙ', m: 'ₘ', x: 'ₓ', l: 'ₗ', r: 'ᵣ', s: 'ₛ', t: 'ₜ',
};

/** <sup>/<sub> as Unicode (10⁴, n²), falling back to ^(…) / _(…). Works inside code spans too. */
function script(text: string, map: Record<string, string>, mark: string): string {
  const chars = [...text.replace(/\s+/g, '')];
  if (chars.length && chars.every((c) => map[c])) return chars.map((c) => map[c]).join('');
  return chars.length === 1 ? `${mark}${text.trim()}` : `${mark}(${text.trim()})`;
}

const inlineMath = (tex: string) => (tex.trim() ? `$${tex.trim().replace(/\s+/g, ' ')}$` : '');
const blockMath = (tex: string) => (tex.trim() ? `\n\n$$\n${tex.trim()}\n$$\n\n` : '');

/** Judge delimiters to standard Markdown math: $$$x$$$ (Codeforces) → $x$, \(x\) → $x$, \[x\] → $$x$$. */
export function normalizeMath(text: string): string {
  return text
    .replace(/\${6}([\s\S]+?)\${6}/g, (_, tex: string) => blockMath(tex))
    .replace(/\${3}([\s\S]+?)\${3}/g, (_, tex: string) => inlineMath(tex))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => blockMath(tex))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => inlineMath(tex));
}

function absolute(src: string, base: string): string {
  try {
    return new URL(src, base).href;
  } catch {
    return '';
  }
}

/**
 * A Markdown image. The width the author gave it (`width="600"` or `style="width: 600px"`) travels in
 * the title as "width=600", so high-resolution uploads are shown at their intended size.
 */
export function image(src: string, base: string, alt = '', sizeHint = ''): string {
  const url = absolute(src, base);
  if (!url) return '';
  const width = /^\s*(\d+)\s*(?:px)?\s*$/.exec(sizeHint)?.[1] ?? /(?:^|;)\s*width:\s*(\d+)px/i.exec(sizeHint)?.[1];
  const target = /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url;
  return `![${alt.replace(/[[\]\\]/g, '').trim()}](${target}${width ? ` "width=${width}"` : ''})`;
}

const tagOf = (node: Node) => (node.nodeType === NodeType.ELEMENT_NODE ? ((node as HTMLElement).rawTagName?.toLowerCase() ?? '') : '');
const nbsp = (text: string) => text.replace(/ /g, ' ');

/** Plain text of code or preformatted content: keeps line breaks, renders <sup>/<sub>. */
function plainText(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return nbsp(node.text);
  const el = node as HTMLElement;
  const tag = tagOf(el);
  if (tag === 'br') return '\n';
  if (tag === 'sup') return script(el.text, SUPERSCRIPT, '^');
  if (tag === 'sub') return script(el.text, SUBSCRIPT, '_');
  return el.childNodes.map(plainText).join('');
}

function codeSpan(text: string): string {
  const code = text.replace(/\s*\n\s*/g, ' ').trim();
  if (!code) return '';
  return code.includes('`') ? `\`\` ${code} \`\`` : `\`${code}\``;
}

/** Wraps inline text in ** or *, moving any edge whitespace outside so the Markdown stays valid. */
function emphasis(inner: string, mark: string): string {
  const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  if (!body) return lead || trail ? ' ' : '';
  return `${lead}${mark}${body}${mark}${trail}`;
}

/** An AtCoder input-format block (<pre> with <var>s), typeset line by line as left-aligned math. */
function formatBlock(pre: HTMLElement): string {
  const escapeText = (s: string) => s.replace(/[\\{}$&#^_%~]/g, (c) => `\\${c}`);
  let tex = '';
  const walk = (node: Node) => {
    const tag = tagOf(node);
    if (node.nodeType === NodeType.TEXT_NODE) {
      for (const part of nbsp(node.text).split(/(\n|[ \t]+)/)) {
        if (part === '\n') tex += '\n';
        else if (/^[ \t]+$/.test(part)) tex += '\\ ';
        else if (part) tex += `\\text{${escapeText(part)}}`;
      }
    } else if (tag === 'var') tex += `{${(node as HTMLElement).text.trim()}}`;
    else if (tag === 'br') tex += '\n';
    else (node as HTMLElement).childNodes.forEach(walk);
  };
  pre.childNodes.forEach(walk);
  const lines = tex.split('\n').map((line) => line.replace(/^(\\ )+|(\\ )+$/g, ''));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines.at(-1)) lines.pop();
  return blockMath(`\\begin{array}{l}\n${lines.join(' \\\\\n')}\n\\end{array}`);
}

/** LeetCode's older examples: a <pre> with <strong>Input:</strong> … lines. Shown as a quote block. */
function examplePre(pre: HTMLElement): string {
  const text = pre.childNodes
    .map((node) => (['strong', 'b'].includes(tagOf(node)) ? `**${(node as HTMLElement).text.trim()}**` : plainText(node)))
    .join('');
  return quote(text);
}

/** A Markdown block quote; each non-empty line becomes its own paragraph inside it. */
function quote(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? `\n\n${lines.map((line) => `> ${line}`).join('\n>\n')}\n\n` : '';
}

function table(el: HTMLElement, base: string): string {
  const rows = el.querySelectorAll('tr').map((tr) =>
    tr.childNodes
      .filter((c) => ['td', 'th'].includes(tagOf(c)))
      .map((cell) => inlineImages(render(cell, base)).trim().replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|')),
  );
  if (!rows.length || !rows[0].length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${[...cells, ...Array(width - cells.length).fill('')].join(' | ')} |`;
  return `\n\n${[line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')}\n\n`;
}

// Marks list indentation so it survives the whitespace cleanup in htmlToMarkdown.
const INDENT = '\u0003';
// Wraps each image while rendering, so blocks can lift images out of the text around them.
const IMAGE = '\u0004';
const IMAGE_RUN = new RegExp(`(?:${IMAGE}[^${IMAGE}]*${IMAGE}\\s*)+`, 'g');
const inlineImages = (markdown: string) => markdown.replace(new RegExp(IMAGE, 'g'), '');

/** Each run of neighbouring images becomes its own paragraph (an image row), apart from the text around it. */
function imageRows(markdown: string): string {
  return markdown
    .replace(IMAGE_RUN, (run) => `\n\n${run.split(IMAGE).filter((part) => part.trim()).join(' ')}\n\n`)
    .trim();
}

const isCentered = (el: HTMLElement) =>
  el.rawTagName?.toLowerCase() === 'center' || /text-align:\s*center/i.test(el.getAttribute('style') ?? '') || el.getAttribute('align') === 'center';

/**
 * A block element. Centered blocks (Codeforces puts a figure and its caption in <center>) are wrapped in
 * "::: center" … ":::" so the client keeps the caption centered under the image.
 */
function block(el: HTMLElement, inner: string): string {
  const content = imageRows(inner);
  if (!content) return '';
  const onlyImages = /^(?:!\[[^\]]*\]\([^)]*\)\s*)+$/.test(content);
  if (!isCentered(el) || onlyImages) return `\n\n${content}\n\n`;
  return `\n\n::: center\n\n${content}\n\n:::\n\n`;
}

const SECTION_NAME = /^(constraints?|examples?(\s*\d+)?|notes?|follow[- ]?up|input|output|hints?|subtasks?)$/i;

/**
 * LeetCode writes each example as loose paragraphs after an "Example N" heading. Groups them into one
 * quote block so the example reads as a unit (examples already in a block are left alone).
 */
export function groupExamples(markdown: string): string {
  return markdown.replace(/(^#### Example[^\n]*\n\n)([\s\S]*?)(?=\n#{3,4} |(?![\s\S]))/gm, (match, heading: string, body: string) => {
    if (!body.trim() || body.trimStart().startsWith('>')) return match;
    // A lone label paragraph ("**Explanation:**") joins the text that follows it.
    const paragraphs = body.trim().replace(/^(\*\*[^*\n]+:\*\*)\n{2,}(?=[^#>\n])/gm, '$1 ').split(/\n{2,}/);
    return `${heading}${paragraphs.map((p) => p.split('\n').map((line) => `> ${line}`).join('\n')).join('\n>\n')}\n`;
  });
}

function render(node: Node, base: string): string {
  if (node.nodeType === NodeType.TEXT_NODE) return nbsp(node.text).replace(/\s+/g, ' ');
  if (node.nodeType !== NodeType.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = tagOf(el);
  const inner = () => el.childNodes.map((child) => render(child, base)).join('');

  const has = (name: string) => el.classList?.contains(name);
  if (has('section-title')) return `\n\n### ${el.text.trim()}\n\n`;
  if (has('example-block')) return quote(imageRows(inner()));
  if (has('example-io') || has('tex-font-style-tt')) return codeSpan(plainText(el));
  if (has('tex-font-style-bf')) return emphasis(inner(), '**');
  if (has('tex-font-style-it') || has('tex-font-style-sl')) return emphasis(inner(), '*');

  switch (tag) {
    case 'script':
    case 'style':
    case 'noscript':
    case 'button':
      return '';
    case 'br':
      return '\n';
    case 'p': {
      // A paragraph that is only a bold section name ("Constraints:", "Example 1:") is really a heading.
      const elements = el.childNodes.filter((c) => c.nodeType === NodeType.ELEMENT_NODE);
      const onlyBold = elements.length === 1 && ['strong', 'b'].includes(tagOf(elements[0])) && el.text.trim() === elements[0].text.trim();
      const title = el.text.trim().replace(/\s*:$/, '');
      if (onlyBold && SECTION_NAME.test(title) && !el.closest('.example-block')) {
        return `\n\n${/^example/i.test(title) ? '####' : '###'} ${title}\n\n`;
      }
      return block(el, inner());
    }
    case 'div':
    case 'section':
    case 'center':
      return block(el, inner());
    case 'blockquote':
      return quote(imageRows(inner()));
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n\n### ${inner().trim()}\n\n`;
    case 'strong':
    case 'b':
      return emphasis(inner(), '**');
    case 'em':
    case 'i':
      return emphasis(inner(), '*');
    case 'code':
    case 'tt':
      return codeSpan(plainText(el));
    case 'pre':
      if (el.querySelector('var')) return formatBlock(el);
      if (el.querySelector('strong, b')) return examplePre(el);
      return `\n\n\`\`\`\n${plainText(el).replace(/^\n+|\s+$/g, '')}\n\`\`\`\n\n`;
    case 'var':
      return inlineMath(el.text);
    case 'sup':
      return script(el.text, SUPERSCRIPT, '^');
    case 'sub':
      return script(el.text, SUBSCRIPT, '_');
    case 'ul':
    case 'ol': {
      const items = el.childNodes.filter((c) => tagOf(c) === 'li');
      const list = items.map((li, i) => {
        const marker = tag === 'ol' ? `${i + 1}.` : '-';
        const [first, ...rest] = inlineImages(render(li, base)).trim().replace(/\n{2,}/g, '\n').split('\n');
        const pad = INDENT.repeat(marker.length + 1);
        return [`${marker} ${first.trim()}`, ...rest.map((line) => (line.trim() ? pad + line : line))].join('\n');
      });
      return `\n\n${list.join('\n')}\n\n`;
    }
    case 'img': {
      const md = image(el.getAttribute('src') ?? '', base, el.getAttribute('alt') ?? '', el.getAttribute('width') ?? el.getAttribute('style') ?? '');
      // Marked so the enclosing block can lift it into an image row; tiny icons stay inline in the text.
      const width = Number(/"width=(\d+)"/.exec(md)?.[1] ?? 0);
      return md && !(width && width < 48) ? `${IMAGE}${md}${IMAGE}` : md;
    }
    case 'table':
      return table(el, base);
    default:
      return inner();
  }
}

/** Collapses doubled spaces and spaces before punctuation, leaving code spans and inline math alone. */
function tidyLine(line: string): string {
  return line
    .split(/(`+[^`]*`+|\$[^$]+\$)/)
    .map((part, i) => (i % 2 ? part : part.replace(/ {2,}/g, ' ').replace(/ +([.,;:?)\]]|!(?!\[))/g, '$1').replace(/([([]) +/g, '$1')))
    .join('');
}

/** Whitespace cleanup outside code and math blocks, then the list indentation markers become spaces. */
export function tidyMarkdown(markdown: string): string {
  let fenced = false;
  return markdown
    .split('\n')
    .map((line) => {
      const fence = /^\s*(```|\$\$)\s*$/.test(line);
      if (fence) fenced = !fenced;
      if (fence || fenced) return line.replace(/\s+$/, '');
      return tidyLine(line.trim());
    })
    .join('\n')
    .replace(new RegExp(INDENT, 'g'), ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseHtml(html: string) {
  return parse(html, { blockTextElements: { script: true, noscript: true, style: true } });
}

/** Converts a judge's statement HTML to Markdown (with LaTeX math) that the client renders safely. */
export function htmlToMarkdown(html: string | HTMLElement, base: string): string {
  const root = typeof html === 'string' ? parseHtml(html) : html;
  // Images still marked here sit in lists or tables, where they stay inline.
  return tidyMarkdown(normalizeMath(inlineImages(imageRows(render(root, base)))));
}

/** Text with tags removed, one block per line (used to find "Output:" values in LeetCode examples). */
export function htmlToText(html: string): string {
  return parseHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|pre|li)>/gi, '\n$&')).text.replace(/ /g, ' ');
}
