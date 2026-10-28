import React, { useState } from 'react';
import { Copy, Check, Code2 } from 'lucide-react';

interface MarkdownViewProps {
  content: string;
  onInsertCode?: (code: string) => void;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, onInsertCode }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  // 1. Split content by code blocks: ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
  const sections: { type: 'code' | 'text'; lang?: string; code?: string; text?: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      sections.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    sections.push({
      type: 'code',
      lang: match[1] || 'code',
      code: match[2].trimEnd()
    });
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    sections.push({ type: 'text', text: content.slice(lastIndex) });
  }

  // 2. Inline parser for **bold**, `code`, *italic*, [links]
  const renderInline = (str: string, keyPrefix: string): React.ReactNode[] => {
    const tokenRegex = /(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`|\[[^\]]+?\]\([^)]+?\))/g;
    const parts = str.split(tokenRegex);

    return parts.map((part, i) => {
      const key = `${keyPrefix}-${i}`;
      if (!part) return null;

      // **bold** -> remove ** and render strong
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={key} className="font-semibold text-[var(--text-primary)]">
            {part.slice(2, -2)}
          </strong>
        );
      }

      // `code` -> inline code pill
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code key={key} className="px-1.5 py-0.5 mx-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] font-mono text-[11px] text-emerald-400">
            {part.slice(1, -1)}
          </code>
        );
      }

      // *italic*
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <em key={key} className="italic text-[var(--text-secondary)]">
            {part.slice(1, -1)}
          </em>
        );
      }

      // [text](url)
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
            {linkMatch[1]}
          </a>
        );
      }

      return <span key={key}>{part}</span>;
    });
  };

  // 3. Render plain text block with lines, headers, lists, and paragraphs
  const renderTextBlock = (text: string, secIdx: number) => {
    const lines = text.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];
    let isOrderedList = false;

    const flushList = () => {
      if (currentList.length > 0) {
        const listKey = `list-${secIdx}-${elements.length}`;
        if (isOrderedList) {
          elements.push(
            <ol key={listKey} className="list-decimal pl-5 space-y-1 my-1.5 text-[var(--text-primary)]">
              {currentList}
            </ol>
          );
        } else {
          elements.push(
            <ul key={listKey} className="list-disc pl-5 space-y-1 my-1.5 text-[var(--text-primary)]">
              {currentList}
            </ul>
          );
        }
        currentList = [];
      }
    };

    lines.forEach((line, lIdx) => {
      const trimmed = line.trim();
      const lineKey = `line-${secIdx}-${lIdx}`;

      if (!trimmed) {
        flushList();
        return;
      }

      // Headers: ###, ##, #
      if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h4 key={lineKey} className="font-semibold text-[var(--text-primary)] text-xs mt-2.5 mb-1">
            {renderInline(trimmed.slice(4), lineKey)}
          </h4>
        );
        return;
      }
      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h3 key={lineKey} className="font-bold text-[var(--text-primary)] text-[13px] mt-3 mb-1">
            {renderInline(trimmed.slice(3), lineKey)}
          </h3>
        );
        return;
      }
      if (trimmed.startsWith('# ')) {
        flushList();
        elements.push(
          <h2 key={lineKey} className="font-bold text-[var(--text-primary)] text-sm mt-3 mb-1.5">
            {renderInline(trimmed.slice(2), lineKey)}
          </h2>
        );
        return;
      }

      // Bullet lists: - item, * item
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        isOrderedList = false;
        currentList.push(
          <li key={lineKey} className="leading-relaxed">
            {renderInline(trimmed.slice(2), lineKey)}
          </li>
        );
        return;
      }

      // Numbered lists: 1. item
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        isOrderedList = true;
        currentList.push(
          <li key={lineKey} className="leading-relaxed">
            {renderInline(numMatch[2], lineKey)}
          </li>
        );
        return;
      }

      // Regular paragraph line
      flushList();
      elements.push(
        <p key={lineKey} className="my-1 leading-relaxed">
          {renderInline(line, lineKey)}
        </p>
      );
    });

    flushList();
    return <div key={`sec-${secIdx}`}>{elements}</div>;
  };

  return (
    <div className="space-y-1.5 text-xs leading-relaxed select-text">
      {sections.map((sec, idx) => {
        if (sec.type === 'code' && sec.code) {
          const isCopied = copiedIndex === idx;
          return (
            <div key={`code-block-${idx}`} className="my-2 rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-zinc-950/80 shadow-md">
              {/* Code block header bar */}
              <div className="px-3 py-1.5 bg-zinc-900 border-b border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-zinc-400 select-none">
                <span className="font-mono text-zinc-400 uppercase text-[10px] tracking-wider font-semibold">
                  {sec.lang || 'code'}
                </span>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => handleCopy(sec.code!, idx)}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition text-[11px]"
                    title="Скопировать код"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Скопировать</span>
                      </>
                    )}
                  </button>

                  {onInsertCode && (
                    <button
                      onClick={() => onInsertCode(sec.code!)}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 transition text-[11px]"
                      title="Вставить в открытый файл"
                    >
                      <Code2 className="w-3 h-3" />
                      <span>Вставить в файл</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Code text */}
              <pre className="p-3 font-mono text-[11.5px] leading-relaxed text-emerald-300 overflow-x-auto whitespace-pre selection:bg-emerald-900 selection:text-white">
                <code>{sec.code}</code>
              </pre>
            </div>
          );
        }

        return renderTextBlock(sec.text || '', idx);
      })}
    </div>
  );
};
