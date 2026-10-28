import React, { useState, useEffect } from 'react';
import { 
  Files, 
  Search, 
  GitBranch, 
  Settings as SettingsIcon,
  Bot,
  Check,
  GitCommit,
  ArrowRight,
  AlertCircle,
  FileCode,
  Sliders,
  Type,
  Layout,
  Volume2,
  StickyNote,
  Plus,
  Minus,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import { FileNode, GitFile, SearchResult, EditorSettings, ThemeMode } from '../types';
import { FileTree } from './FileTree';
import { getFileIcon } from '../utils/fileIcons';

interface SidebarProps {
  tree: FileNode[];
  activeFilePath?: string;
  gitFiles: GitFile[];
  gitBranch: string;
  isGitRepo: boolean;
  settings: EditorSettings;
  isAiOpen?: boolean;
  onToggleAi?: () => void;
  onUpdateSettings: (newSettings: Partial<EditorSettings>) => void;
  onOpenScratchpad: () => void;
  onFileSelect: (node: FileNode) => void;
  onOpenFileByPath: (path: string, line?: number) => void;
  onOpenDiff: (gitFile: GitFile) => void;
  onRefreshFiles: () => void;
  onRefreshGit: () => void;
  onCommitGit: (message: string) => Promise<void>;
  onStageFile?: (file: string) => Promise<void>;
  onUnstageFile?: (file: string) => Promise<void>;
  onDiscardFile?: (file: string, status: string) => Promise<void>;
  onGitPush?: () => Promise<void>;
  onGitPull?: () => Promise<void>;
  onCreateFile: (parentDir: string, name: string) => Promise<void>;
  onCreateFolder: (parentDir: string, name: string) => Promise<void>;
  onDeleteItem: (path: string) => Promise<void>;
  onRenameItem: (oldPath: string, newPath: string) => Promise<void>;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  tree,
  activeFilePath,
  gitFiles,
  gitBranch,
  isGitRepo,
  settings,
  isAiOpen,
  onToggleAi,
  onUpdateSettings,
  onOpenScratchpad,
  onFileSelect,
  onOpenFileByPath,
  onOpenDiff,
  onRefreshFiles,
  onRefreshGit,
  onCommitGit,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onGitPush,
  onGitPull,
  onCreateFile,
  onCreateFolder,
  onDeleteItem,
  onRenameItem,
}) => {
  const [activeTab, setActiveTab] = useState<'explorer' | 'search' | 'git' | 'settings'>('explorer');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSyncingGit, setIsSyncingGit] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(searchQuery)}&matchCase=${matchCase}&isRegex=${useRegex}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, matchCase, useRegex]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?query=${encodeURIComponent(searchQuery)}&matchCase=${matchCase}&isRegex=${useRegex}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      await onCommitGit(commitMessage.trim());
      setCommitMessage('');
      onRefreshGit();
    } catch (err) {
      alert('Git commit failed: ' + (err as Error).message);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="flex h-full w-full select-none bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] text-[var(--text-primary)]">
      {/* Activity Bar (macOS Icon column) */}
      <div className="w-12 shrink-0 flex flex-col items-center py-2.5 space-y-3 border-r border-[var(--border-subtle)] bg-[var(--bg-primary)]">
        <button
          onClick={() => setActiveTab('explorer')}
          title="Explorer (Files)"
          className={`p-2 rounded-xl transition-all relative ${
            activeTab === 'explorer'
              ? 'text-[var(--text-primary)] bg-[var(--bg-hover)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Files className="w-5 h-5" />
          {activeTab === 'explorer' && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--accent-color)] rounded-r" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('search')}
          title="Search"
          className={`p-2 rounded-xl transition-all relative ${
            activeTab === 'search'
              ? 'text-[var(--text-primary)] bg-[var(--bg-hover)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Search className="w-5 h-5" />
          {activeTab === 'search' && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--accent-color)] rounded-r" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('git')}
          title="Source Control (Git)"
          className={`p-2 rounded-xl transition-all relative ${
            activeTab === 'git'
              ? 'text-[var(--text-primary)] bg-[var(--bg-hover)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <GitBranch className="w-5 h-5" />
          {gitFiles.length > 0 && (
            <span className="absolute top-1 right-1 px-1 py-0.5 bg-[var(--accent-color)] text-[var(--accent-text)] text-[9px] font-bold rounded-full min-w-[14px] text-center">
              {gitFiles.length}
            </span>
          )}
          {activeTab === 'git' && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--accent-color)] rounded-r" />
          )}
        </button>

        {/* AI Assistant Button */}
        {onToggleAi && (
          <button
            onClick={onToggleAi}
            title="AI Assistant (Google AI & DeepSeek) (Ctrl+Shift+A)"
            className={`p-2 rounded-xl transition-all relative ${
              isAiOpen
                ? 'text-[var(--accent-color)] bg-[var(--accent-subtle)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Bot className="w-5 h-5" />
            {isAiOpen && (
              <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--accent-color)] rounded-r" />
            )}
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setActiveTab('settings')}
          title="Settings"
          className={`p-2 rounded-xl transition-all relative ${
            activeTab === 'settings'
              ? 'text-[var(--text-primary)] bg-[var(--bg-hover)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <SettingsIcon className="w-5 h-5" />
          {activeTab === 'settings' && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--accent-color)] rounded-r" />
          )}
        </button>
      </div>

      {/* Main Sidebar Pane Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeTab === 'explorer' && (
          <FileTree
            tree={tree}
            activeFilePath={activeFilePath}
            onFileSelect={onFileSelect}
            onRefresh={onRefreshFiles}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onDeleteItem={onDeleteItem}
            onRenameItem={onRenameItem}
          />
        )}

        {/* Search Panel */}
        {activeTab === 'search' && (
          <div className="flex flex-col h-full p-3 space-y-3">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
              Search Workspace
            </div>
            <form onSubmit={handleSearch} className="space-y-2">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Search in all files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg pl-2.5 pr-14 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-color)] transition-colors"
                />
                <div className="absolute right-1.5 flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setMatchCase(prev => !prev)}
                    title="Match Case"
                    className={`px-1 py-0.5 rounded text-[10px] font-mono transition ${matchCase ? 'bg-[var(--accent-color)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                  >
                    Aa
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseRegex(prev => !prev)}
                    title="Use Regular Expression"
                    className={`px-1 py-0.5 rounded text-[10px] font-mono transition ${useRegex ? 'bg-[var(--accent-color)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                  >
                    .*
                  </button>
                </div>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pt-2">
              <div className="text-[10px] text-[var(--text-secondary)] font-medium">
                {isSearching ? 'Searching...' : `${searchResults.length} results found`}
              </div>
              {searchResults.map((res, idx) => (
                <div
                  key={idx}
                  onClick={() => onOpenFileByPath(res.file, res.line)}
                  className="p-2 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] cursor-pointer border border-transparent hover:border-[var(--border-subtle)] transition-colors group"
                >
                  <div className="flex items-center space-x-1.5 text-xs text-[var(--accent-color)] font-medium truncate">
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{res.relativePath}</span>
                    <span className="text-[var(--text-secondary)] text-[10px]">:{res.line}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--text-primary)] truncate pl-5">
                    {res.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source Control / Git Panel */}
        {activeTab === 'git' && (
          <div className="flex flex-col h-full p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
                Source Control
              </div>
              {isGitRepo && (
                <div className="flex items-center space-x-1">
                  <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent-color)] border border-[var(--border-subtle)] text-[10px] font-mono">
                    <GitBranch className="w-3 h-3" />
                    <span>{gitBranch}</span>
                  </div>
                  {onGitPull && (
                    <button
                      onClick={async () => {
                        setIsSyncingGit(true);
                        try { await onGitPull(); onRefreshGit(); } catch {} finally { setIsSyncingGit(false); }
                      }}
                      title="Git Pull"
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                    >
                      <ArrowDown className={`w-3.5 h-3.5 ${isSyncingGit ? 'animate-bounce' : ''}`} />
                    </button>
                  )}
                  {onGitPush && (
                    <button
                      onClick={async () => {
                        setIsSyncingGit(true);
                        try { await onGitPush(); onRefreshGit(); } catch {} finally { setIsSyncingGit(false); }
                      }}
                      title="Git Push"
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                    >
                      <ArrowUp className={`w-3.5 h-3.5 ${isSyncingGit ? 'animate-bounce' : ''}`} />
                    </button>
                  )}
                  <button
                    onClick={onRefreshGit}
                    title="Refresh Git Status"
                    className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {!isGitRepo ? (
              <div className="p-4 text-center text-xs text-[var(--text-secondary)]">
                Workspace is not a Git repository
              </div>
            ) : (
              <>
                {/* Commit Box */}
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    placeholder="Commit message (Cmd+Enter to commit)..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        handleCommit();
                      }
                    }}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-color)] transition-colors resize-none"
                  />
                  <button
                    onClick={handleCommit}
                    disabled={isCommitting || !commitMessage.trim() || gitFiles.length === 0}
                    className="w-full flex items-center justify-center space-x-1.5 py-1.5 bg-[var(--accent-color)] hover:brightness-110 disabled:opacity-50 text-[var(--accent-text)] font-semibold rounded-md text-xs transition-colors shadow-sm"
                  >
                    <GitCommit className="w-3.5 h-3.5" />
                    <span>{isCommitting ? 'Committing...' : 'Commit All Changes'}</span>
                  </button>
                </div>

                {/* Staged & Unstaged Changes Lists */}
                <div className="flex-1 overflow-y-auto space-y-3 pt-1">
                  {/* Staged Changes */}
                  {gitFiles.filter(f => f.staged).length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-emerald-400 font-medium px-1">
                        <span>Staged Changes</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
                          {gitFiles.filter(f => f.staged).length}
                        </span>
                      </div>
                      {gitFiles.filter(f => f.staged).map((file) => (
                        <div
                          key={`staged-${file.file}`}
                          onClick={() => onOpenDiff(file)}
                          className="flex items-center justify-between p-1.5 rounded-md hover:bg-[var(--bg-hover)] cursor-pointer group text-xs text-[var(--text-primary)]"
                          title="Click to view Side-by-Side Diff"
                        >
                          <div className="flex items-center space-x-1.5 truncate min-w-0 pr-1">
                            {getFileIcon(file.file, false)}
                            <span className="truncate">{file.file}</span>
                          </div>
                          <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {onUnstageFile && (
                              <button
                                onClick={async () => { await onUnstageFile(file.file); onRefreshGit(); }}
                                title="Unstage Changes (-)"
                                className="p-0.5 rounded hover:bg-[var(--bg-active)] text-[var(--text-secondary)] hover:text-amber-400 opacity-0 group-hover:opacity-100 transition"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                            )}
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-500/10">
                              {file.status[0].toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unstaged Changes */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-medium px-1">
                      <span>Changes</span>
                      <span className="text-[10px] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded-full">
                        {gitFiles.filter(f => !f.staged).length}
                      </span>
                    </div>

                    {gitFiles.filter(f => !f.staged).length === 0 && gitFiles.filter(f => f.staged).length === 0 ? (
                      <div className="text-center py-6 text-xs text-[var(--text-secondary)]">
                        No changes detected
                      </div>
                    ) : (
                      gitFiles.filter(f => !f.staged).map((file) => (
                        <div
                          key={`unstaged-${file.file}`}
                          onClick={() => onOpenDiff(file)}
                          className="flex items-center justify-between p-1.5 rounded-md hover:bg-[var(--bg-hover)] cursor-pointer group text-xs text-[var(--text-primary)]"
                          title="Click to view Side-by-Side Diff"
                        >
                          <div className="flex items-center space-x-1.5 truncate min-w-0 pr-1">
                            {getFileIcon(file.file, false)}
                            <span className="truncate">{file.file}</span>
                          </div>
                          <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {onStageFile && (
                              <button
                                onClick={async () => { await onStageFile(file.file); onRefreshGit(); }}
                                title="Stage Changes (+)"
                                className="p-0.5 rounded hover:bg-[var(--bg-active)] text-[var(--text-secondary)] hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            )}
                            {onDiscardFile && (
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Discard changes in ${file.file}?`)) {
                                    await onDiscardFile(file.file, file.status);
                                    onRefreshGit();
                                  }
                                }}
                                title="Discard Changes"
                                className="p-0.5 rounded hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              file.status === 'modified' ? 'text-amber-500 bg-amber-500/10' :
                              file.status === 'untracked' ? 'text-green-500 bg-green-500/10' :
                              file.status === 'added' ? 'text-blue-500 bg-blue-500/10' :
                              'text-red-500 bg-red-500/10'
                            }`}>
                              {file.status[0].toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Settings Panel */}
        {activeTab === 'settings' && (
          <div className="flex flex-col h-full p-3 space-y-4 overflow-y-auto text-xs text-[var(--text-primary)]">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
              Preferences
            </div>

            {/* Theme */}
            <div className="space-y-1.5">
              <label className="text-[var(--text-primary)] font-medium flex items-center space-x-1.5">
                <Layout className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span>Theme</span>
              </label>
              <select
                value={settings.theme}
                onChange={(e) => onUpdateSettings({ theme: e.target.value as ThemeMode })}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]"
              >
                <option value="macos-dark">macOS Sonoma Dark</option>
                <option value="macos-light">macOS Cupertino Light</option>
                <option value="tokyo-night">Tokyo Night</option>
                <option value="dracula">Dracula Official</option>
                <option value="one-dark">One Dark Pro</option>
                <option value="github-dark">GitHub Dark Default</option>
                <option value="catppuccin-mocha">Catppuccin Mocha</option>
                <option value="gruvbox-dark">Gruvbox Dark</option>
                <option value="nord">Nord Frost</option>
                <option value="solarized-dark">Solarized Dark</option>
                <option value="monokai-pro">Monokai Pro</option>
                <option value="cyberpunk">Cyberpunk Neon 2077</option>
                <option value="vesper">Vesper Pitch Black</option>
              </select>
            </div>

            {/* Font Family */}
            <div className="space-y-1.5">
              <label className="text-[var(--text-primary)] font-medium flex items-center space-x-1.5">
                <Type className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span>Font Family</span>
              </label>
              <select
                value={settings.fontFamily}
                onChange={(e) => onUpdateSettings({ fontFamily: e.target.value })}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)] font-mono"
              >
                <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                <option value="'Fira Code', monospace">Fira Code</option>
                <option value="Menlo, Monaco, monospace">Menlo / Monaco</option>
                <option value="Consolas, monospace">Consolas</option>
              </select>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-primary)] font-medium">Font Size</span>
                <span className="text-[var(--text-secondary)] font-mono">{settings.fontSize}px</span>
              </div>
              <input
                type="range"
                min={11}
                max={22}
                value={settings.fontSize}
                onChange={(e) => onUpdateSettings({ fontSize: parseInt(e.target.value) })}
                className="w-full accent-[var(--accent-color)]"
              />
            </div>

            {/* Tab Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-primary)] font-medium">Tab Size</span>
                <span className="text-[var(--text-secondary)] font-mono">{settings.tabSize} spaces</span>
              </div>
              <div className="flex space-x-2">
                {[2, 4].map(size => (
                  <button
                    key={size}
                    onClick={() => onUpdateSettings({ tabSize: size })}
                    className={`flex-1 py-1 rounded-md text-xs font-mono transition-colors ${
                      settings.tabSize === size
                        ? 'bg-[var(--accent-color)] text-[var(--accent-text)] font-bold'
                        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {size} spaces
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[var(--text-primary)]">Minimap</span>
                <input
                  type="checkbox"
                  checked={settings.minimap}
                  onChange={(e) => onUpdateSettings({ minimap: e.target.checked })}
                  className="rounded accent-[var(--accent-color)] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[var(--text-primary)]">Word Wrap</span>
                <input
                  type="checkbox"
                  checked={settings.wordWrap === 'on'}
                  onChange={(e) => onUpdateSettings({ wordWrap: e.target.checked ? 'on' : 'off' })}
                  className="rounded accent-[var(--accent-color)] w-4 h-4 cursor-pointer"
                />
              </label>

              {/* AI Copilot (Gemini 3.1 Flash-Lite) Toggle */}
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-[var(--accent-color)]">
                  <Bot className="w-3.5 h-3.5" />
                  <span>AI Копилот (Gemini 3.1 Flash-Lite)</span>
                </div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[var(--text-primary)] text-xs">Автодополнение на лету (Copilot)</span>
                  <input
                    type="checkbox"
                    checked={settings.aiCopilotEnabled !== false}
                    onChange={(e) => onUpdateSettings({ aiCopilotEnabled: e.target.checked })}
                    className="rounded accent-[var(--accent-color)] w-4 h-4 cursor-pointer"
                  />
                </label>
                <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                  Показывает серый ghost-текст прямо в строке при паузе 400мс. Вставка по нажатию <kbd className="px-1 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] font-mono text-[9px]">Tab</kbd> или принудительно по <kbd className="px-1 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] font-mono text-[9px]">Alt + \</kbd>.
                </p>
              </div>

              <button
                onClick={onOpenScratchpad}
                className="w-full flex items-center justify-center space-x-2 py-2 mt-2 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors font-medium text-xs"
              >
                <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                <span>Open Developer Scratchpad</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
