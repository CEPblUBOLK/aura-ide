import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  FilePlus, 
  FolderPlus, 
  RefreshCw, 
  Trash2, 
  Edit2, 
  MoreVertical,
  Check,
  X
} from 'lucide-react';
import { FileNode } from '../types';
import { getFileIcon } from '../utils/fileIcons';

interface FileTreeProps {
  tree: FileNode[];
  activeFilePath?: string;
  onFileSelect: (node: FileNode) => void;
  onRefresh: () => void;
  onCreateFile: (parentDir: string, name: string) => Promise<void>;
  onCreateFolder: (parentDir: string, name: string) => Promise<void>;
  onDeleteItem: (path: string) => Promise<void>;
  onRenameItem: (oldPath: string, newPath: string) => Promise<void>;
}

export const FileTree: React.FC<FileTreeProps> = ({
  tree,
  activeFilePath,
  onFileSelect,
  onRefresh,
  onCreateFile,
  onCreateFolder,
  onDeleteItem,
  onRenameItem,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingInPath, setCreatingInPath] = useState<string>('');
  const [newItemName, setNewItemName] = useState<string>('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const startCreating = (type: 'file' | 'folder', parentPath: string = '') => {
    setCreatingType(type);
    setCreatingInPath(parentPath);
    setNewItemName('');
    if (parentPath) {
      setExpandedFolders(prev => new Set(prev).add(parentPath));
    }
  };

  const submitCreate = async () => {
    if (!newItemName.trim() || !creatingType) {
      setCreatingType(null);
      return;
    }
    const targetDir = creatingInPath;
    const name = newItemName.trim();
    if (creatingType === 'file') {
      await onCreateFile(targetDir, name);
    } else {
      await onCreateFolder(targetDir, name);
    }
    setCreatingType(null);
    setNewItemName('');
  };

  const startRename = (node: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingPath(node.path);
    setRenameValue(node.name);
  };

  const submitRename = async (oldPath: string) => {
    if (!renameValue.trim() || renameValue === oldPath.split(/[/\\]/).pop()) {
      setRenamingPath(null);
      return;
    }
    const parentDir = oldPath.substring(0, Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\')));
    const separator = oldPath.includes('\\') ? '\\' : '/';
    const newPath = `${parentDir}${separator}${renameValue.trim()}`;
    await onRenameItem(oldPath, newPath);
    setRenamingPath(null);
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = activeFilePath === node.path;
    const isHovered = hoveredPath === node.path;
    const isRenaming = renamingPath === node.path;

    return (
      <div key={node.path} className="select-none text-xs">
        <div
          onMouseEnter={() => setHoveredPath(node.path)}
          onMouseLeave={() => setHoveredPath(null)}
          onClick={(e) => {
            if (node.isDirectory) {
              toggleFolder(node.path, e);
            } else {
              onFileSelect(node);
            }
          }}
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
          className={`group flex items-center justify-between py-1 pr-2 cursor-pointer rounded-md transition-colors ${
            isActive
              ? 'bg-[var(--accent-subtle)] text-[var(--accent-color)] font-medium border-l-2 border-[var(--accent-color)]'
              : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <div className="flex items-center space-x-1.5 truncate flex-1 min-w-0">
            {node.isDirectory ? (
              <span className="shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}

            {getFileIcon(node.name, node.isDirectory, isExpanded)}

            {isRenaming ? (
              <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(node.path);
                    if (e.key === 'Escape') setRenamingPath(null);
                  }}
                  className="bg-[var(--bg-primary)] border border-[var(--accent-color)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none w-28"
                />
                <button onClick={() => submitRename(node.path)} className="text-green-500 hover:brightness-110">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setRenamingPath(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </div>

          {/* Action buttons on hover */}
          {isHovered && !isRenaming && (
            <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              {node.isDirectory && (
                <>
                  <button
                    onClick={() => startCreating('file', node.path)}
                    title="New File inside"
                    className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <FilePlus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => startCreating('folder', node.path)}
                    title="New Folder inside"
                    className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <FolderPlus className="w-3 h-3" />
                  </button>
                </>
              )}
              <button
                onClick={(e) => startRename(node, e)}
                title="Rename"
                className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete ${node.name}?`)) {
                    onDeleteItem(node.path);
                  }
                }}
                title="Delete"
                className="p-0.5 rounded hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Inline item creation within folder */}
        {creatingType && creatingInPath === node.path && (
          <div style={{ paddingLeft: `${(depth + 1) * 12 + 10}px` }} className="flex items-center space-x-1 py-1 pr-2">
            {creatingType === 'file' ? getFileIcon(newItemName || 'file', false) : getFileIcon('folder', true, true)}
            <input
              type="text"
              autoFocus
              placeholder={creatingType === 'file' ? 'filename.ts' : 'folder-name'}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') setCreatingType(null);
              }}
              onBlur={submitCreate}
              className="bg-[var(--bg-primary)] border border-[var(--accent-color)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none flex-1 min-w-0"
            />
          </div>
        )}

        {/* Children folders / files */}
        {node.isDirectory && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-sidebar)]">
      {/* Explorer Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
        <span>Files</span>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => startCreating('file', '')}
            title="New File at Root"
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => startCreating('folder', '')}
            title="New Folder at Root"
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRefresh}
            title="Refresh Files"
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Root item creation */}
      {creatingType && creatingInPath === '' && (
        <div className="px-3 py-1.5 flex items-center space-x-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-hover)]">
          {creatingType === 'file' ? getFileIcon(newItemName || 'file', false) : getFileIcon('folder', true, true)}
          <input
            type="text"
            autoFocus
            placeholder={creatingType === 'file' ? 'filename.ts' : 'folder-name'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') setCreatingType(null);
            }}
            onBlur={submitCreate}
            className="bg-[var(--bg-primary)] border border-[var(--accent-color)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none flex-1"
          />
        </div>
      )}

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {tree.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text-secondary)]">
            No files in workspace
          </div>
        ) : (
          tree.map(node => renderNode(node, 0))
        )}
      </div>
    </div>
  );
};
