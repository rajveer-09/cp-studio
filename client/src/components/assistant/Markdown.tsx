import { Check, Copy, GitCompare } from 'lucide-react';
import { memo, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { reviewCodeBlock } from '../../lib/assistant';
import { LANGUAGE_META, languageFromFence } from '../../lib/languages';
import { monaco } from '../../lib/monaco';
import { copyText } from '../../lib/platform';
import { useStore } from '../../store';
import type { Language } from '../../types';
import { cn } from '../ui';

/** Only offer "Review & apply" for blocks that look like a whole program, not a fragment. */
function looksLikeFullProgram(code: string, language: Language): boolean {
  if (language === 'cpp') return /\bmain\s*\(/.test(code);
  if (language === 'java') return /\bclass\s+\w+/.test(code) && /static\s+void\s+main/.test(code);
  return code.split('\n').length >= 4;
}

function CodeBlock({ code, tag }: { code: string; tag?: string }) {
  const language = languageFromFence(tag);
  const theme = useStore((s) => s.theme);
  const aiBusy = useStore((s) => s.aiBusy);
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!language) return setHtml(null);
    let cancelled = false;
    monaco.editor.colorize(code, LANGUAGE_META[language].monaco, { tabSize: 4 }).then((result) => !cancelled && setHtml(result));
    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  const copy = async () => {
    await copyText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-line bg-panel-2">
      <div className="flex h-8 items-center justify-between border-b border-line pr-1.5 pl-3 text-[11px] text-subtle">
        <span className="font-mono">{tag || 'text'}</span>
        <div className="flex items-center gap-0.5">
          {language && !aiBusy && looksLikeFullProgram(code, language) && (
            <button
              type="button"
              onClick={() => reviewCodeBlock(code, language)}
              className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-hover hover:text-fg"
            >
              <GitCompare className="size-3" />
              Review &amp; apply
            </button>
          )}
          <button type="button" onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-hover hover:text-fg">
            {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed">
        {html ? <code className="colorized" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
    </div>
  );
}

function Code({ className, children }: { className?: string; children?: ReactNode }) {
  const text = String(children ?? '');
  const tag = /language-([\w+#-]+)/.exec(className ?? '')?.[1];
  if (!tag && !text.includes('\n')) return <code>{children}</code>;
  return <CodeBlock code={text.replace(/\n$/, '')} tag={tag} />;
}

export const Markdown = memo(function Markdown({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className={cn('chat-md', streaming && 'stream-caret')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: Code,
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
  );
});
