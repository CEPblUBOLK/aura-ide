import React, { useState, useEffect } from 'react';
import { StickyNote, X, Trash2, Copy, Check } from 'lucide-react';

interface ScratchpadProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Scratchpad: React.FC<ScratchpadProps> = ({ isOpen, onClose }) => {
  const [content, setContent] = useState(() => {
    return localStorage.getItem('aura_scratchpad') || '// Quick Scratchpad & Developer Notes\n// Auto-saves automatically\n';
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem('aura_scratchpad', content);
  }, [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClear = () => {
    if (window.confirm('Clear scratchpad?')) {
      setContent('');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-96 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-2xl text-[var(--text-primary)] select-none flex flex-col space-y-3"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
          <div className="flex items-center space-x-2 text-xs font-semibold text-[var(--text-primary)]">
            <StickyNote className="w-4 h-4 text-amber-500" />
            <span>Developer Scratchpad</span>
            <span className="text-[10px] text-[var(--text-secondary)] font-normal font-mono">auto-saved</span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={handleCopy}
              title="Copy notes"
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleClear}
              title="Clear scratchpad"
              className="p-1 rounded text-[var(--text-secondary)] hover:text-red-500 hover:bg-[var(--bg-hover)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste temporary code snippets, SQL queries, regex, JSON, or task notes..."
          className="flex-1 w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl p-3 text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-color)] resize-none transition-colors"
        />
      </div>
    </div>
  );
};
