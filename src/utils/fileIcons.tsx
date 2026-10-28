import React from 'react';
import { 
  FileCode, 
  FileText, 
  FileJson, 
  FileType, 
  Folder, 
  FolderOpen, 
  Image, 
  FileCheck,
  Settings,
  Terminal,
  Code
} from 'lucide-react';

export function getFileLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'json':
      return 'json';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
      return 'cpp';
    case 'cs':
      return 'csharp';
    case 'java':
      return 'java';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'sql':
      return 'sql';
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'ps1':
      return 'shell';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'xml':
    case 'svg':
      return 'xml';
    default:
      return 'plaintext';
  }
}

export function getFileIcon(fileName: string, isDirectory: boolean, isOpen?: boolean) {
  if (isDirectory) {
    return isOpen ? (
      <FolderOpen className="w-4 h-4 text-[var(--accent-color)] shrink-0" />
    ) : (
      <Folder className="w-4 h-4 text-[var(--accent-color)] opacity-85 shrink-0" />
    );
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-[#0284c7] dark:text-[#38bdf8] shrink-0" />;
    case 'js':
    case 'jsx':
    case 'mjs':
      return <FileCode className="w-4 h-4 text-[#facc15] shrink-0" />;
    case 'html':
      return <Code className="w-4 h-4 text-[#f97316] shrink-0" />;
    case 'css':
    case 'scss':
      return <FileType className="w-4 h-4 text-[#38bdf8] shrink-0" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-[#fb923c] shrink-0" />;
    case 'md':
      return <FileText className="w-4 h-4 text-[#c084fc] shrink-0" />;
    case 'py':
      return <FileCode className="w-4 h-4 text-[#fbbf24] shrink-0" />;
    case 'rs':
      return <FileCode className="w-4 h-4 text-[#ea580c] shrink-0" />;
    case 'cs':
      return <FileCode className="w-4 h-4 text-[#a855f7] shrink-0" />;
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
      return <FileCode className="w-4 h-4 text-[#3b82f6] shrink-0" />;
    case 'go':
      return <FileCode className="w-4 h-4 text-[#00add8] shrink-0" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return <Image className="w-4 h-4 text-[#4ade80] shrink-0" />;
    case 'config':
    case 'env':
      return <Settings className="w-4 h-4 text-[#94a3b8] shrink-0" />;
    case 'sh':
    case 'ps1':
      return <Terminal className="w-4 h-4 text-[#22c55e] shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-[#94a3b8] shrink-0" />;
  }
}
