import React from 'react';
import { 
  GitBranch, 
  Terminal, 
  Check, 
  AlertCircle,
  Code,
  FileCode,
  Bot
} from 'lucide-react';
import { OpenTab, PythonEnv, RustStatus } from '../types';
import { PythonIcon, RustIcon } from '../utils/langIcons';

interface StatusBarProps {
  activeTab?: OpenTab;
  gitBranch: string;
  isGitRepo: boolean;
  activePythonEnv?: PythonEnv;
  rustStatus?: RustStatus;
  currentCompilerName?: string;
  onOpenRunConfig?: () => void;
  onOpenPythonModal: () => void;
  onToggleTerminal: () => void;
  tabSize: number;
  cursorPos?: { line: number; col: number };
  isCopilotEnabled?: boolean;
  onToggleCopilot?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  gitBranch,
  isGitRepo,
  activePythonEnv,
  rustStatus,
  currentCompilerName,
  onOpenRunConfig,
  onOpenPythonModal,
  onToggleTerminal,
  tabSize,
  cursorPos = { line: 1, col: 1 },
  isCopilotEnabled = true,
  onToggleCopilot,
}) => {
  return (
    <footer className="h-6 w-full flex items-center justify-between px-3 text-[11px] select-none border-t shrink-0 z-30 font-sans
      bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]">
      
      {/* Left items: Git Branch, Status, Python & Rust info */}
      <div className="flex items-center space-x-3">
        {isGitRepo && (
          <div className="flex items-center space-x-1 hover:text-[var(--text-primary)] cursor-pointer transition-colors">
            <GitBranch className="w-3.5 h-3.5 text-[var(--accent-color)]" />
            <span className="font-mono">{gitBranch}</span>
          </div>
        )}

        {/* Python Environment Badge */}
        {activePythonEnv && (
          <button
            onClick={onOpenPythonModal}
            title="Click to switch Python interpreter / venv"
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] text-[var(--text-primary)] transition-colors font-mono"
          >
            <PythonIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{activePythonEnv.version.replace('Python ', '')}</span>
            {activePythonEnv.isVenv && (
              <span className="text-[9px] px-1 bg-emerald-500/20 text-emerald-500 rounded font-sans">
                {activePythonEnv.name}
              </span>
            )}
          </button>
        )}

        {/* Active Compiler / Runner Badge */}
        {currentCompilerName && onOpenRunConfig && (
          <button
            onClick={onOpenRunConfig}
            title="Нажмите, чтобы настроить компилятор или параметры запуска"
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[var(--bg-hover)] text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 font-mono text-[10px]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{currentCompilerName}</span>
          </button>
        )}
        {rustStatus && (rustStatus.hasCargo || activeTab?.language === 'rust') && (
          <div
            title={`Rust ${rustStatus.rustcVersion} - ${rustStatus.cargoVersion}`}
            className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-[var(--bg-hover)] text-orange-500 font-mono cursor-pointer"
          >
            <RustIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Cargo</span>
          </div>
        )}

        {activeTab?.isDirty && (
          <div className="flex items-center space-x-1.5 text-amber-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>1 unsaved file</span>
          </div>
        )}
      </div>

      {/* Right items: Stats, Line/Col, Indent, Encoding, Language */}
      <div className="flex items-center space-x-3 font-mono">
        {activeTab && (
          <>
            <span className="text-[var(--text-secondary)] hidden md:inline">
              Lines: {activeTab.content.split('\n').length} | Words: {activeTab.content.trim() ? activeTab.content.trim().split(/\s+/).length : 0}
            </span>
            <span className="hover:text-[var(--text-primary)] cursor-pointer">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span className="hover:text-[var(--text-primary)] cursor-pointer">
              Spaces: {tabSize}
            </span>
            <span className="hover:text-[var(--text-primary)] cursor-pointer">
              UTF-8
            </span>
            <span className="capitalize text-[var(--text-primary)] font-sans font-medium px-1.5 py-0.5 rounded bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer">
              {activeTab.language}
            </span>
          </>
        )}

        {onToggleCopilot && (
          <button
            onClick={onToggleCopilot}
            title={`AI Копилот (Gemini 3.1 Flash-Lite): ${isCopilotEnabled ? 'Включен (нажмите для выключения)' : 'Выключен (нажмите для включения)'}`}
            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition-colors text-[10px] font-sans font-medium ${
              isCopilotEnabled
                ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-hover)] border border-[var(--border-subtle)]'
            }`}
          >
            <Bot className="w-3 h-3" />
            <span>Copilot {isCopilotEnabled ? 'ON' : 'OFF'}</span>
          </button>
        )}

        <button
          onClick={onToggleTerminal}
          title="Toggle Terminal"
          className="flex items-center space-x-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
};
