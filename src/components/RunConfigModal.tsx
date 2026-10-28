import React, { useState, useEffect } from 'react';
import { X, Play, Settings2, Check, Terminal, FolderOpen, RefreshCw } from 'lucide-react';
import { CompilerItem, RunConfiguration } from '../types';

interface RunConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLanguage: string;
  activeFilePath?: string;
  runConfigs: Record<string, RunConfiguration>;
  onSaveConfig: (lang: string, config: RunConfiguration) => void;
  onRunNow: (lang: string, config: RunConfiguration) => void;
}

export const RunConfigModal: React.FC<RunConfigModalProps> = ({
  isOpen,
  onClose,
  activeLanguage,
  activeFilePath,
  runConfigs,
  onSaveConfig,
  onRunNow,
}) => {
  const [selectedLang, setSelectedLang] = useState<string>(activeLanguage || 'python');
  const [compilersMap, setCompilersMap] = useState<Record<string, CompilerItem[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Form states for current selected language
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [selectedName, setSelectedName] = useState<string>('');
  const [args, setArgs] = useState<string>('');
  const [compilerFlags, setCompilerFlags] = useState<string>('');
  const [isCustomPath, setIsCustomPath] = useState<boolean>(false);

  const supportedLanguages = [
    { id: 'python', name: 'Python' },
    { id: 'rust', name: 'Rust' },
    { id: 'cpp', name: 'C++' },
    { id: 'c', name: 'C' },
    { id: 'javascript', name: 'JavaScript' },
    { id: 'typescript', name: 'TypeScript' },
    { id: 'go', name: 'Go' },
    { id: 'csharp', name: 'C# / .NET' },
  ];

  // Load available compilers from server
  const loadCompilers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/compilers');
      if (res.ok) {
        const data = await res.json();
        setCompilersMap(data.compilers || {});
      }
    } catch (e) {
      console.error('Failed to load compilers', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCompilers();
      const lang = activeLanguage || 'python';
      setSelectedLang(lang);
    }
  }, [isOpen, activeLanguage]);

  // Sync inputs when selected language or configs change
  useEffect(() => {
    const existing = runConfigs[selectedLang];
    const available = compilersMap[selectedLang] || [];

    if (existing) {
      setSelectedPath(existing.compilerPath);
      setSelectedName(existing.compilerName);
      setArgs(existing.args || '');
      setCompilerFlags(existing.compilerFlags || '');
      setIsCustomPath(!available.some(c => c.path === existing.compilerPath));
    } else {
      // Default to first available compiler
      const first = available[0];
      if (first) {
        setSelectedPath(first.path);
        setSelectedName(first.name);
      } else {
        setSelectedPath(selectedLang === 'python' ? 'python' : selectedLang === 'rust' ? 'cargo' : selectedLang === 'cpp' ? 'g++' : 'node');
        setSelectedName(selectedLang.toUpperCase());
      }
      setArgs('');
      setCompilerFlags(selectedLang === 'cpp' || selectedLang === 'c' ? '-Wall -O2' : selectedLang === 'rust' ? '--release' : '');
      setIsCustomPath(false);
    }
  }, [selectedLang, runConfigs, compilersMap]);

  if (!isOpen) return null;

  const currentAvailable = compilersMap[selectedLang] || [];
  const isWindows = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('WIN') >= 0;
  const fileName = activeFilePath || (selectedLang === 'python' ? 'main.py' : selectedLang === 'rust' ? 'main.rs' : 'main.cpp');
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  // Generate live command preview
  let commandPreview = '';
  const exePath = selectedPath || (selectedLang === 'python' ? 'python' : 'run');
  if (selectedLang === 'python') {
    const py = isWindows && (exePath.includes(' ') || exePath.includes('\\')) ? `& "${exePath}"` : exePath;
    commandPreview = `${py} "${fileName}" ${args}`.trim();
  } else if (selectedLang === 'rust') {
    if (selectedPath.includes('rustc')) {
      commandPreview = `rustc "${fileName}" -o "${baseName}.exe"; if ($?) { .\\"${baseName}.exe" ${args} }`.trim();
    } else {
      commandPreview = `cargo run ${compilerFlags} ${args ? '-- ' + args : ''}`.trim();
    }
  } else if (selectedLang === 'cpp' || selectedLang === 'c') {
    const cc = isWindows && (exePath.includes(' ') || exePath.includes('\\')) ? `& "${exePath}"` : exePath;
    commandPreview = `${cc} "${fileName}" ${compilerFlags} -o "${baseName}.exe"; if ($?) { .\\"${baseName}.exe" ${args} }`.trim();
  } else if (selectedLang === 'go') {
    commandPreview = `go run "${fileName}" ${args}`.trim();
  } else if (selectedLang === 'javascript') {
    commandPreview = `node "${fileName}" ${args}`.trim();
  } else if (selectedLang === 'typescript') {
    commandPreview = `npx tsx "${fileName}" ${args}`.trim();
  } else if (selectedLang === 'csharp') {
    commandPreview = `dotnet run ${args}`.trim();
  } else {
    commandPreview = `${exePath} "${fileName}" ${args}`.trim();
  }

  const handleSelectPreset = (c: CompilerItem) => {
    setSelectedPath(c.path);
    setSelectedName(c.name);
    setIsCustomPath(false);
  };

  const currentConfig: RunConfiguration = {
    language: selectedLang,
    compilerPath: selectedPath,
    compilerName: selectedName || selectedPath,
    args,
    compilerFlags,
  };

  const handleSave = () => {
    onSaveConfig(selectedLang, currentConfig);
    onClose();
  };

  const handleRun = () => {
    onSaveConfig(selectedLang, currentConfig);
    onRunNow(selectedLang, currentConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col text-[var(--text-primary)]">
        {/* Header */}
        <div className="h-12 border-b border-[var(--border-subtle)] px-5 flex items-center justify-between bg-[var(--bg-secondary)]">
          <div className="flex items-center space-x-2.5">
            <Settings2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Параметры запуска и компилятора</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
          {/* Language Tabs */}
          <div>
            <label className="block text-[var(--text-secondary)] font-medium mb-1.5">Язык программирования</label>
            <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg">
              {supportedLanguages.map(lang => (
                <button
                  key={lang.id}
                  onClick={() => setSelectedLang(lang.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    selectedLang === lang.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>

          {/* Compiler / Interpreter Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[var(--text-primary)] font-medium">
                Выбор компилятора или интерпретатора
              </label>
              <button
                onClick={loadCompilers}
                title="Пересканировать систему"
                className="flex items-center space-x-1 text-[11px] text-[var(--text-secondary)] hover:text-emerald-400"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Обновить</span>
              </button>
            </div>

            {/* List of detected compilers */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto p-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg">
              {currentAvailable.length === 0 ? (
                <div className="p-3 text-center text-[var(--text-secondary)]">
                  Нет авто-определенных компиляторов для {selectedLang}. Введите путь вручную ниже.
                </div>
              ) : (
                currentAvailable.map(c => {
                  const isSelected = !isCustomPath && selectedPath === c.path;
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectPreset(c)}
                      className={`flex items-center justify-between p-2.5 rounded-md cursor-pointer transition ${
                        isSelected
                          ? 'bg-emerald-500/15 border border-emerald-500/50 text-[var(--text-primary)]'
                          : 'hover:bg-[var(--bg-hover)] border border-transparent text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)]">{c.name}</span>
                        <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate">{c.path}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>

            {/* Custom Path Checkbox & Input */}
            <div className="pt-1">
              <label className="flex items-center space-x-2 text-[var(--text-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCustomPath}
                  onChange={(e) => setIsCustomPath(e.target.checked)}
                  className="rounded bg-[var(--bg-primary)] border-[var(--border-subtle)] text-emerald-600 focus:ring-0"
                />
                <span>Указать произвольный путь к исполняемому файлу</span>
              </label>

              {isCustomPath && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={selectedPath}
                    onChange={(e) => {
                      setSelectedPath(e.target.value);
                      setSelectedName(e.target.value.split(/[/\\]/).pop() || e.target.value);
                    }}
                    placeholder={isWindows ? 'C:\\Python312\\python.exe или cargo' : '/usr/bin/python3'}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Launch Arguments & Flags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-primary)] font-medium mb-1">
                Параметры запуска (CLI Arguments)
              </label>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="--verbose --port 8080"
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                Передаются скрипту или скомпилированной программе
              </span>
            </div>

            {(selectedLang === 'cpp' || selectedLang === 'c' || selectedLang === 'rust') && (
              <div>
                <label className="block text-[var(--text-primary)] font-medium mb-1">
                  Флаги компилятора (Compiler Flags)
                </label>
                <input
                  type="text"
                  value={compilerFlags}
                  onChange={(e) => setCompilerFlags(e.target.value)}
                  placeholder={selectedLang === 'rust' ? '--release' : '-Wall -O2'}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                  Флаги для {selectedLang === 'rust' ? 'cargo' : 'gcc/g++'}
                </span>
              </div>
            )}
          </div>

          {/* Command Preview */}
          <div>
            <label className="block text-[var(--text-secondary)] font-medium mb-1 flex items-center space-x-1.5">
              <Terminal className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Предпросмотр команды в терминале</span>
            </label>
            <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md p-2.5 font-mono text-[11px] text-emerald-400 break-all select-text">
              {commandPreview}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-[var(--border-subtle)] px-5 flex items-center justify-between bg-[var(--bg-secondary)]">
          <span className="text-[11px] text-[var(--text-secondary)]">
            Выбран: <span className="text-[var(--text-primary)] font-medium">{selectedName || selectedPath}</span>
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] text-[var(--text-primary)] transition border border-[var(--border-subtle)]"
            >
              Сохранить
            </button>
            <button
              onClick={handleRun}
              className="px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm flex items-center space-x-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Запустить сейчас</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
