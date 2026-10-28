import React, { useRef, useEffect, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { 
  X, 
  Circle, 
  ChevronRight, 
  FilePlus, 
  Command, 
  FolderOpen,
  Code2,
  Save
} from 'lucide-react';
import { OpenTab, EditorSettings, ThemeMode } from '../types';
import { getFileIcon } from '../utils/fileIcons';
import { registerMonacoCompletions } from '../utils/monacoCompletions';
import { registerAiInlineCopilot } from '../utils/aiInlineCopilot';

interface EditorAreaProps {
  tabs: OpenTab[];
  activeTabId?: string;
  splitTabId?: string;
  isSplit: boolean;
  settings: EditorSettings;
  projectName: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onContentChange: (id: string, newContent: string) => void;
  onSaveFile: (id: string) => Promise<void>;
  onSaveAsPrompt: () => void;
  onOpenCommandPalette: () => void;
  onOpenFolderDialog: () => void;
  onNewFilePrompt: () => void;
  onCursorChange?: (line: number, col: number) => void;
  onSelectionChange?: (selectedText: string) => void;
}

export const registerMonacoThemes = (monaco: any) => {
  monaco.editor.defineTheme('macos-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'number', foreground: '79c0ff' },
    ],
    colors: {
      'editor.background': '#18181a',
      'editor.foreground': '#ededed',
      'editorGutter.background': '#18181a',
      'editorLineNumber.foreground': '#52525b',
      'editorLineNumber.activeForeground': '#0a84ff',
      'editor.lineHighlightBackground': '#222226',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#0a84ff',
    }
  });

  monaco.editor.defineTheme('macos-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'd73a49' },
      { token: 'string', foreground: '032f62' },
      { token: 'number', foreground: '005cc5' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1c1c1e',
      'editorGutter.background': '#ffffff',
      'editorLineNumber.foreground': '#8e8e93',
      'editorLineNumber.activeForeground': '#007aff',
      'editor.lineHighlightBackground': '#f2f2f7',
      'editor.selectionBackground': '#b3d7ff',
      'editorCursor.foreground': '#007aff',
    }
  });

  monaco.editor.defineTheme('tokyo-night', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'bb9af7' },
      { token: 'string', foreground: '9ece6a' },
      { token: 'number', foreground: 'ff9e64' },
    ],
    colors: {
      'editor.background': '#1a1b26',
      'editor.foreground': '#c0caf5',
      'editorGutter.background': '#1a1b26',
      'editorLineNumber.foreground': '#565f89',
      'editorLineNumber.activeForeground': '#7aa2f7',
      'editor.lineHighlightBackground': '#24283b',
      'editor.selectionBackground': '#364a82',
      'editorCursor.foreground': '#7aa2f7',
    }
  });

  monaco.editor.defineTheme('dracula', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
    ],
    colors: {
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'editorGutter.background': '#282a36',
      'editorLineNumber.foreground': '#6272a4',
      'editorLineNumber.activeForeground': '#ff79c6',
      'editor.lineHighlightBackground': '#343746',
      'editor.selectionBackground': '#44475a',
      'editorCursor.foreground': '#ff79c6',
    }
  });

  monaco.editor.defineTheme('one-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'string', foreground: '98c379' },
      { token: 'number', foreground: 'd19a66' },
    ],
    colors: {
      'editor.background': '#21252b',
      'editor.foreground': '#abb2bf',
      'editorGutter.background': '#21252b',
      'editorLineNumber.foreground': '#5c6370',
      'editorLineNumber.activeForeground': '#61afef',
      'editor.lineHighlightBackground': '#282c34',
      'editor.selectionBackground': '#3e4451',
      'editorCursor.foreground': '#528bff',
    }
  });

  monaco.editor.defineTheme('cyberpunk', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '505060', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff007f' },
      { token: 'string', foreground: '00ff66' },
      { token: 'number', foreground: 'ffe600' },
    ],
    colors: {
      'editor.background': '#0a0a0d',
      'editor.foreground': '#f0f0f5',
      'editorGutter.background': '#0a0a0d',
      'editorLineNumber.foreground': '#303040',
      'editorLineNumber.activeForeground': '#00f0ff',
      'editorCursor.foreground': '#00f0ff',
      'editor.lineHighlightBackground': '#151520',
      'editor.selectionBackground': '#00f0ff33',
    }
  });

  monaco.editor.defineTheme('nord', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '4c566a', fontStyle: 'italic' },
      { token: 'keyword', foreground: '81a1c1' },
      { token: 'string', foreground: 'a3be8c' },
      { token: 'number', foreground: 'b48ead' },
    ],
    colors: {
      'editor.background': '#2e3440',
      'editor.foreground': '#eceff4',
      'editorGutter.background': '#2e3440',
      'editorLineNumber.foreground': '#4c566a',
      'editorLineNumber.activeForeground': '#88c0d0',
      'editor.lineHighlightBackground': '#3b4252',
      'editor.selectionBackground': '#434c5e',
      'editorCursor.foreground': '#88c0d0',
    }
  });

  monaco.editor.defineTheme('github-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'number', foreground: '79c0ff' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#e6edf3',
      'editorGutter.background': '#0d1117',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#58a6ff',
      'editor.lineHighlightBackground': '#161b22',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#2f81f7',
    }
  });

  monaco.editor.defineTheme('catppuccin-mocha', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cba6f7' },
      { token: 'string', foreground: 'a6e3a1' },
      { token: 'number', foreground: 'fab387' },
    ],
    colors: {
      'editor.background': '#1e1e2e',
      'editor.foreground': '#cdd6f4',
      'editorGutter.background': '#1e1e2e',
      'editorLineNumber.foreground': '#6c7086',
      'editorLineNumber.activeForeground': '#cba6f7',
      'editor.lineHighlightBackground': '#252538',
      'editor.selectionBackground': '#45475a',
      'editorCursor.foreground': '#cba6f7',
    }
  });

  monaco.editor.defineTheme('gruvbox-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '928374', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'fb4934' },
      { token: 'string', foreground: 'b8bb26' },
      { token: 'number', foreground: 'd3869b' },
    ],
    colors: {
      'editor.background': '#282828',
      'editor.foreground': '#ebdbb2',
      'editorGutter.background': '#282828',
      'editorLineNumber.foreground': '#7c6f64',
      'editorLineNumber.activeForeground': '#fabd2f',
      'editor.lineHighlightBackground': '#32302f',
      'editor.selectionBackground': '#504945',
      'editorCursor.foreground': '#fabd2f',
    }
  });

  monaco.editor.defineTheme('solarized-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
      { token: 'keyword', foreground: '859900' },
      { token: 'string', foreground: '2aa198' },
      { token: 'number', foreground: 'd33682' },
    ],
    colors: {
      'editor.background': '#002b36',
      'editor.foreground': '#93a1a1',
      'editorGutter.background': '#002b36',
      'editorLineNumber.foreground': '#586e75',
      'editorLineNumber.activeForeground': '#2aa198',
      'editor.lineHighlightBackground': '#073642',
      'editor.selectionBackground': '#073642',
      'editorCursor.foreground': '#2aa198',
    }
  });

  monaco.editor.defineTheme('monokai-pro', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '727072', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff6188' },
      { token: 'string', foreground: 'ffd866' },
      { token: 'number', foreground: 'ab9df2' },
    ],
    colors: {
      'editor.background': '#2d2a2e',
      'editor.foreground': '#fcfcfa',
      'editorGutter.background': '#2d2a2e',
      'editorLineNumber.foreground': '#727072',
      'editorLineNumber.activeForeground': '#ffd866',
      'editor.lineHighlightBackground': '#363337',
      'editor.selectionBackground': '#403e41',
      'editorCursor.foreground': '#ffd866',
    }
  });

  monaco.editor.defineTheme('vesper', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '666666', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ffc799' },
      { token: 'string', foreground: 'a0ffa0' },
      { token: 'number', foreground: 'ff9999' },
    ],
    colors: {
      'editor.background': '#101010',
      'editor.foreground': '#ffffff',
      'editorGutter.background': '#101010',
      'editorLineNumber.foreground': '#444444',
      'editorLineNumber.activeForeground': '#ffc799',
      'editor.lineHighlightBackground': '#161616',
      'editor.selectionBackground': '#262626',
      'editorCursor.foreground': '#ffc799',
    }
  });

  registerMonacoCompletions(monaco);
  registerAiInlineCopilot(monaco);
};

export const EditorArea: React.FC<EditorAreaProps> = ({
  tabs,
  activeTabId,
  splitTabId,
  isSplit,
  settings,
  projectName,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSaveFile,
  onSaveAsPrompt,
  onOpenCommandPalette,
  onOpenFolderDialog,
  onNewFilePrompt,
  onCursorChange,
  onSelectionChange,
}) => {
  const monacoRef = useRef<any>(null);
  const activeTabIdRef = useRef(activeTabId);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const splitTab = tabs.find(t => t.id === splitTabId) || tabs.find(t => t.id !== activeTabId) || activeTab;

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Dynamically ensure Monaco applies the theme when settings.theme changes
  useEffect(() => {
    if (monacoRef.current) {
      try {
        monacoRef.current.editor.setTheme(settings.theme);
      } catch {}
    }
  }, [settings.theme]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    monacoRef.current = monaco;
    registerMonacoThemes(monaco);
    monaco.editor.setTheme(settings.theme);

    // Track cursor movements for line/column counter in status bar
    editor.onDidChangeCursorPosition((e: any) => {
      if (onCursorChange) {
        onCursorChange(e.position.lineNumber, e.position.column);
      }
    });

    // Track editor selection for AI Copilot quick actions (Explain, Bugs, Optimize, Tests)
    editor.onDidChangeCursorSelection(() => {
      if (onSelectionChange) {
        const selection = editor.getSelection();
        const model = editor.getModel();
        if (selection && model && !selection.isEmpty()) {
          const selectedText = model.getValueInRange(selection);
          onSelectionChange(selectedText);
        } else {
          onSelectionChange('');
        }
      }
    });

    // Add custom VS Code commands using activeTabIdRef to prevent stale closure
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Backslash, () => {
      editor.trigger('keyboard', 'editor.action.inlineSuggest.trigger', {});
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeTabIdRef.current) onSaveFile(activeTabIdRef.current);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {
      onOpenCommandPalette();
    });
    // Alt + \ to manually trigger AI Inline Copilot Completion
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Backslash, () => {
      editor.trigger('keyboard', 'editor.action.inlineSuggest.trigger', {});
    });
  };

  const renderSingleEditor = (tab?: OpenTab, isSecondary: boolean = false) => {
    if (!tab) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center mb-3 border border-[var(--border-subtle)] shadow-sm">
            <Code2 className="w-6 h-6 text-[var(--accent-color)]" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)] mb-1">
            Aura IDE
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mb-6 font-mono">
            {projectName || 'Рабочая область'}
          </p>

          <div className="space-y-1.5 text-xs w-full max-w-xs">
            <button
              onClick={onOpenCommandPalette}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition border border-[var(--border-subtle)]"
            >
              <div className="flex items-center space-x-2.5">
                <Command className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span className="text-xs font-medium">Командная палитра</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-hover)] font-mono text-[var(--text-secondary)] border border-[var(--border-subtle)]">Ctrl+P</kbd>
            </button>

            <button
              onClick={onNewFilePrompt}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition border border-[var(--border-subtle)]"
            >
              <div className="flex items-center space-x-2.5">
                <FilePlus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span className="text-xs font-medium">Создать файл</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-hover)] font-mono text-[var(--text-secondary)] border border-[var(--border-subtle)]">Ctrl+N</kbd>
            </button>

            <button
              onClick={onOpenFolderDialog}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition border border-[var(--border-subtle)]"
            >
              <div className="flex items-center space-x-2.5">
                <FolderOpen className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span className="text-xs font-medium">Открыть папку</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-hover)] font-mono text-[var(--text-secondary)] border border-[var(--border-subtle)]">Ctrl+O</kbd>
            </button>
          </div>
        </div>
      );
    }

    if (tab.isDiff) {
      return (
        <div className="flex-1 w-full h-full relative">
          <DiffEditor
            original={tab.originalContent || ''}
            modified={tab.content}
            language={tab.language}
            beforeMount={registerMonacoThemes}
            onMount={(editor, monaco) => { monacoRef.current = monaco; }}
            theme={settings.theme}
            options={{
              fontSize: settings.fontSize,
              fontFamily: settings.fontFamily,
              renderSideBySide: true,
              smoothScrolling: true,
              automaticLayout: true,
              readOnly: true,
              minimap: { enabled: settings.minimap },
            }}
          />
        </div>
      );
    }

    return (
      <div className="flex-1 w-full h-full relative flex flex-col bg-[var(--bg-primary)]">
        {/* Breadcrumb Path Bar */}
        <div className="h-6 px-3 flex items-center space-x-1.5 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] select-none font-mono">
          <span>{projectName}</span>
          <ChevronRight className="w-3 h-3 text-[var(--text-secondary)]" />
          {tab.relativePath.split('/').map((part, i, arr) => (
            <React.Fragment key={i}>
              <span className={i === arr.length - 1 ? 'text-[var(--text-primary)] font-medium' : ''}>
                {part}
              </span>
              {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-[var(--text-secondary)]" />}
            </React.Fragment>
          ))}
          {tab.isDirty && (
            <span className="text-[10px] text-amber-500 ml-2 font-sans font-medium flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block mr-1" />
              Unsaved
            </span>
          )}
        </div>

        {/* Monaco Editor Canvas */}
        <div className="flex-1 w-full h-full">
          <Editor
            key={tab.id}
            path={tab.path}
            value={tab.content}
            language={tab.language}
            beforeMount={registerMonacoThemes}
            theme={settings.theme}
            onChange={(val) => onContentChange(tab.id, val || '')}
            onMount={handleEditorDidMount}
            options={{
              fontSize: settings.fontSize,
              fontFamily: settings.fontFamily,
              tabSize: settings.tabSize,
              wordWrap: settings.wordWrap,
              minimap: { enabled: settings.minimap },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              bracketPairColorization: { enabled: true },
              formatOnPaste: true,
              automaticLayout: true,
              lineNumbers: settings.lineNumbers,
              renderLineHighlight: 'all',
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 },
              inlineSuggest: {
                enabled: settings.aiCopilotEnabled !== false,
                mode: 'prefix',
                showToolbar: 'always',
                suppressSuggestions: false,
              },
              quickSuggestions: { other: true, comments: false, strings: true },
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'on',
              tabCompletion: 'on',
              wordBasedSuggestions: 'allDocuments',
              parameterHints: { enabled: true },
              suggest: {
                snippetsPreventQuickSuggestions: false,
                localityBonus: true,
                shareSuggestSelections: true,
                showIcons: true,
                showStatusBar: true,
                preview: true,
              },
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-[var(--bg-primary)]">
      {/* macOS Pill Tab Bar */}
      <div className="h-9 w-full flex items-center px-2 space-x-1 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] overflow-x-auto select-none no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) onCloseTab(tab.id, e);
              }}
              className={`group flex items-center space-x-2 px-3 py-1 rounded-lg text-xs cursor-pointer transition-all border shrink-0 ${
                isActive
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium border-[var(--border-subtle)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-transparent'
              }`}
            >
              {getFileIcon(tab.name, false)}
              <span className="truncate max-w-[120px]">{tab.name}</span>

              {tab.isDirty ? (
                <span
                  onClick={(e) => onCloseTab(tab.id, e)}
                  title="Unsaved changes"
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-amber-500 hover:bg-[var(--bg-hover)]"
                >
                  <Circle className="w-2 h-2 fill-current" />
                </span>
              ) : (
                <button
                  onClick={(e) => onCloseTab(tab.id, e)}
                  title="Close Tab"
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        <div className="flex-1" />

        {/* Save & Save As buttons */}
        {activeTab && (
          <div className="flex items-center space-x-1 shrink-0 px-1">
            <button
              onClick={() => onSaveFile(activeTab.id)}
              title="Save (Ctrl+S)"
              className={`flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                activeTab.isDirty
                  ? 'bg-[var(--accent-color)] text-[var(--accent-text)] font-semibold shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <Save className="w-3 h-3" />
              <span>Save</span>
            </button>

            <button
              onClick={onSaveAsPrompt}
              title="Save As... (Ctrl+Shift+S)"
              className="flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
            >
              <span>Save As...</span>
            </button>
          </div>
        )}
      </div>

      {/* Editor Main Canvas (Single or Split) */}
      <div className="flex-1 flex overflow-hidden">
        {renderSingleEditor(activeTab)}

        {isSplit && (
          <div className="flex-1 flex border-l border-[var(--border-subtle)]">
            {renderSingleEditor(splitTab, true)}
          </div>
        )}
      </div>
    </div>
  );
};
