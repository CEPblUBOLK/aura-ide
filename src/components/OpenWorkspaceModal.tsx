import React, { useState } from 'react';
import { FolderOpen, X, ArrowRight, FolderSearch } from 'lucide-react';

interface OpenWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onSelectWorkspace: (path: string) => Promise<void>;
  onOpenFolderPicker?: () => void;
}

export const OpenWorkspaceModal: React.FC<OpenWorkspaceModalProps> = ({
  isOpen,
  onClose,
  currentPath,
  onSelectWorkspace,
  onOpenFolderPicker,
}) => {
  const [targetPath, setTargetPath] = useState(currentPath);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPath.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await onSelectWorkspace(targetPath.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Не удалось открыть директорию');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickClick = () => {
    if (onOpenFolderPicker) {
      onOpenFolderPicker();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-xl text-[var(--text-primary)] select-none space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold text-[var(--text-primary)]">
            <FolderOpen className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Открыть папку проекта</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Action: Native Folder Browser Dialog Window */}
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">
            Выберите папку с кодом в Проводнике Windows для открытия в редакторе:
          </p>
          <button
            type="button"
            onClick={handlePickClick}
            className="w-full py-3 px-4 rounded-xl font-medium text-xs bg-[var(--accent-color)] hover:brightness-110 text-[var(--accent-text)] flex items-center justify-center space-x-2 shadow-md transition-all active:scale-[0.99]"
          >
            <FolderSearch className="w-4 h-4" />
            <span className="font-semibold text-sm">Выбрать папку окошком (Обзор...)</span>
          </button>
        </div>

        {/* Secondary: Manual Path input */}
        <div className="pt-2 border-t border-[var(--border-subtle)]">
          {!showManualInput ? (
            <button
              type="button"
              onClick={() => setShowManualInput(true)}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center space-x-1"
            >
              <span>+ Или ввести путь к папке вручную</span>
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Абсолютный путь к папке:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="Например: C:\Users\Slava\my-project"
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-color)] font-mono transition-colors"
                />
              </div>

              {error && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                  {error}
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Скрыть
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-color)] hover:brightness-110 disabled:opacity-50 text-[var(--accent-text)] flex items-center space-x-1.5 shadow-sm transition-colors"
                >
                  <span>{isLoading ? 'Открытие...' : 'Открыть'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
