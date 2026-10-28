import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Terminal, 
  Save, 
  Columns, 
  Sun, 
  Moon, 
  GitCommit, 
  FilePlus, 
  FolderOpen,
  Code,
  Bot
} from 'lucide-react';
import { FileNode } from '../types';
import { getFileIcon } from '../utils/fileIcons';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileNode[];
  onSelectFile: (node: FileNode) => void;
  onExecuteCommand: (commandId: string) => void;
}

interface PaletteItem {
  id: string;
  title: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  node?: FileNode | null;
}

const STATIC_COMMANDS: PaletteItem[] = [
  { id: 'toggle-ai', title: 'AI: Toggle AI Assistant Panel', category: 'AI', icon: <Bot className="w-4 h-4 text-[var(--accent-color)]" />, shortcut: 'Ctrl+Shift+A' },
  { id: 'ai-google', title: 'AI: Ask Google AI Search (udm=50)', category: 'AI', icon: <Search className="w-4 h-4 text-blue-400" /> },
  { id: 'ai-deepseek', title: 'AI: Open DeepSeek AI Chat', category: 'AI', icon: <Bot className="w-4 h-4 text-emerald-400" /> },
  { id: 'save-file', title: 'File: Save Active File', category: 'File', icon: <Save className="w-4 h-4 text-[var(--accent-color)]" />, shortcut: 'Ctrl+S' },
  { id: 'new-file', title: 'File: Create New File', category: 'File', icon: <FilePlus className="w-4 h-4 text-emerald-400" />, shortcut: 'Ctrl+N' },
  { id: 'open-workspace', title: 'File: Open Workspace', category: 'File', icon: <FolderOpen className="w-4 h-4 text-amber-400" />, shortcut: 'Ctrl+O' },
  { id: 'toggle-split', title: 'View: Toggle Split Editor', category: 'View', icon: <Columns className="w-4 h-4 text-purple-400" /> },
  { id: 'toggle-terminal', title: 'Terminal: Toggle Integrated Terminal', category: 'Terminal', icon: <Terminal className="w-4 h-4 text-amber-400" />, shortcut: 'Ctrl+`' },
  { id: 'toggle-minimap', title: 'Editor: Toggle Minimap', category: 'Editor', icon: <Code className="w-4 h-4 text-cyan-400" /> },
  { id: 'toggle-wordwrap', title: 'Editor: Toggle Word Wrap', category: 'Editor', icon: <Code className="w-4 h-4 text-pink-400" /> },
  { id: 'switch-theme-macos-dark', title: 'Preferences: Theme: macOS Sonoma Dark', category: 'Theme', icon: <Moon className="w-4 h-4 text-[var(--accent-color)]" /> },
  { id: 'switch-theme-macos-light', title: 'Preferences: Theme: macOS Cupertino Light', category: 'Theme', icon: <Sun className="w-4 h-4 text-amber-500" /> },
  { id: 'switch-theme-tokyo-night', title: 'Preferences: Theme: Tokyo Night', category: 'Theme', icon: <Moon className="w-4 h-4 text-indigo-400" /> },
  { id: 'switch-theme-dracula', title: 'Preferences: Theme: Dracula Official', category: 'Theme', icon: <Moon className="w-4 h-4 text-pink-400" /> },
  { id: 'switch-theme-one-dark', title: 'Preferences: Theme: One Dark Pro', category: 'Theme', icon: <Moon className="w-4 h-4 text-sky-400" /> },
  { id: 'switch-theme-github-dark', title: 'Preferences: Theme: GitHub Dark Default', category: 'Theme', icon: <Moon className="w-4 h-4 text-blue-400" /> },
  { id: 'switch-theme-catppuccin-mocha', title: 'Preferences: Theme: Catppuccin Mocha', category: 'Theme', icon: <Moon className="w-4 h-4 text-purple-400" /> },
  { id: 'switch-theme-gruvbox-dark', title: 'Preferences: Theme: Gruvbox Dark', category: 'Theme', icon: <Moon className="w-4 h-4 text-yellow-500" /> },
  { id: 'switch-theme-solarized-dark', title: 'Preferences: Theme: Solarized Dark', category: 'Theme', icon: <Moon className="w-4 h-4 text-teal-400" /> },
  { id: 'switch-theme-monokai-pro', title: 'Preferences: Theme: Monokai Pro', category: 'Theme', icon: <Moon className="w-4 h-4 text-rose-400" /> },
  { id: 'switch-theme-cyberpunk', title: 'Preferences: Theme: Cyberpunk Neon 2077', category: 'Theme', icon: <Moon className="w-4 h-4 text-cyan-400" /> },
  { id: 'switch-theme-nord', title: 'Preferences: Theme: Nord Frost', category: 'Theme', icon: <Moon className="w-4 h-4 text-teal-300" /> },
  { id: 'switch-theme-vesper', title: 'Preferences: Theme: Vesper Pitch Black', category: 'Theme', icon: <Moon className="w-4 h-4 text-orange-300" /> },
  { id: 'git-commit', title: 'Git: Commit Changes', category: 'Git', icon: <GitCommit className="w-4 h-4 text-green-400" /> },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  files,
  onSelectFile,
  onExecuteCommand,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flattening only occurs when files tree reference changes
  const flattenedFiles = useMemo(() => {
    const getAllFiles = (nodes: FileNode[]): FileNode[] => {
      const result: FileNode[] = [];
      for (const node of nodes) {
        if (!node.isDirectory) result.push(node);
        if (node.children) result.push(...getAllFiles(node.children));
      }
      return result;
    };
    return getAllFiles(files);
  }, [files]);

  const filteredItems = useMemo<PaletteItem[]>(() => {
    if (!isOpen) return [];
    const isCommandMode = query.startsWith('>');
    const filterQuery = isCommandMode ? query.slice(1).trim().toLowerCase() : query.trim().toLowerCase();

    if (isCommandMode) {
      return STATIC_COMMANDS.filter(c => c.title.toLowerCase().includes(filterQuery));
    }

    return [
      ...flattenedFiles
        .filter(f => f.name.toLowerCase().includes(filterQuery) || f.relativePath.toLowerCase().includes(filterQuery))
        .map(f => ({
          id: `file:${f.path}`,
          title: f.relativePath,
          category: 'Files',
          icon: getFileIcon(f.name, false),
          node: f,
        })),
      ...STATIC_COMMANDS
        .filter(c => c.title.toLowerCase().includes(filterQuery))
        .map(c => ({ ...c, node: null })),
    ].slice(0, 30);
  }, [isOpen, query, flattenedFiles]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) {
        if (item.node) onSelectFile(item.node);
        else onExecuteCommand(item.id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-spotlight backdrop-blur-2xl overflow-hidden flex flex-col animate-spotlight text-[var(--text-primary)] select-none"
      >
        <div className="flex items-center px-4 py-3 border-b border-[var(--border-subtle)] space-x-3 bg-[var(--bg-secondary)]">
          <Search className="w-5 h-5 text-[var(--accent-color)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a file name, or '>' for commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none font-sans"
          />
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
              No matching files or commands
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.node) onSelectFile(item.node);
                    else onExecuteCommand(item.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent-color)] text-[var(--accent-text)] font-semibold shadow-sm'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate min-w-0">
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.title}</span>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className={`text-[10px] uppercase font-semibold tracking-wider ${
                      isSelected ? 'text-[var(--accent-text)] opacity-85' : 'text-[var(--text-secondary)]'
                    }`}>
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        isSelected ? 'bg-black/15 text-[var(--accent-text)]' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                      }`}>
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <span>Navigate: <kbd className="font-mono text-[var(--text-primary)]">↑</kbd> <kbd className="font-mono text-[var(--text-primary)]">↓</kbd></span>
          <span>Select: <kbd className="font-mono text-[var(--text-primary)]">↵ Enter</kbd></span>
        </div>
      </div>
    </div>
  );
};
