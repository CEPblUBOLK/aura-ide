import React, { useState } from 'react';
import { Save, X, ArrowRight, FileCheck } from 'lucide-react';

interface SaveAsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFileName: string;
  onSaveAs: (newFileName: string) => Promise<void>;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  onClose,
  currentFileName,
  onSaveAs,
}) => {
  const [fileName, setFileName] = useState(currentFileName);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) return;
    setIsSaving(true);
    try {
      await onSaveAs(fileName.trim());
      onClose();
    } catch (err) {
      alert('Save As failed: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-2xl text-[var(--text-primary)] select-none space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center space-x-2 text-xs font-semibold text-[var(--text-primary)]">
            <Save className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Save File As...</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              New file name or relative path:
            </label>
            <input
              type="text"
              autoFocus
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. new_script.py"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-color)] font-mono transition-colors"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-color)] hover:brightness-110 disabled:opacity-50 text-[var(--accent-text)] flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <span>{isSaving ? 'Saving...' : 'Save File'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
