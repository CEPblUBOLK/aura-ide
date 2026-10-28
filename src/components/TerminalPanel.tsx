import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { 
  Terminal as TerminalIcon, 
  X, 
  Maximize2, 
  Minimize2, 
  Trash2, 
  RotateCw,
  Copy,
  Clipboard,
  Play,
  Plus
} from 'lucide-react';
import { ThemeMode } from '../types';

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  height: number;
  onResizeHeight: (newHeight: number) => void;
  pendingCommand?: string | null;
  onCommandExecuted?: () => void;
  theme?: ThemeMode;
  onOpenFileByPath?: (file: string, line?: number) => void;
}

interface TermTab {
  id: string;
  name: string;
  isRunTab?: boolean;
}

interface TermSession {
  term: XTerm;
  fitAddon: FitAddon;
  socket: WebSocket;
  isReady: boolean;
}

export const getTerminalTheme = (t: ThemeMode) => {
  switch (t) {
    case 'tokyo-night':
      return {
        background: '#16161e',
        foreground: '#c0caf5',
        cursor: '#7aa2f7',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      };
    case 'dracula':
      return {
        background: '#21222c',
        foreground: '#f8f8f2',
        cursor: '#ff79c6',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      };
    case 'cyberpunk':
      return {
        background: '#060608',
        foreground: '#f0f0f5',
        cursor: '#00f0ff',
        black: '#101015',
        red: '#ff0055',
        green: '#00ff66',
        yellow: '#ffe600',
        blue: '#00f0ff',
        magenta: '#ff007f',
        cyan: '#00ffff',
        white: '#f0f0f5',
        brightBlack: '#303040',
        brightRed: '#ff3377',
        brightGreen: '#33ff88',
        brightYellow: '#ffea33',
        brightBlue: '#33f3ff',
        brightMagenta: '#ff3399',
        brightCyan: '#33ffff',
        brightWhite: '#ffffff',
      };
    case 'nord':
      return {
        background: '#242933',
        foreground: '#d8dee9',
        cursor: '#88c0d0',
        black: '#2e3440',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
        brightBlack: '#4c566a',
        brightRed: '#bf616a',
        brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b',
        brightBlue: '#81a1c1',
        brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb',
        brightWhite: '#eceff4',
      };
    case 'one-dark':
      return {
        background: '#1e1e24',
        foreground: '#abb2bf',
        cursor: '#528bff',
        black: '#1e1e24',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      };
    case 'macos-light':
      return {
        background: '#f5f5f7',
        foreground: '#1d1d1f',
        cursor: '#0071e3',
        black: '#e5e5ea',
        red: '#ff3b30',
        green: '#34c759',
        yellow: '#ff9500',
        blue: '#0071e3',
        magenta: '#af52de',
        cyan: '#55bef0',
        white: '#1d1d1f',
        brightBlack: '#8e8e93',
        brightRed: '#ff453a',
        brightGreen: '#32d74b',
        brightYellow: '#ffd60a',
        brightBlue: '#0a84ff',
        brightMagenta: '#bf5af2',
        brightCyan: '#64d2ff',
        brightWhite: '#000000',
      };
    case 'github-dark':
      return {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#2f81f7',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#f2cc60',
        blue: '#2f81f7',
        magenta: '#d2a8ff',
        cyan: '#79c0ff',
        white: '#e6edf3',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#aff5b4',
        brightYellow: '#f9e698',
        brightBlue: '#79c0ff',
        brightMagenta: '#eddeff',
        brightCyan: '#b3f0ff',
        brightWhite: '#ffffff',
      };
    case 'catppuccin-mocha':
      return {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#cba6f7',
        black: '#181825',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#89dceb',
        white: '#cdd6f4',
        brightBlack: '#6c7086',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5',
        brightWhite: '#ffffff',
      };
    case 'gruvbox-dark':
      return {
        background: '#282828',
        foreground: '#ebdbb2',
        cursor: '#fabd2f',
        black: '#282828',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#a89984',
        brightBlack: '#928374',
        brightRed: '#fb4934',
        brightGreen: '#b8bb26',
        brightYellow: '#fabd2f',
        brightBlue: '#83a598',
        brightMagenta: '#d3869b',
        brightCyan: '#8ec07c',
        brightWhite: '#ebdbb2',
      };
    case 'solarized-dark':
      return {
        background: '#002b36',
        foreground: '#93a1a1',
        cursor: '#2aa198',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#002b36',
        brightRed: '#cb4b16',
        brightGreen: '#586e75',
        brightYellow: '#657b83',
        brightBlue: '#839496',
        brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1',
        brightWhite: '#fdf6e3',
      };
    case 'monokai-pro':
      return {
        background: '#2d2a2e',
        foreground: '#fcfcfa',
        cursor: '#ffd866',
        black: '#2d2a2e',
        red: '#ff6188',
        green: '#a9dc76',
        yellow: '#ffd866',
        blue: '#fc9867',
        magenta: '#ab9df2',
        cyan: '#78dce8',
        white: '#fcfcfa',
        brightBlack: '#727072',
        brightRed: '#ff6188',
        brightGreen: '#a9dc76',
        brightYellow: '#ffd866',
        brightBlue: '#fc9867',
        brightMagenta: '#ab9df2',
        brightCyan: '#78dce8',
        brightWhite: '#ffffff',
      };
    case 'vesper':
      return {
        background: '#101010',
        foreground: '#ffffff',
        cursor: '#ffc799',
        black: '#101010',
        red: '#ff8080',
        green: '#99ffe4',
        yellow: '#ffc799',
        blue: '#acd0f5',
        magenta: '#ffb3d9',
        cyan: '#80fff0',
        white: '#ffffff',
        brightBlack: '#444444',
        brightRed: '#ff9999',
        brightGreen: '#b3ffeb',
        brightYellow: '#ffd6b3',
        brightBlue: '#c4dff8',
        brightMagenta: '#ffc6e3',
        brightCyan: '#a6fff5',
        brightWhite: '#ffffff',
      };
    case 'macos-dark':
    default:
      return {
        background: '#141416',
        foreground: '#f4f4f5',
        cursor: '#10b981',
        black: '#18181b',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#f4f4f5',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#e879f9',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      };
  }
};

export const TerminalPanel: React.FC<TerminalPanelProps> = React.memo(({
  isOpen,
  onClose,
  height,
  onResizeHeight,
  pendingCommand,
  onCommandExecuted,
  theme = 'macos-dark',
  onOpenFileByPath,
}) => {
  // Tabs: General interactive terminal + dedicated Run terminal
  const [tabs, setTabs] = useState<TermTab[]>([
    { id: 'general', name: 'PowerShell' }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('general');

  // DOM elements mapped by tab id (rendered directly by React!)
  const containerMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // Active terminal sessions mapped by tab id (never destroyed on tab switch)
  const sessionsRef = useRef<Map<string, TermSession>>(new Map());
  const pendingRunCommandRef = useRef<string | null>(null);

  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const onOpenFileByPathRef = useRef(onOpenFileByPath);
  useEffect(() => {
    onOpenFileByPathRef.current = onOpenFileByPath;
  }, [onOpenFileByPath]);

  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.port === '5173' ? `${window.location.hostname}:3001` : window.location.host;
    return `${protocol}//${host}/terminal`;
  }, []);

  const safeFit = useCallback((tabId: string) => {
    const sess = sessionsRef.current.get(tabId);
    const container = containerMapRef.current.get(tabId);
    if (!sess || !container) return;
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      try {
        sess.fitAddon.fit();
        if (sess.socket.readyState === WebSocket.OPEN) {
          sess.socket.send(JSON.stringify({ type: 'resize', cols: sess.term.cols, rows: sess.term.rows }));
        }
      } catch {}
    }
  }, []);

  const tryExecutePending = useCallback(() => {
    const cmd = pendingRunCommandRef.current;
    if (!cmd) return;
    const sess = sessionsRef.current.get('run');
    if (sess && sess.socket.readyState === WebSocket.OPEN && sess.isReady) {
      sess.socket.send(JSON.stringify({ type: 'execute', command: cmd }));
      pendingRunCommandRef.current = null;
      if (onCommandExecuted) onCommandExecuted();
    }
  }, [onCommandExecuted]);

  const initSession = useCallback((tabId: string, initialCommand?: string) => {
    const container = containerMapRef.current.get(tabId);
    if (!container) return;

    if (sessionsRef.current.has(tabId)) {
      const sess = sessionsRef.current.get(tabId)!;
      // If the socket is dead or closed, purge and recreate
      if (sess.socket.readyState === WebSocket.CLOSED || sess.socket.readyState === WebSocket.CLOSING) {
        try { sess.term.dispose(); } catch {}
        sessionsRef.current.delete(tabId);
        container.innerHTML = '';
      } else {
        const cmdToSend = initialCommand || (tabId === 'run' ? pendingRunCommandRef.current : null);
        if (cmdToSend) {
          if (sess.socket.readyState === WebSocket.OPEN) {
            sess.socket.send(JSON.stringify({ type: 'execute', command: cmdToSend }));
            if (tabId === 'run') {
              pendingRunCommandRef.current = null;
              if (onCommandExecuted) onCommandExecuted();
            }
          } else {
            sess.socket.addEventListener('open', () => {
              setTimeout(() => {
                sess.socket.send(JSON.stringify({ type: 'execute', command: cmdToSend }));
                if (tabId === 'run') {
                  pendingRunCommandRef.current = null;
                  if (onCommandExecuted) onCommandExecuted();
                }
              }, 250);
            }, { once: true });
          }
        }
        return;
      }
    }

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      theme: getTerminalTheme(themeRef.current),
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    if (onOpenFileByPath && typeof (term as any).registerLinkProvider === 'function') {
      try {
        (term as any).registerLinkProvider({
          provideLinks: (bufferLineNumber: number, callback: (links: any[]) => void) => {
            const line = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true);
            if (!line) {
              callback([]);
              return;
            }
            const links: any[] = [];
            const regex1 = /([\w./\\-]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?/g;
            const regex2 = /File\s+"([^"]+)",\s+line\s+(\d+)/g;
            let m: RegExpExecArray | null;
            while ((m = regex1.exec(line)) !== null) {
              const file = m[1];
              const lineNum = parseInt(m[2], 10);
              const startIdx = m.index + 1;
              const endIdx = startIdx + m[0].length;
              links.push({
                range: { start: { x: startIdx, y: bufferLineNumber }, end: { x: endIdx, y: bufferLineNumber } },
                text: m[0],
                activate: () => {
                  onOpenFileByPathRef.current?.(file, lineNum);
                }
              });
            }
            while ((m = regex2.exec(line)) !== null) {
              const file = m[1];
              const lineNum = parseInt(m[2], 10);
              const startIdx = m.index + 1;
              const endIdx = startIdx + m[0].length;
              links.push({
                range: { start: { x: startIdx, y: bufferLineNumber }, end: { x: endIdx, y: bufferLineNumber } },
                text: m[0],
                activate: () => {
                  onOpenFileByPathRef.current?.(file, lineNum);
                }
              });
            }
            callback(links);
          }
        });
      } catch {}
    }

    // Native Copy & Paste handlers
    term.attachCustomKeyEventHandler((e) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === 'c') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          return false;
        }
        return true;
      }
      if (isMod && e.key.toLowerCase() === 'v') {
        if (e.type === 'keydown') {
          navigator.clipboard.readText().then((clipText) => {
            const sess = sessionsRef.current.get(tabId);
            if (clipText && sess && sess.socket.readyState === WebSocket.OPEN) {
              sess.socket.send(JSON.stringify({ type: 'input', data: clipText }));
            }
          }).catch(() => {});
        }
        return false;
      }
      return true;
    });

    const ws = new WebSocket(getWsUrl());
    const sessionObj: TermSession = { term, fitAddon, socket: ws, isReady: false };
    sessionsRef.current.set(tabId, sessionObj);

    ws.onopen = () => {
      sessionObj.isReady = true;
      const title = tabId === 'run' ? 'Aura PowerShell (Запуск кода)' : 'Aura PowerShell';
      term.writeln(`\x1b[38;2;16,185,129m[${title}]\x1b[0m\r\n`);
      
      setTimeout(() => {
        safeFit(tabId);
      }, 50);

      const cmdToSend = initialCommand || (tabId === 'run' ? pendingRunCommandRef.current : null);
      if (cmdToSend) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'execute', command: cmdToSend }));
            if (tabId === 'run') {
              pendingRunCommandRef.current = null;
              if (onCommandExecuted) onCommandExecuted();
            }
          }
        }, 250);
      }
    };

    ws.onclose = () => {
      sessionObj.isReady = false;
      term.writeln(`\r\n\x1b[33m[Соединение с терминалом закрыто. Нажмите кнопку перезапуска для нового терминала]\x1b[0m\r\n`);
    };

    ws.onerror = () => {
      sessionObj.isReady = false;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          term.writeln(`\r\n\x1b[31m[Процесс завершен с кодом ${msg.code}]\x1b[0m`);
        }
      } catch {
        term.write(event.data);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
  }, [getWsUrl, safeFit]);

  // When panel opens or activeTabId changes, ensure current tab is initialized and fitted
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (!sessionsRef.current.has(activeTabId)) {
        initSession(activeTabId, activeTabId === 'run' ? (pendingRunCommandRef.current || undefined) : undefined);
      } else {
        safeFit(activeTabId);
        if (activeTabId === 'run') {
          tryExecutePending();
        }
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [isOpen, activeTabId, initSession, safeFit, tryExecutePending]);

  // Only dispose all sessions on COMPLETE component unmount
  useEffect(() => {
    return () => {
      sessionsRef.current.forEach((sess) => {
        try { sess.socket.close(); } catch {}
        try { sess.term.dispose(); } catch {}
      });
      sessionsRef.current.clear();
    };
  }, []);

  // Handle pending command execution (Dedicated 'run' tab, leaving general PowerShell completely clean)
  useEffect(() => {
    if (!pendingCommand) return;

    pendingRunCommandRef.current = pendingCommand;

    // 1. Ensure 'run' tab exists in tab list
    setTabs((prev) => {
      if (!prev.some((t) => t.id === 'run')) {
        return [...prev, { id: 'run', name: 'PowerShell (Запуск)', isRunTab: true }];
      }
      return prev;
    });

    // 2. Switch to 'run' tab
    setActiveTabId('run');

    // 3. Dispatch command to 'run' session
    const sess = sessionsRef.current.get('run');
    if (sess && sess.socket.readyState === WebSocket.OPEN && sess.isReady) {
      sess.socket.send(JSON.stringify({ type: 'execute', command: pendingCommand }));
      pendingRunCommandRef.current = null;
      if (onCommandExecuted) onCommandExecuted();
    } else {
      const container = containerMapRef.current.get('run');
      if (container && !sessionsRef.current.has('run')) {
        initSession('run', pendingCommand);
      }
    }
  }, [pendingCommand, initSession, onCommandExecuted]);

  // Close specific tab
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabId === 'general') return; // Do not close primary general shell

    const sess = sessionsRef.current.get(tabId);
    if (sess) {
      try { sess.socket.close(); } catch {}
      try { sess.term.dispose(); } catch {}
      sessionsRef.current.delete(tabId);
    }
    containerMapRef.current.delete(tabId);

    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId('general');
    }
  };

  // Fully restart / re-spawn terminal session and ConPTY
  const handleRestartSession = (tabId: string) => {
    const sess = sessionsRef.current.get(tabId);
    if (sess) {
      try { sess.socket.close(); } catch {}
      try { sess.term.dispose(); } catch {}
      sessionsRef.current.delete(tabId);
    }
    const container = containerMapRef.current.get(tabId);
    if (container) {
      container.innerHTML = '';
      initSession(tabId);
    }
  };

  // Add new interactive PowerShell tab
  const handleAddTab = () => {
    const newId = `term-${Date.now()}`;
    const newName = `PowerShell ${tabs.length + 1}`;
    setTabs((prev) => [...prev, { id: newId, name: newName }]);
    setActiveTabId(newId);
  };

  // Update theme dynamically on all active terminal instances
  useEffect(() => {
    sessionsRef.current.forEach((sess) => {
      sess.term.options.theme = getTerminalTheme(theme);
    });
  }, [theme]);

  // Window resize listener
  useEffect(() => {
    const handleWinResize = () => {
      if (isOpen) {
        safeFit(activeTabId);
      }
    };
    window.addEventListener('resize', handleWinResize);
    return () => window.removeEventListener('resize', handleWinResize);
  }, [isOpen, activeTabId, safeFit]);

  // Drag resizer
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startY - moveEvent.clientY;
      const newH = Math.max(120, Math.min(window.innerHeight - 150, startHeight + delta));
      onResizeHeight(newH);
      safeFit(activeTabId);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      safeFit(activeTabId);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const activeSess = sessionsRef.current.get(activeTabId);

  return (
    <div
      style={{ 
        height: isMaximized ? '85%' : `${height}px`,
        display: isOpen ? 'flex' : 'none'
      }}
      className={`w-full flex-col bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] z-20 shrink-0 select-none ${isDragging ? '' : 'transition-all duration-150'}`}
    >
      {/* Fullscreen drag overlay to prevent iframe / xterm mouse event trapping */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-ns-resize bg-transparent select-none" />
      )}

      {/* Resizer Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 w-full hover:bg-[var(--accent-color)] cursor-ns-resize transition-colors"
      />

      {/* Terminal Header with Multi-Instance PowerShell Tabs */}
      <div className="h-8 px-2.5 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] text-xs text-[var(--text-primary)]">
        {/* Left: Real Terminal Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  const sess = sessionsRef.current.get(tab.id);
                  sess?.term.focus();
                }}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md cursor-pointer transition text-xs font-medium ${
                  isActive
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent'
                }`}
              >
                {tab.isRunTab ? (
                  <Play className="w-3.5 h-3.5 text-blue-400 fill-current" />
                ) : (
                  <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{tab.name}</span>
                {tab.id !== 'general' && (
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    title="Закрыть вкладку терминала"
                    className="ml-1 p-0.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add New Interactive PowerShell Tab */}
          <button
            onClick={handleAddTab}
            title="Открыть новый терминал PowerShell"
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition ml-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-1 text-[var(--text-secondary)]">
          <button
            onClick={() => {
              if (activeSess?.term.hasSelection()) {
                navigator.clipboard.writeText(activeSess.term.getSelection());
              }
            }}
            title="Копировать (Ctrl+C)"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              navigator.clipboard.readText().then((clipText) => {
                if (clipText && activeSess && activeSess.socket.readyState === WebSocket.OPEN) {
                  activeSess.socket.send(JSON.stringify({ type: 'input', data: clipText }));
                }
              }).catch(() => {});
            }}
            title="Вставить (Ctrl+V)"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          >
            <Clipboard className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => activeSess?.term.clear()}
            title="Очистить экран терминала"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => handleRestartSession(activeTabId)}
            title="Перезапустить / Переподключить терминал"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-[1px] bg-[var(--border-subtle)] mx-1" />

          {/* Maximize / Minimize Height */}
          <button
            onClick={() => {
              setIsMaximized(!isMaximized);
              setTimeout(() => {
                safeFit(activeTabId);
              }, 150);
            }}
            title={isMaximized ? 'Восстановить' : 'Развернуть'}
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close Panel */}
          <button
            onClick={onClose}
            title="Скрыть панель"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Viewports Container: Pure React JSX elements for each tab */}
      <div 
        className="flex-1 w-full overflow-hidden relative" 
        style={{ background: getTerminalTheme(theme).background }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) {
                containerMapRef.current.set(tab.id, el);
              } else {
                containerMapRef.current.delete(tab.id);
              }
            }}
            id={`term-container-${tab.id}`}
            className="w-full h-full p-2 absolute inset-0"
            style={{
              display: tab.id === activeTabId ? 'block' : 'none',
              background: getTerminalTheme(theme).background,
            }}
          />
        ))}
      </div>
    </div>
  );
});
