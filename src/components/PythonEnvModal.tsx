import React, { useState } from 'react';
import { PythonEnv } from '../types';
import { PythonIcon } from '../utils/langIcons';
import { 
  X, 
  Check, 
  Plus, 
  Terminal, 
  FolderCheck, 
  Cpu, 
  Loader2,
  FolderSearch,
  Package,
  Download
} from 'lucide-react';

interface PythonEnvModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEnv?: PythonEnv;
  venvs: PythonEnv[];
  systemPythons: PythonEnv[];
  onSelectEnv: (env: PythonEnv) => void;
  onCreateVenv: (name: string) => Promise<void>;
  onBrowsePythonFile?: () => void;
  onPipInstall?: (pkgName: string) => void;
}

export const PythonEnvModal: React.FC<PythonEnvModalProps> = ({
  isOpen,
  onClose,
  activeEnv,
  venvs,
  systemPythons,
  onSelectEnv,
  onCreateVenv,
  onBrowsePythonFile,
  onPipInstall,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newVenvName, setNewVenvName] = useState('.venv');
  const [pipPackage, setPipPackage] = useState('');

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!newVenvName.trim()) return;
    setIsCreating(true);
    try {
      await onCreateVenv(newVenvName.trim());
      onClose();
    } catch (err) {
      alert('Ошибка создания виртуального окружения: ' + (err as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipPackage.trim() || !onPipInstall) return;
    onPipInstall(pipPackage.trim());
    setPipPackage('');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-2xl text-[var(--text-primary)] select-none space-y-4 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
          <div className="flex items-center space-x-2.5">
            <PythonIcon className="w-6 h-6 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Выбор интерпретатора Python</h3>
              <p className="text-[11px] text-[var(--text-secondary)]">Все запуски кода и pip будут использовать только выбранный Python</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Currently Active Python Banner */}
        {activeEnv && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between shrink-0">
            <div className="space-y-0.5 min-w-0 pr-2">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>Активный интерпретатор: {activeEnv.name}</span>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate">{activeEnv.path}</div>
            </div>
          </div>
        )}

        {/* Action Row: Browse executable & pip install */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
          {/* Browse for custom python.exe */}
          <button
            type="button"
            onClick={() => {
              if (onBrowsePythonFile) onBrowsePythonFile();
            }}
            className="p-2.5 rounded-xl bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] border border-[var(--border-subtle)] flex items-center space-x-2 text-xs font-medium text-[var(--text-primary)] transition active:scale-[0.99]"
          >
            <FolderSearch className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-left">
              <div className="font-semibold text-xs">Выбрать python.exe на диске</div>
              <div className="text-[10px] text-[var(--text-secondary)]">Указать путь через Проводник</div>
            </div>
          </button>

          {/* Quick Pip Install */}
          <form onSubmit={handlePipSubmit} className="flex space-x-1.5 p-1 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-subtle)] items-center">
            <Package className="w-4 h-4 text-blue-400 shrink-0 ml-1.5" />
            <input
              type="text"
              value={pipPackage}
              onChange={(e) => setPipPackage(e.target.value)}
              placeholder="pip install <пакет>..."
              className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none px-1"
            />
            <button
              type="submit"
              disabled={!pipPackage.trim()}
              title="Установить в этот интерпретатор"
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium text-xs flex items-center space-x-1 shrink-0 transition"
            >
              <Download className="w-3 h-3" />
              <span>pip</span>
            </button>
          </form>
        </div>

        {/* Scrollable Interpreters List */}
        <div className="overflow-y-auto space-y-3 pr-1 flex-1">
          {/* Workspace Virtual Environments */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider px-1">
              Виртуальные окружения (Venv)
            </div>
            {venvs.length === 0 ? (
              <div className="p-2.5 rounded-lg bg-[var(--bg-hover)] text-center text-xs text-[var(--text-secondary)]">
                В проекте нет папки виртуального окружения
              </div>
            ) : (
              venvs.map((env) => {
                const isSelected = activeEnv?.path?.toLowerCase() === env.path.toLowerCase();
                return (
                  <div
                    key={env.path}
                    onClick={() => {
                      onSelectEnv(env);
                      onClose();
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors border ${
                      isSelected
                        ? 'bg-[var(--accent-subtle)] border-emerald-500/50 text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] border-transparent hover:bg-[var(--bg-active)] text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <FolderCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-semibold flex items-center space-x-1.5">
                          <span>{env.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                            venv
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate">{env.path}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />}
                  </div>
                );
              })
            )}
          </div>

          {/* System Python Interpreters */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider px-1">
              Установленные интерпретаторы Python
            </div>
            {systemPythons.map((env) => {
              const isSelected = activeEnv?.path?.toLowerCase() === env.path.toLowerCase();
              return (
                <div
                  key={env.path}
                  onClick={() => {
                    onSelectEnv(env);
                    onClose();
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors border ${
                    isSelected
                      ? 'bg-[var(--accent-subtle)] border-emerald-500/50 text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] border-transparent hover:bg-[var(--bg-active)] text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Cpu className="w-4 h-4 text-[var(--accent-color)] shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-semibold flex items-center space-x-1.5">
                        <span>{env.name}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate">{env.path}</div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: Create new venv card */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="text-[11px] text-[var(--text-secondary)]">
            Создать новое окружение <span className="font-mono text-[var(--text-primary)]">.venv</span> в папке проекта:
          </div>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-[var(--accent-color)] hover:brightness-110 disabled:opacity-50 text-[var(--accent-text)] font-semibold text-xs transition-colors shadow-sm"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Создание...</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Создать .venv</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
