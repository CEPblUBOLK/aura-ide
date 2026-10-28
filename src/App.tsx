import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { TerminalPanel } from './components/TerminalPanel';
import { StatusBar } from './components/StatusBar';
import { CommandPalette } from './components/CommandPalette';
import { OpenWorkspaceModal } from './components/OpenWorkspaceModal';
import { AiPanel } from './components/AiPanel';
import { FileNode, OpenTab, GitFile, EditorSettings, ThemeMode, PythonEnv, RustStatus, RunConfiguration } from './types';
import { PythonEnvModal } from './components/PythonEnvModal';
import { RunConfigModal } from './components/RunConfigModal';
import { WebPreview } from './components/WebPreview';
import { Scratchpad } from './components/Scratchpad';
import { SaveAsModal } from './components/SaveAsModal';
import { Check, Save } from 'lucide-react';
import { getFileLanguage } from './utils/fileIcons';

const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  tabSize: 2,
  wordWrap: 'on',
  minimap: true,
  lineNumbers: 'on',
  theme: 'macos-dark',
  aiCopilotEnabled: true,
  aiCopilotModel: 'gemini-3.1-flash-lite',
  aiCopilotTriggerMode: 'auto',
};

export const App: React.FC = () => {
  const [workspacePath, setWorkspacePath] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Workspace');
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [gitFiles, setGitFiles] = useState<GitFile[]>([]);
  const [gitBranch, setGitBranch] = useState('main');
  const [isGitRepo, setIsGitRepo] = useState(false);

  // Python and Rust states
  const [pythonEnvs, setPythonEnvs] = useState<PythonEnv[]>([]);
  const [systemPythons, setSystemPythons] = useState<PythonEnv[]>([]);
  const [activePythonEnv, setActivePythonEnv] = useState<PythonEnv | undefined>(() => {
    try {
      const saved = localStorage.getItem('aura_active_python_env');
      return saved ? JSON.parse(saved) : undefined;
    } catch {
      return undefined;
    }
  });
  const [rustStatus, setRustStatus] = useState<RustStatus | undefined>();
  const [isPythonModalOpen, setIsPythonModalOpen] = useState(false);
  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [runConfigs, setRunConfigs] = useState<Record<string, RunConfiguration>>(() => {
    try {
      const saved = localStorage.getItem('aura_run_configs');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>();
  const [splitTabId, setSplitTabId] = useState<string | undefined>();
  const [isSplit, setIsSplit] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const s = localStorage.getItem('aura_sidebar_width');
    return s ? parseInt(s, 10) : 260;
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiService, setAiService] = useState<'gemini' | 'google' | 'deepseek'>('deepseek');
  const [activeCodeSelection, setActiveCodeSelection] = useState('');
  const [targetLocation, setTargetLocation] = useState<{ line: number; col?: number; timestamp: number } | null>(null);
  const [insertCodeAction, setInsertCodeAction] = useState<{ code: string; timestamp: number } | null>(null);
  const [isSaveAsOpen, setIsSaveAsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [settings, setSettings] = useState<EditorSettings>(() => {
    try {
      const saved = localStorage.getItem('aura_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Apply theme class to document element
  useEffect(() => {
    const root = document.documentElement;
    root.className = '';
    root.classList.add(`theme-${settings.theme}`);
    if (settings.theme === 'macos-light') {
      root.classList.add('light');
    } else {
      root.classList.add('dark');
    }
    localStorage.setItem('aura_settings', JSON.stringify(settings));
  }, [settings]);

  // Load workspace & tree
  const loadWorkspace = async () => {
    try {
      const res = await fetch('/api/workspace');
      const data = await res.json();
      setWorkspacePath(data.workspace);
      setWorkspaceName(data.name);
      loadTree();
      loadGitStatus();
      loadPythonEnvs();
      loadRustStatus();
      restoreSession(data.workspace);
    } catch (err) {
      console.error('Failed to load workspace', err);
    }
  };

  // Save workspace session to localStorage with restored-guard and path-based tracking
  const isSessionRestoredRef = useRef(false);

  useEffect(() => {
    if (!workspacePath || !isSessionRestoredRef.current) return;
    const sessionKey = `aura_session_${workspacePath}`;
    const activePath = tabs.find(t => t.id === activeTabId)?.path;
    const splitPath = tabs.find(t => t.id === splitTabId)?.path;
    const sessionData = {
      openTabs: tabs.filter(t => !t.isDiff).map(t => ({
        path: t.path,
        name: t.name,
        relativePath: t.relativePath
      })),
      activePath,
      splitPath,
      isSplit,
    };
    try {
      localStorage.setItem(sessionKey, JSON.stringify(sessionData));
    } catch {}
  }, [workspacePath, tabs, activeTabId, splitTabId, isSplit]);

  const restoreSession = async (wsPath: string) => {
    isSessionRestoredRef.current = false;
    try {
      const saved = localStorage.getItem(`aura_session_${wsPath}`);
      if (!saved) return;
      const data = JSON.parse(saved);
      if (Array.isArray(data.openTabs) && data.openTabs.length > 0) {
        const loadedTabs: OpenTab[] = [];
        for (const item of data.openTabs) {
          try {
            const res = await fetch(`/api/file?path=${encodeURIComponent(item.path)}`);
            if (!res.ok) continue;
            const fileData = await res.json();
            if (typeof fileData.content !== 'string') continue;
            loadedTabs.push({
              id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: item.name,
              path: item.path,
              relativePath: fileData.relativePath || item.relativePath,
              content: fileData.content,
              initialContent: fileData.content,
              isDirty: false,
              language: getFileLanguage(item.name),
            });
          } catch {}
        }
        if (loadedTabs.length > 0) {
          setTabs(loadedTabs);
          const activeMatch = loadedTabs.find(t => t.path === data.activePath) || loadedTabs[loadedTabs.length - 1];
          setActiveTabId(activeMatch.id);
          if (data.splitPath) {
            const splitMatch = loadedTabs.find(t => t.path === data.splitPath);
            if (splitMatch) setSplitTabId(splitMatch.id);
          }
        }
      }
      if (data.isSplit) setIsSplit(true);
    } catch {} finally {
      isSessionRestoredRef.current = true;
    }
  };

  // Real-time backend file watcher listener
  useEffect(() => {
    const isHttps = window.location.protocol === 'https:';
    const wsProto = isHttps ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/events`;
    let ws: WebSocket | null = null;
    let timer: any = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'fs-changed') {
            clearTimeout(timer);
            timer = setTimeout(() => {
              loadTree();
              loadGitStatus();
            }, 300);
          }
        } catch {}
      };
    } catch {}

    return () => {
      clearTimeout(timer);
      try { ws?.close(); } catch {}
    };
  }, []);

  const loadTree = async () => {
    try {
      const res = await fetch('/api/tree');
      const data = await res.json();
      setFileTree(data.tree || []);
    } catch (err) {
      console.error('Failed to load file tree', err);
    }
  };

  const loadGitStatus = async () => {
    try {
      const res = await fetch('/api/git/status');
      const data = await res.json();
      setIsGitRepo(data.isRepo);
      setGitBranch(data.branch || 'main');
      setGitFiles(data.files || []);
    } catch (err) {
      console.error('Failed to load git status', err);
    }
  };

  const loadPythonEnvs = async () => {
    try {
      const res = await fetch('/api/python/environments');
      const data = await res.json();
      setPythonEnvs(data.venvs || []);
      setSystemPythons(data.system || []);
      if (activePythonEnv) {
        // Sync active Python with backend
        fetch('/api/python/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: activePythonEnv.path, name: activePythonEnv.name })
        }).catch(() => {});
      } else if (data.active) {
        setActivePythonEnv(data.active);
      }
    } catch (err) {
      console.error('Failed to load python environments', err);
    }
  };

  const handleSelectPythonEnv = async (env: PythonEnv) => {
    setActivePythonEnv(env);
    localStorage.setItem('aura_active_python_env', JSON.stringify(env));
    handleSaveRunConfig('python', {
      language: 'python',
      compilerPath: env.path,
      compilerName: env.name,
      args: runConfigs['python']?.args || '',
      compilerFlags: runConfigs['python']?.compilerFlags || ''
    });
    try {
      await fetch('/api/python/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: env.path, name: env.name })
      });
    } catch {}
    showToast(`Выбран Python: ${env.name}`);
  };

  const handleBrowsePythonFile = async () => {
    if (isDesktop && (window as any).chrome?.webview?.postMessage) {
      (window as any).chrome.webview.postMessage('dialog-open-file');
    } else {
      try {
        const res = await fetch('/api/dialog/open-file', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.path) {
          const newEnv: PythonEnv = {
            name: data.name || 'Custom Python',
            path: data.path,
            version: data.version || 'Python',
            isVenv: false
          };
          await handleSelectPythonEnv(newEnv);
          await loadPythonEnvs();
        }
      } catch {}
    }
  };

  const handlePipInstall = (packageName: string) => {
    const py = activePythonEnv?.path || runConfigs['python']?.compilerPath || 'python';
    setIsTerminalOpen(true);
    setPendingCommand(`& "${py}" -m pip install ${packageName}`);
    showToast(`Установка пакета ${packageName}...`);
  };

  const loadRustStatus = async () => {
    try {
      const res = await fetch('/api/rust/status');
      const data = await res.json();
      setRustStatus(data);
    } catch (err) {
      console.error('Failed to load rust status', err);
    }
  };

  const handleCreateVenv = async (name: string) => {
    const res = await fetch('/api/python/create-venv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await loadPythonEnvs();
    await loadTree();
    setActivePythonEnv({
      name: data.name,
      path: data.path,
      version: 'Python (venv)',
      isVenv: true,
      folder: data.folder,
    });
  };

  const handleSaveRunConfig = (lang: string, config: RunConfiguration) => {
    setRunConfigs(prev => {
      const next = { ...prev, [lang]: config };
      try {
        localStorage.setItem('aura_run_configs', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (lang === 'python') {
      const env: PythonEnv = {
        name: config.compilerName,
        path: config.compilerPath,
        version: config.compilerName,
        isVenv: config.compilerPath.toLowerCase().includes('venv')
      };
      setActivePythonEnv(env);
      try {
        localStorage.setItem('aura_active_python_env', JSON.stringify(env));
        fetch('/api/python/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: config.compilerPath, name: config.compilerName })
        }).catch(() => {});
      } catch {}
    }

    showToast(`Интерпретатор сохранён: ${config.compilerName}`);
  };

  const handleRunCodeWithConfig = (tab: OpenTab, config?: RunConfiguration) => {
    let commandToRun = '';
    const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
    const baseName = tab.name.replace(/\.[^/.]+$/, "");
    const lang = tab.language;

    // 1. Web HTML
    if (lang === 'html' || tab.name.endsWith('.html')) {
      setIsPreviewOpen(true);
      return;
    }

    const cfg = config || runConfigs[lang];
    const args = cfg?.args ? ` ${cfg.args}` : '';
    const flags = cfg?.compilerFlags ? ` ${cfg.compilerFlags}` : '';
    const exe = cfg?.compilerPath || '';

    // Safely resolve working directory and filename for execution (cross-platform compatible)
    const targetFile = tab.path || tab.relativePath || tab.name;
    const lastSlash = Math.max(targetFile.lastIndexOf('\\'), targetFile.lastIndexOf('/'));
    const targetDir = lastSlash > 0 ? targetFile.slice(0, lastSlash) : '';
    const fileNameOnly = lastSlash > 0 ? targetFile.slice(lastSlash + 1) : targetFile;
    const cdCmd = targetDir
      ? (isWindows ? `Set-Location -LiteralPath "${targetDir}"; ` : `cd "${targetDir}" && `)
      : '';
    const fileRef = isWindows ? `.\\"${fileNameOnly}"` : `./"${fileNameOnly}"`;

    if (cfg?.compilerPath || (lang === 'python' && activePythonEnv)) {
      if (lang === 'python') {
        const pyExe = activePythonEnv?.path || cfg?.compilerPath || 'python';
        const py = isWindows && (pyExe.includes(' ') || pyExe.includes('\\')) ? `& "${pyExe}"` : pyExe;
        commandToRun = `${cdCmd}${py} ${fileRef}${args}`;
      } else if (lang === 'rust') {
        if (exe.includes('rustc')) {
          commandToRun = isWindows
            ? `${cdCmd}rustc ${fileRef}${flags} -o "${baseName}.exe"; if ($?) { .\\"${baseName}.exe"${args} }`
            : `${cdCmd}rustc ${fileRef}${flags} -o "${baseName}" && ./"${baseName}"${args}`;
        } else {
          commandToRun = `cargo run${flags}${cfg.args ? ' -- ' + cfg.args : ''}`;
        }
      } else if (lang === 'cpp' || lang === 'c') {
        const cc = isWindows && (exe.includes(' ') || exe.includes('\\')) ? `& "${exe}"` : exe;
        commandToRun = isWindows
          ? `${cdCmd}${cc} ${fileRef}${flags} -o "${baseName}.exe"; if ($?) { .\\"${baseName}.exe"${args} }`
          : `${cdCmd}${cc} ${fileRef}${flags} -o "${baseName}" && ./"${baseName}"${args}`;
      } else if (lang === 'go') {
        commandToRun = `${cdCmd}go run ${fileRef}${args}`;
      } else if (lang === 'javascript') {
        commandToRun = `${cdCmd}node ${fileRef}${args}`;
      } else if (lang === 'typescript') {
        commandToRun = `${cdCmd}npx tsx ${fileRef}${args}`;
      } else if (lang === 'csharp') {
        commandToRun = `dotnet run${args}`;
      } else {
        const cmd = isWindows && (exe.includes(' ') || exe.includes('\\')) ? `& "${exe}"` : exe;
        commandToRun = `${cdCmd}${cmd} ${fileRef}${args}`;
      }
    } else {
      // Defaults if no custom configuration saved
      if (lang === 'python') {
        const pyExe = activePythonEnv ? `& "${activePythonEnv.path}"` : 'python';
        commandToRun = `${cdCmd}${pyExe} ${fileRef}`;
      } else if (lang === 'rust' || rustStatus?.hasCargo) {
        commandToRun = 'cargo run';
      } else if (lang === 'c') {
        commandToRun = isWindows 
          ? `${cdCmd}gcc ${fileRef} -o "${baseName}.exe"; if ($?) { .\\"${baseName}.exe" }`
          : `${cdCmd}gcc ${fileRef} -o "${baseName}" && ./"${baseName}"`;
      } else if (lang === 'cpp') {
        commandToRun = isWindows 
          ? `${cdCmd}g++ ${fileRef} -o "${baseName}.exe"; if ($?) { .\\"${baseName}.exe" }`
          : `${cdCmd}g++ ${fileRef} -o "${baseName}" && ./"${baseName}"`;
      } else if (lang === 'go') {
        commandToRun = `${cdCmd}go run ${fileRef}`;
      } else if (lang === 'java') {
        commandToRun = `${cdCmd}java ${fileRef}`;
      } else if (lang === 'csharp') {
        commandToRun = 'dotnet run';
      } else if (lang === 'javascript') {
        commandToRun = `${cdCmd}node ${fileRef}`;
      } else if (lang === 'typescript') {
        commandToRun = `${cdCmd}npx tsx ${fileRef}`;
      } else if (lang === 'shell') {
        commandToRun = isWindows ? `${cdCmd}& ${fileRef}` : `${cdCmd}bash ${fileRef}`;
      } else {
        commandToRun = `echo "Running ${tab.name}"`;
      }
    }

    setIsTerminalOpen(true);
    setPendingCommand(commandToRun);
  };

  const handleRunCode = async () => {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (!currentTab) return;
    if (currentTab.isDirty) {
      await handleSaveFile(currentTab.id);
    }
    handleRunCodeWithConfig(currentTab);
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  // Open file in editor
  const openFile = async (node: FileNode, lineToJump?: number) => {
    // Check if already open
    const existing = tabs.find(t => t.path === node.path && !t.isDiff);
    if (existing) {
      setActiveTabId(existing.id);
      if (lineToJump) {
        setTargetLocation({ line: lineToJump, timestamp: Date.now() });
      }
      return;
    }

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(node.path)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to open file');
        return;
      }
      const data = await res.json();
      if (typeof data.content !== 'string') {
        alert('Cannot open file: content is not readable text');
        return;
      }
      const language = getFileLanguage(node.name);

      const newTab: OpenTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: node.name,
        path: node.path,
        relativePath: data.relativePath || node.relativePath,
        content: data.content,
        initialContent: data.content,
        isDirty: false,
        language,
      };

      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      if (lineToJump) {
        setTargetLocation({ line: lineToJump, timestamp: Date.now() });
      }
    } catch (err) {
      alert('Failed to read file: ' + (err as Error).message);
    }
  };

  const openFileByPath = async (filePath: string, lineToJump?: number) => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    await openFile({
      name: fileName,
      path: filePath,
      relativePath: filePath,
      isDirectory: false,
    }, lineToJump);
  };

  // Open Git Diff
  const openDiffTab = async (gitFile: GitFile) => {
    try {
      const res = await fetch(`/api/git/diff?file=${encodeURIComponent(gitFile.file)}`);
      const data = await res.json();

      const diffTabId = `diff-${gitFile.file}`;
      const existing = tabs.find(t => t.id === diffTabId);
      if (existing) {
        setActiveTabId(diffTabId);
        return;
      }

      const newTab: OpenTab = {
        id: diffTabId,
        name: `Diff: ${gitFile.file}`,
        path: gitFile.fullPath,
        relativePath: gitFile.file,
        content: data.modified || '',
        initialContent: data.modified || '',
        isDirty: false,
        language: getFileLanguage(gitFile.file),
        isDiff: true,
        originalContent: data.original || '',
      };

      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (err) {
      alert('Failed to load git diff: ' + (err as Error).message);
    }
  };

  // Close tab
  const handleCloseTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const tabToClose = tabs.find(t => t.id === tabId);
    if (tabToClose?.isDirty) {
      if (!window.confirm(`File ${tabToClose.name} has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    const nextTabs = tabs.filter(t => t.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : undefined);
    }
    if (splitTabId === tabId) {
      setSplitTabId(undefined);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 2000);
  };

  // Save active file
  const handleSaveFile = async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || tab.isDiff) return;

    try {
      await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tab.path, content: tab.content }),
      });

      setTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          return { ...t, isDirty: false, initialContent: t.content };
        }
        return t;
      }));

      loadGitStatus();
      showToast(`Saved ${tab.name}`);
    } catch (err) {
      alert('Failed to save file: ' + (err as Error).message);
    }
  };

  const handleSaveAs = async (newFileName: string) => {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (!currentTab) return;

    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newFileName, content: currentTab.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await loadTree();
      await loadGitStatus();
      await openFileByPath(data.path || newFileName);
      showToast(`Saved as ${newFileName}`);
    } catch (err) {
      alert('Save As failed: ' + (err as Error).message);
    }
  };

  // Content change
  const handleContentChange = (tabId: string, newContent: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id === tabId) {
        return {
          ...t,
          content: newContent,
          isDirty: newContent !== t.initialContent,
        };
      }
      return t;
    }));
  };

  // Create file or folder
  const handleCreateFile = async (parentDir: string, name: string) => {
    const targetPath = parentDir ? `${parentDir}/${name}` : name;
    await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath, type: 'file' }),
    });
    await loadTree();
    await openFileByPath(targetPath);
  };

  const handleCreateFolder = async (parentDir: string, name: string) => {
    const targetPath = parentDir ? `${parentDir}/${name}` : name;
    await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath, type: 'folder' }),
    });
    await loadTree();
  };

  const handleDeleteItem = async (targetPath: string) => {
    await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath }),
    });
    setTabs(prev => prev.filter(t => t.path !== targetPath && !t.path.startsWith(targetPath + '/') && !t.path.startsWith(targetPath + '\\')));
    await loadTree();
    await loadGitStatus();
  };

  const handleRenameItem = async (oldPath: string, newPath: string) => {
    await fetch('/api/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    setTabs(prev => prev.map(t => {
      if (t.path === oldPath) {
        return { ...t, path: newPath, relativePath: newPath, name: newPath.split(/[/\\]/).pop() || t.name };
      }
      if (t.path.startsWith(oldPath + '/') || t.path.startsWith(oldPath + '\\')) {
        const sub = t.path.slice(oldPath.length);
        const updatedPath = newPath + sub;
        const relSub = t.relativePath.slice(oldPath.length);
        const updatedRel = newPath + relSub;
        return { ...t, path: updatedPath, relativePath: updatedRel, name: updatedPath.split(/[/\\]/).pop() || t.name };
      }
      return t;
    }));
    await loadTree();
  };

  const handleStageFile = async (file: string) => {
    await fetch('/api/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file })
    });
    await loadGitStatus();
  };

  const handleUnstageFile = async (file: string) => {
    await fetch('/api/git/unstage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file })
    });
    await loadGitStatus();
  };

  const handleDiscardFile = async (file: string, status: string) => {
    await fetch('/api/git/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, status })
    });
    await loadGitStatus();
  };

  const handleGitPush = async () => {
    const res = await fetch('/api/git/push', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Git Push выполнен успешно');
  };

  const handleGitPull = async () => {
    const res = await fetch('/api/git/pull', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await loadTree();
    await loadGitStatus();
    showToast('Git Pull выполнен успешно');
  };

  const handleOpenAiDiffTab = (suggestedCode: string) => {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (!currentTab) return;

    const diffTabId = `ai-diff-${currentTab.id}`;
    const newTab: OpenTab = {
      id: diffTabId,
      name: `AI Diff: ${currentTab.name}`,
      path: currentTab.path,
      relativePath: currentTab.relativePath,
      content: suggestedCode,
      initialContent: currentTab.content,
      isDirty: false,
      language: currentTab.language,
      isDiff: true,
      originalContent: currentTab.content,
    };

    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== diffTabId);
      return [...filtered, newTab];
    });
    setActiveTabId(diffTabId);
    showToast('Открыт режим сравнения с кодом ИИ');
  };

  const handleAcceptAiDiff = (diffTab: OpenTab) => {
    const targetTab = tabs.find(t => !t.isDiff && t.path === diffTab.path);
    if (targetTab) {
      handleContentChange(targetTab.id, diffTab.content);
      setTabs(prev => prev.filter(t => t.id !== diffTab.id));
      setActiveTabId(targetTab.id);
      showToast(`Изменения ИИ применены к ${targetTab.name}`);
    }
  };

  const handleCommitGit = async (message: string) => {
    const res = await fetch('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await loadGitStatus();
  };

  const handleSelectWorkspace = useCallback(async (newPath: string) => {
    const res = await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newPath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setWorkspacePath(data.workspace);
    setWorkspaceName(data.name);
    setTabs([]);
    setActiveTabId(undefined);
    await loadTree();
    await loadGitStatus();
  }, []);

  const isDesktop = typeof window !== 'undefined' && Boolean((window as any).chrome?.webview);
  const handleCommandExecuted = useCallback(() => setPendingCommand(null), []);

  // Sync state when native WPF AI panel opens/closes and handle native folder selection dialog
  useEffect(() => {
    const handleNativeMessage = (e: any) => {
      const data = e.data;
      if (data === 'ai-closed') {
        setIsAiOpen(false);
      } else if (data === 'ai-opened') {
        setIsAiOpen(true);
      } else if (data === 'ai-service:google') {
        setAiService('google');
      } else if (data === 'ai-service:deepseek') {
        setAiService('deepseek');
      } else if (typeof data === 'string' && data.startsWith('folder-selected:')) {
        const folder = data.substring('folder-selected:'.length);
        if (folder) {
          handleSelectWorkspace(folder);
          setIsWorkspaceModalOpen(false);
          showToast(`Открыта папка: ${folder.split(/[\\/]/).pop() || folder}`);
        }
      } else if (typeof data === 'string' && data.startsWith('file-selected:')) {
        const filePath = data.substring('file-selected:'.length);
        if (filePath) {
          const newEnv: PythonEnv = {
            name: `Python (${filePath.split(/[\\/]/).pop()})`,
            path: filePath,
            version: 'Custom Python',
            isVenv: false
          };
          handleSelectPythonEnv(newEnv);
          loadPythonEnvs();
        }
      }
    };

    if (typeof window !== 'undefined' && (window as any).chrome?.webview) {
      (window as any).chrome.webview.addEventListener('message', handleNativeMessage);
      return () => {
        (window as any).chrome.webview.removeEventListener('message', handleNativeMessage);
      };
    }
  }, [handleSelectWorkspace]);

  const handleOpenFolderPicker = async () => {
    if (isDesktop && (window as any).chrome?.webview?.postMessage) {
      (window as any).chrome.webview.postMessage('dialog-open-folder');
    } else {
      try {
        const res = await fetch('/api/dialog/open-folder', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.path) {
          await handleSelectWorkspace(data.path);
          setIsWorkspaceModalOpen(false);
          showToast(`Открыта папка: ${data.name || data.path}`);
        } else if (!data.canceled) {
          setIsWorkspaceModalOpen(true);
        }
      } catch {
        setIsWorkspaceModalOpen(true);
      }
    }
  };

  const handleToggleAi = () => {
    setIsAiOpen(prev => !prev);
  };

  const latestStateRef = useRef({
    isZenMode,
    activeTabId,
    tabs,
    handleRunCode,
    handleSaveFile,
    handleCloseTab,
    handleOpenFolderPicker,
    handleCreateFile,
  });

  useEffect(() => {
    latestStateRef.current = {
      isZenMode,
      activeTabId,
      tabs,
      handleRunCode,
      handleSaveFile,
      handleCloseTab,
      handleOpenFolderPicker,
      handleCreateFile,
    };
  });

  // Keyboard shortcut listener (immune to stale closures via latestStateRef)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const state = latestStateRef.current;

      if (e.key === 'Escape' && state.isZenMode) {
        setIsZenMode(false);
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleToggleAi();
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsSaveAsOpen(true);
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsScratchpadOpen(prev => !prev);
      } else if (isMod && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        state.handleCreateFile('', 'untitled.txt');
      } else if (isMod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        state.handleOpenFolderPicker();
      } else if (e.key === 'F11') {
        e.preventDefault();
        if ((window as any).chrome?.webview?.postMessage) {
          (window as any).chrome.webview.postMessage('window-fullscreen-toggle');
        } else {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      } else if (e.key === 'F5' || (isMod && e.key === 'F5')) {
        e.preventDefault();
        state.handleRunCode();
      } else if (isMod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (state.activeTabId) state.handleSaveFile(state.activeTabId);
      } else if (isMod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      } else if (isMod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      } else if (isMod && e.key === '`') {
        e.preventDefault();
        setIsTerminalOpen(prev => !prev);
      } else if (isMod && e.key === 'Tab') {
        e.preventDefault();
        if (state.tabs.length > 1) {
          const idx = state.tabs.findIndex(t => t.id === state.activeTabId);
          const nextIdx = (idx + (e.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length;
          setActiveTabId(state.tabs[nextIdx].id);
        }
      } else if (isMod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (state.activeTabId) state.handleCloseTab(state.activeTabId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sidebar drag resizer effect
  useEffect(() => {
    if (!isDraggingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newW = Math.min(Math.max(e.clientX, 180), 550);
      setSidebarWidth(newW);
      localStorage.setItem('aura_sidebar_width', newW.toString());
    };
    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] select-none">
      {/* Title Bar (macOS Traffic lights, Quick Search, Layout actions) */}
      {!isZenMode && (
        <TitleBar
          projectName={workspaceName}
          activeFilePath={activeTab?.relativePath}
          activeTab={activeTab}
          activePythonEnv={activePythonEnv}
          rustStatus={rustStatus}
          currentCompilerName={activeTab ? runConfigs[activeTab.language]?.compilerName || (activeTab.language === 'python' ? activePythonEnv?.name : undefined) : undefined}
          theme={settings.theme}
          onThemeChange={(theme) => setSettings(s => ({ ...s, theme }))}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
          onToggleSplit={() => setIsSplit(!isSplit)}
          onTogglePreview={() => setIsPreviewOpen(!isPreviewOpen)}
          onRunCode={handleRunCode}
          onOpenRunConfig={() => setIsRunConfigOpen(true)}
          onOpenPythonModal={() => setIsPythonModalOpen(true)}
          isSplit={isSplit}
          isPreviewOpen={isPreviewOpen}
          isSidebarOpen={isSidebarOpen}
          isTerminalOpen={isTerminalOpen}
          isAiOpen={isAiOpen}
          onToggleAi={handleToggleAi}
          isZenMode={isZenMode}
          onToggleZenMode={() => setIsZenMode(!isZenMode)}
          onOpenFolderDialog={handleOpenFolderPicker}
        />
      )}

      {/* Main Workbench Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Transparent overlay while dragging sidebar to prevent iframes trapping mouse */}
        {isDraggingSidebar && (
          <div className="fixed inset-0 z-50 cursor-col-resize bg-transparent select-none" />
        )}

        {/* Collapsible & Resizable Sidebar */}
        {isSidebarOpen && !isZenMode && (
          <div 
            style={{ width: `${sidebarWidth}px` }}
            className="relative h-full shrink-0 z-10 select-none"
          >
            <Sidebar
              tree={fileTree}
              activeFilePath={activeTab?.path}
              gitFiles={gitFiles}
              gitBranch={gitBranch}
              isGitRepo={isGitRepo}
              settings={settings}
              isAiOpen={isAiOpen}
              onToggleAi={handleToggleAi}
              onUpdateSettings={(newS) => setSettings(s => ({ ...s, ...newS }))}
              onOpenScratchpad={() => setIsScratchpadOpen(true)}
              onFileSelect={openFile}
              onOpenFileByPath={openFileByPath}
              onOpenDiff={openDiffTab}
              onRefreshFiles={loadTree}
              onRefreshGit={loadGitStatus}
              onCommitGit={handleCommitGit}
              onStageFile={handleStageFile}
              onUnstageFile={handleUnstageFile}
              onDiscardFile={handleDiscardFile}
              onGitPush={handleGitPush}
              onGitPull={handleGitPull}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onDeleteItem={handleDeleteItem}
              onRenameItem={handleRenameItem}
            />
            {/* Sidebar Right Drag Handle */}
            <div
              onMouseDown={(e) => { e.preventDefault(); setIsDraggingSidebar(true); }}
              title="Drag to resize sidebar"
              className="absolute top-0 bottom-0 -right-1 w-2 cursor-col-resize z-40 group flex items-center justify-center hover:bg-[var(--accent-color)]/20 transition-colors"
            >
              <div className="w-0.5 h-8 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--accent-color)] transition-colors" />
            </div>
          </div>
        )}

        {/* Editor Area & Terminal Panel */}
        <div className="flex-1 flex flex-col min-w-[260px] h-full overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <EditorArea
              tabs={tabs}
              activeTabId={activeTabId}
              splitTabId={splitTabId}
              isSplit={isSplit}
              settings={settings}
              projectName={workspaceName}
              onSelectTab={setActiveTabId}
              onSelectSplitTab={setSplitTabId}
              onCloseTab={handleCloseTab}
              onContentChange={handleContentChange}
              onSaveFile={handleSaveFile}
              onAcceptDiff={handleAcceptAiDiff}
              onSaveAsPrompt={() => setIsSaveAsOpen(true)}
              onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
              onOpenFolderDialog={handleOpenFolderPicker}
              onNewFilePrompt={() => handleCreateFile('', 'untitled.txt')}
              onCursorChange={(line, col) => setCursorPos({ line, col })}
              onSelectionChange={setActiveCodeSelection}
              targetLocation={targetLocation}
              insertCodeAction={insertCodeAction}
            />

            {isPreviewOpen && (
              <WebPreview
                initialUrl={activeTab?.name.endsWith('.html') ? `/preview/${activeTab.relativePath}` : '/preview/index.html'}
                onClose={() => setIsPreviewOpen(false)}
              />
            )}
          </div>

          {/* Integrated macOS Terminal Panel */}
          <TerminalPanel
            isOpen={!isZenMode && isTerminalOpen}
            onClose={() => setIsTerminalOpen(false)}
            height={terminalHeight}
            onResizeHeight={setTerminalHeight}
            pendingCommand={pendingCommand}
            onCommandExecuted={handleCommandExecuted}
            theme={settings.theme}
            onOpenFileByPath={openFileByPath}
          />
        </div>

        {/* Unified Native Gemini AI Assistant Side Panel */}
        <AiPanel
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          activeTab={activeTab ? { name: activeTab.name, language: activeTab.language, content: activeTab.content } : null}
          activeCodeSelection={activeCodeSelection}
          service={aiService}
          onServiceChange={(s) => setAiService(s)}
          onInsertCode={(codeToInsert) => {
            setInsertCodeAction({ code: codeToInsert, timestamp: Date.now() });
            showToast('Код вставлен в позицию курсора!');
          }}
          onDiffCode={handleOpenAiDiffTab}
        />
      </div>

      {/* Floating Zen Mode Exit Pill */}
      {isZenMode && (
        <button
          onClick={() => setIsZenMode(false)}
          className="fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-xs text-[var(--text-primary)] border border-[var(--border-subtle)] backdrop-blur-md shadow-lg transition-all"
        >
          Exit Zen Mode (Esc)
        </button>
      )}

      {/* macOS Status Bar */}
      {!isZenMode && (
        <StatusBar
          activeTab={activeTab}
          gitBranch={gitBranch}
          isGitRepo={isGitRepo}
          activePythonEnv={activePythonEnv}
          rustStatus={rustStatus}
          currentCompilerName={activeTab ? runConfigs[activeTab.language]?.compilerName || (activeTab.language === 'python' ? activePythonEnv?.name : undefined) : undefined}
          onOpenRunConfig={() => setIsRunConfigOpen(true)}
          onOpenPythonModal={() => setIsPythonModalOpen(true)}
          onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
          tabSize={settings.tabSize}
          cursorPos={cursorPos}
          isCopilotEnabled={settings.aiCopilotEnabled !== false}
          onToggleCopilot={() => setSettings(s => ({ ...s, aiCopilotEnabled: s.aiCopilotEnabled === false }))}
        />
      )}

      {/* Launch Settings & Compiler Selector Modal */}
      <RunConfigModal
        isOpen={isRunConfigOpen}
        onClose={() => setIsRunConfigOpen(false)}
        activeLanguage={activeTab?.language || 'python'}
        activeFilePath={activeTab?.relativePath}
        runConfigs={runConfigs}
        onSaveConfig={handleSaveRunConfig}
        onRunNow={(lang, config) => {
          if (activeTab) handleRunCodeWithConfig(activeTab, config);
        }}
      />

      {/* Developer Scratchpad */}
      <Scratchpad
        isOpen={isScratchpadOpen}
        onClose={() => setIsScratchpadOpen(false)}
      />

      {/* Save As Modal */}
      <SaveAsModal
        isOpen={isSaveAsOpen}
        onClose={() => setIsSaveAsOpen(false)}
        currentFileName={activeTab?.name || 'untitled.txt'}
        onSaveAs={handleSaveAs}
      />

      {/* Floating Save Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-9 right-6 z-50 flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-xl animate-spotlight text-xs select-none">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Python Environment Selector Modal */}
      <PythonEnvModal
        isOpen={isPythonModalOpen}
        onClose={() => setIsPythonModalOpen(false)}
        activeEnv={activePythonEnv}
        venvs={pythonEnvs}
        systemPythons={systemPythons}
        onSelectEnv={handleSelectPythonEnv}
        onCreateVenv={handleCreateVenv}
        onBrowsePythonFile={handleBrowsePythonFile}
        onPipInstall={handlePipInstall}
      />

      {/* Spotlight Command Palette (Cmd+P / Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        files={fileTree}
        onSelectFile={openFile}
        onExecuteCommand={(cmdId) => {
          if (cmdId === 'toggle-ai') handleToggleAi();
          if (cmdId === 'ai-google') {
            setAiService('google');
            setIsAiOpen(true);
            if (typeof window !== 'undefined' && (window as any).chrome?.webview) {
              (window as any).chrome.webview.postMessage('ai-open-google');
            }
          }
          if (cmdId === 'ai-deepseek') {
            setAiService('deepseek');
            setIsAiOpen(true);
            if (typeof window !== 'undefined' && (window as any).chrome?.webview) {
              (window as any).chrome.webview.postMessage('ai-open-deepseek');
            }
          }
          if (cmdId === 'ai-gemini') {
            setAiService('gemini');
            setIsAiOpen(true);
          }
          if (cmdId === 'save-file' && activeTabId) handleSaveFile(activeTabId);
          if (cmdId === 'new-file') handleCreateFile('', 'untitled.txt');
          if (cmdId === 'open-workspace') handleOpenFolderPicker();
          if (cmdId === 'toggle-split') setIsSplit(prev => !prev);
          if (cmdId === 'toggle-terminal') setIsTerminalOpen(prev => !prev);
          if (cmdId === 'toggle-minimap') setSettings(s => ({ ...s, minimap: !s.minimap }));
          if (cmdId === 'toggle-wordwrap') setSettings(s => ({ ...s, wordWrap: s.wordWrap === 'on' ? 'off' : 'on' }));
          if (cmdId.startsWith('switch-theme-')) {
            const rawTheme = cmdId.replace('switch-theme-', '');
            const targetTheme = (rawTheme === 'dark' ? 'macos-dark' : rawTheme === 'light' ? 'macos-light' : rawTheme) as ThemeMode;
            setSettings(s => ({ ...s, theme: targetTheme }));
          }
          if (cmdId === 'git-commit') setIsSidebarOpen(true);
        }}
      />

      {/* Open Workspace Modal */}
      <OpenWorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        currentPath={workspacePath}
        onSelectWorkspace={handleSelectWorkspace}
        onOpenFolderPicker={handleOpenFolderPicker}
      />
    </div>
  );
};
