import React, { useState, useRef, useEffect } from 'react';
import { 
  Columns, 
  Terminal, 
  Sidebar as SidebarIcon, 
  Search, 
  FolderOpen, 
  Sun, 
  Moon, 
  Play,
  Maximize2,
  Minimize2,
  X,
  Minus,
  ChevronDown,
  Globe,
  Eye,
  Bot,
  Settings2,
  Palette,
  Check
} from 'lucide-react';
import { ThemeMode, PythonEnv, RustStatus, OpenTab } from '../types';

interface TitleBarProps {
  projectName: string;
  activeFilePath?: string;
  activeTab?: OpenTab;
  activePythonEnv?: PythonEnv;
  rustStatus?: RustStatus;
  currentCompilerName?: string;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onOpenCommandPalette: () => void;
  onToggleSidebar: () => void;
  onToggleTerminal: () => void;
  onToggleSplit: () => void;
  onTogglePreview: () => void;
  onRunCode: () => void;
  onOpenRunConfig?: () => void;
  onOpenPythonModal: () => void;
  isSplit: boolean;
  isPreviewOpen: boolean;
  isSidebarOpen: boolean;
  isTerminalOpen: boolean;
  isAiOpen?: boolean;
  onToggleAi: () => void;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  onOpenFolderDialog: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  projectName,
  activeFilePath,
  activeTab,
  activePythonEnv,
  rustStatus,
  currentCompilerName,
  theme,
  onThemeChange,
  onOpenCommandPalette,
  onToggleSidebar,
  onToggleTerminal,
  onToggleSplit,
  onTogglePreview,
  onRunCode,
  onOpenRunConfig,
  onOpenPythonModal,
  isSplit,
  isPreviewOpen,
  isSidebarOpen,
  isTerminalOpen,
  isAiOpen,
  onToggleAi,
  isZenMode,
  onToggleZenMode,
  onOpenFolderDialog,
}) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl';

  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isThemeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isThemeMenuOpen]);

  const themesList: { id: ThemeMode; label: string; bg: string; accent: string }[] = [
    { id: 'macos-dark', label: 'macOS Dark', bg: '#18181a', accent: '#0a84ff' },
    { id: 'macos-light', label: 'macOS Light', bg: '#f5f5f7', accent: '#007aff' },
    { id: 'tokyo-night', label: 'Tokyo Night', bg: '#1a1b26', accent: '#7aa2f7' },
    { id: 'dracula', label: 'Dracula', bg: '#282a36', accent: '#ff79c6' },
    { id: 'one-dark', label: 'One Dark Pro', bg: '#21252b', accent: '#61afef' },
    { id: 'github-dark', label: 'GitHub Dark', bg: '#0d1117', accent: '#2f81f7' },
    { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', bg: '#1e1e2e', accent: '#cba6f7' },
    { id: 'gruvbox-dark', label: 'Gruvbox Dark', bg: '#282828', accent: '#fabd2f' },
    { id: 'nord', label: 'Nord Frost', bg: '#2e3440', accent: '#88c0d0' },
    { id: 'solarized-dark', label: 'Solarized Dark', bg: '#002b36', accent: '#2aa198' },
    { id: 'monokai-pro', label: 'Monokai Pro', bg: '#2d2a2e', accent: '#ffd866' },
    { id: 'cyberpunk', label: 'Cyberpunk Neon', bg: '#0a0a0d', accent: '#00f0ff' },
    { id: 'vesper', label: 'Vesper Pitch Black', bg: '#101010', accent: '#ffc799' },
  ];

  const currentThemeObj = themesList.find(t => t.id === theme) || themesList[0];

  const lang = activeTab?.language || '';
  const isWeb = lang === 'html' || lang === 'css' || activeTab?.name.endsWith('.html');
  const isPython = lang === 'python';
  const isRust = lang === 'rust' || rustStatus?.hasCargo;
  const isCpp = lang === 'cpp' || lang === 'c';
  const isGo = lang === 'go';
  const isJava = lang === 'java';
  const isCSharp = lang === 'csharp';
  const isJsTs = lang === 'javascript' || lang === 'typescript';

  const getRunLabel = () => {
    if (isWeb) return 'Live Preview';
    if (currentCompilerName) return `Run (${currentCompilerName})`;
    if (isPython) return 'Run Python';
    if (isRust) return 'Cargo Run';
    if (isCpp) return 'Run C/C++';
    if (isGo) return 'Go Run';
    if (isJava) return 'Java Run';
    if (isCSharp) return 'Dotnet Run';
    if (isJsTs) return 'Run Node';
    return 'Run Code';
  };

  const postWinMessage = (msg: string) => {
    if ((window as any).chrome?.webview?.postMessage) {
      try { (window as any).chrome.webview.postMessage(msg); } catch {}
    }
  };

  const handleTrafficClose = () => {
    postWinMessage('window-close');
    try { window.close(); } catch {}
  };

  const handleTrafficMinimize = () => {
    postWinMessage('window-minimize');
  };

  const handleTrafficFullscreen = () => {
    if ((window as any).chrome?.webview?.postMessage) {
      postWinMessage('window-fullscreen-toggle');
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const handleTrafficMaximize = () => {
    if ((window as any).chrome?.webview?.postMessage) {
      postWinMessage('window-maximize');
    } else {
      handleTrafficFullscreen();
    }
  };

  return (
    <header 
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, input, a')) {
          handleTrafficMaximize();
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, a, .traffic-group')) {
          postWinMessage('window-drag');
        }
      }}
      className="h-10 w-full flex items-center justify-between px-3.5 border-b select-none transition-colors duration-200 z-30 shrink-0
      bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-primary)] cursor-default">
      
      {/* Left: macOS Traffic Lights & Project Info */}
      <div className="flex items-center space-x-3.5">
        <div className="flex items-center space-x-2 traffic-group py-1 pr-2">
          {/* Close */}
          <button 
            onClick={handleTrafficClose}
            title="Close"
            className="traffic-btn bg-[#ff5f56] hover:brightness-95 border border-[#e0443e]/40 shadow-sm"
          >
            <X className="w-2.5 h-2.5 text-[#4a0002] stroke-[3]" />
          </button>
          
          {/* Minimize */}
          <button 
            onClick={handleTrafficMinimize}
            title="Minimize Window"
            className="traffic-btn bg-[#ffbd2e] hover:brightness-95 border border-[#dea123]/40 shadow-sm"
          >
            <Minus className="w-2.5 h-2.5 text-[#543b00] stroke-[3]" />
          </button>
          
          {/* Fullscreen (Full Display covering Taskbar) */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleTrafficFullscreen(); }}
            title="Полноэкранный режим / Fullscreen (F11)"
            className="traffic-btn bg-[#27c93f] hover:brightness-95 border border-[#1aab29]/40 shadow-sm"
          >
            <Maximize2 className="w-2 h-2 text-[#004d0f] stroke-[3]" />
          </button>
        </div>

        {/* Sidebar Toggle & Workspace Open */}
        <div className="flex items-center space-x-1 pl-1">
          <button
            onClick={onToggleSidebar}
            title={`Toggle Sidebar (${modKey}+B)`}
            className={`p-1.5 rounded-md transition-all text-sm ${
              isSidebarOpen 
                ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <SidebarIcon className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenFolderDialog}
            title="Open Folder / Workspace"
            className="flex items-center space-x-1.5 px-2 py-1 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border-subtle)]"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--accent-color)]" />
            <span className="hidden sm:inline font-mono">{projectName}</span>
          </button>
        </div>
      </div>

      {/* Center: Spotlight Search / Command Palette Bar */}
      <div className="flex-1 max-w-md mx-4">
        <button
          onClick={onOpenCommandPalette}
          className="w-full h-7 px-3 flex items-center justify-between rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent-color)] transition-all text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] group shadow-inner"
        >
          <div className="flex items-center space-x-2 truncate">
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] group-hover:text-[var(--accent-color)] transition-colors" />
            <span className="truncate">
              {activeFilePath ? (
                <span className="font-mono text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)]">{projectName}/</span>
                  {activeFilePath}
                </span>
              ) : (
                <span>Search files & commands</span>
              )}
            </span>
          </div>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            {modKey}P
          </kbd>
        </button>
      </div>

      {/* Right: Actions (Run, Preview, Split, Terminal, Theme) */}
      <div className="flex items-center space-x-2">
        {/* Run / Preview Play Button with Launch Settings */}
        {activeTab && (
          <div className="flex items-center rounded-lg shadow-sm overflow-hidden">
            <button
              onClick={isWeb ? onTogglePreview : onRunCode}
              title={isWeb ? "Toggle Live Web Preview" : `Запустить код (${modKey}+F5)`}
              className={`flex items-center space-x-1.5 px-2.5 py-1 text-white text-xs font-semibold transition-all active:scale-95 ${
                isWeb ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {isWeb ? <Eye className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span className="hidden sm:inline">
                {getRunLabel()}
              </span>
            </button>
            {!isWeb && onOpenRunConfig && (
              <button
                onClick={onOpenRunConfig}
                title="Параметры запуска и выбор компилятора"
                className="bg-emerald-700 hover:bg-emerald-600 text-white px-1.5 py-1 text-xs border-l border-emerald-600/60 transition"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Web Preview Toggle */}
        <button
          onClick={onTogglePreview}
          title="Toggle Live Web Browser Preview"
          className={`p-1.5 rounded-md transition-all ${
            isPreviewOpen 
              ? 'bg-[var(--accent-subtle)] text-[var(--accent-color)] border border-[var(--border-subtle)]' 
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Globe className="w-4 h-4" />
        </button>

        {/* Split Editor Toggle */}
        <button
          onClick={onToggleSplit}
          title="Split Editor"
          className={`p-1.5 rounded-md transition-all ${
            isSplit 
              ? 'bg-[var(--accent-subtle)] text-[var(--accent-color)] border border-[var(--border-subtle)]' 
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Columns className="w-4 h-4" />
        </button>

        {/* Terminal Toggle */}
        <button
          onClick={onToggleTerminal}
          title={`Toggle Terminal (${modKey}+\`)`}
          className={`p-1.5 rounded-md transition-all ${
            isTerminalOpen 
              ? 'bg-[var(--accent-subtle)] text-[var(--accent-color)] border border-[var(--border-subtle)]' 
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Terminal className="w-4 h-4" />
        </button>

        {/* Zen Focus Mode Toggle */}
        <button
          onClick={onToggleZenMode}
          title={isZenMode ? "Exit Zen Focus Mode" : "Enter Zen Focus Mode"}
          className={`p-1.5 rounded-md transition-all ${
            isZenMode 
              ? 'bg-[var(--accent-subtle)] text-[var(--accent-color)] border border-[var(--border-subtle)]' 
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Eye className="w-4 h-4" />
        </button>

        {/* AI Assistant (Google AI & DeepSeek) */}
        <button
          onClick={onToggleAi}
          title={`AI Assistant (Google AI & DeepSeek) (${modKey}+Shift+A)`}
          className={`p-1.5 rounded-md transition-all ${
            isAiOpen 
              ? 'bg-[var(--accent-subtle)] text-[var(--accent-color)] border border-[var(--border-subtle)]' 
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Bot className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

        {/* Theme Switcher Button & Dropdown */}
        <div className="relative" ref={themeMenuRef}>
          <button
            onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
            title={`Тема оформления: ${currentThemeObj.label}. Нажмите для выбора.`}
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all flex items-center space-x-1.5"
          >
            <div 
              className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
              style={{ backgroundColor: currentThemeObj.accent }}
            />
            <span className="text-[11px] font-medium hidden sm:inline">{currentThemeObj.label}</span>
            <ChevronDown className="w-3 h-3 text-[var(--text-secondary)] opacity-60" />
          </button>

          {isThemeMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-50 text-xs">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] border-b border-[var(--border-subtle)] mb-1">
                Темы оформления ({themesList.length})
              </div>
              <div className="max-h-72 overflow-y-auto py-0.5">
                {themesList.map((t) => {
                  const isCur = t.id === theme;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        onThemeChange(t.id);
                        setIsThemeMenuOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 flex items-center justify-between text-left transition hover:bg-[var(--bg-hover)] ${
                        isCur ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <div 
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm shrink-0" 
                          style={{ backgroundColor: t.accent }} 
                        />
                        <span className="truncate">{t.label}</span>
                      </div>
                      {isCur && <Check className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
