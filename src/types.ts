export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  children?: FileNode[];
}

export interface OpenTab {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  content: string;
  initialContent: string;
  isDirty: boolean;
  language: string;
  isDiff?: boolean;
  originalContent?: string;
}

export interface GitFile {
  file: string;
  fullPath: string;
  code: string;
  status: 'modified' | 'untracked' | 'added' | 'deleted';
  staged: boolean;
}

export interface SearchResult {
  file: string;
  relativePath: string;
  line: number;
  content: string;
}

export interface PythonEnv {
  name: string;
  path: string;
  version: string;
  isVenv: boolean;
  folder?: string;
}

export interface RustStatus {
  hasCargo: boolean;
  packageName?: string;
  cargoVersion: string;
  rustcVersion: string;
}

export type ThemeMode = 
  | 'macos-dark' 
  | 'macos-light' 
  | 'tokyo-night' 
  | 'dracula' 
  | 'one-dark' 
  | 'cyberpunk' 
  | 'nord'
  | 'github-dark'
  | 'catppuccin-mocha'
  | 'gruvbox-dark'
  | 'solarized-dark'
  | 'monokai-pro'
  | 'vesper';

export interface CompilerItem {
  id: string;
  name: string;
  path: string;
  isVenv?: boolean;
  isCargo?: boolean;
  type?: string;
}

export interface RunConfiguration {
  language: string;
  compilerPath: string;
  compilerName: string;
  args: string;
  compilerFlags?: string;
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: 'on' | 'off';
  minimap: boolean;
  lineNumbers: 'on' | 'off';
  theme: ThemeMode;
  aiCopilotEnabled?: boolean;
  aiCopilotModel?: string;
  aiCopilotTriggerMode?: 'auto' | 'manual';
}
