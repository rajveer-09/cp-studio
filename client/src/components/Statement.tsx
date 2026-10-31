import 'katex/dist/katex.min.css';
import type { Element, ElementContent } from 'hast';
import type { Parent, Root, RootContent } from 'mdast';
import { Check, Copy, ExternalLink, ImageOff, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { copyText } from '../lib/platform';

function Pre({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(ref.current?.textContent ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="statement-pre group relative">
      <pre ref={ref}>{children}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy"
        className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-hover hover:text-fg focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

const ZoomContext = createContext<(image: { src: string; alt: string }) => void>(() => {});

/** An image in a white frame (diagrams are drawn for white pages), shown at the author's width; click to enlarge. */
function StatementImage({ src, alt = '', title }: { src?: string; alt?: string; title?: string }) {
  const zoom = useContext(ZoomContext);
  const [failed, setFailed] = useState(false);
  if (!src) return null;
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="statement-image-missing">
        <ImageOff className="size-3.5" />
        Image unavailable. Open the original
        <ExternalLink className="size-3" />
      </a>
    );
  }
  const width = /^width=(\d+)$/.exec(title ?? '')?.[1];
  return (
    <button type="button" className="statement-image" onClick={() => zoom({ src, alt })} aria-label={alt ? `Enlarge image: ${alt}` : 'Enlarge image'}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={width ? { width: `${width}px` } : undefined}
        onError={() => setFailed(true)}
      />
    </button>
  );
}

/** "::: center" … ":::" (from a judge's <center> block, e.g. a figure and its caption) becomes a centered block. */
function remarkCenter() {
  const marker = (node: RootContent) =>
    node.type === 'paragraph' && node.children.length === 1 && node.children[0].type === 'text' ? node.children[0].value.trim() : null;
  const wrap = (parent: Parent) => {
    const out: RootContent[] = [];
    let group: RootContent[] | null = null;
    for (const child of parent.children as RootContent[]) {
      const text = marker(child);
      if (text === '::: center') {
        group = [];
        continue;
      }
      if (text === ':::' && group) {
        out.push({ type: 'blockquote', children: group, data: { hName: 'div', hProperties: { className: ['statement-center'] } } } as RootContent);
        group = null;
        continue;
      }
      if ('children' in child) wrap(child as Parent);
      (group ?? out).push(child);
    }
    parent.children = [...out, ...(group ?? [])] as Parent['children'];
  };
  return (tree: Root) => wrap(tree);
}

const isImage = (node: ElementContent): node is Element => node.type === 'element' && node.tagName === 'img';
const isFiller = (node: ElementContent) => (node.type === 'text' && !node.value.trim()) || (node.type === 'element' && node.tagName === 'br');

/** A paragraph of nothing but images becomes a centered row: one image in the middle, two or three side by side. */
function Paragraph({ node, children }: { node?: Element; children?: ReactNode }) {
  const images = node?.children.filter(isImage) ?? [];
  if (!images.length || !node!.children.every((c) => isImage(c) || isFiller(c))) return <p>{children}</p>;
  return (
    <div className="statement-figure" data-count={Math.min(images.length, 3)}>
      {images.map((img, i) => (
        <StatementImage
          key={i}
          src={String(img.properties.src ?? '')}
          alt={String(img.properties.alt ?? '')}
          title={img.properties.title ? String(img.properties.title) : undefined}
        />
      ))}
    </div>
  );
}

function Lightbox({ image, onClose }: { image: { src: string; alt: string } | null; onClose: () => void }) {
  return (
    <Dialog.Root open={Boolean(image)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          onClick={onClose}
          className="dialog-content fixed inset-0 z-50 grid cursor-zoom-out place-items-center p-6 outline-none"
        >
          <Dialog.Title className="sr-only">{image?.alt || 'Image'}</Dialog.Title>
          {image && (
            <img
              src={image.src}
              alt={image.alt}
              referrerPolicy="no-referrer"
              className="max-h-[88vh] max-w-[92vw] rounded-xl bg-white object-contain p-3 shadow-pop"
            />
          )}
          <Dialog.Close className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Close">
            <X className="size-4" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A problem statement: Markdown with LaTeX math typeset by KaTeX, as on the judge's site. Loaded on demand.
 * `enhanced` restyles the same content for reading (LeetCode-like headings, examples and code pills).
 */
export default function Statement({ content, enhanced = false }: { content: string; enhanced?: boolean }) {
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  return (
    <ZoomContext.Provider value={setZoomed}>
      <div className={enhanced ? 'statement statement-enhanced' : 'statement'}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkCenter]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
          components={{
            pre: Pre,
            p: Paragraph,
            img: ({ src, alt, title }) => <StatementImage src={typeof src === 'string' ? src : undefined} alt={alt} title={title} />,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      <Lightbox image={zoomed} onClose={() => setZoomed(null)} />
    </ZoomContext.Provider>
  );
}
