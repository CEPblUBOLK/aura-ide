import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn, exec, execFile, execSync } from 'child_process';
import { promisify } from 'util';
import pty from 'node-pty';
import chokidar from 'chokidar';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const runnerWss = new WebSocketServer({ noServer: true });
const eventsWss = new WebSocketServer({ noServer: true });

let workspaceWatcher = null;

function broadcastFsEvent(type, eventPath) {
  const message = JSON.stringify({ type: 'fs-changed', event: type, path: eventPath });
  for (const client of eventsWss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function startWorkspaceWatcher(targetPath) {
  if (workspaceWatcher) {
    try { workspaceWatcher.close(); } catch {}
    workspaceWatcher = null;
  }
  try {
    workspaceWatcher = chokidar.watch(targetPath, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.venv/**',
        '**/dist/**',
        '**/*.WebView2/**',
        '**/__pycache__/**',
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 6,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 80
      }
    });

    workspaceWatcher.on('all', (event, filePath) => {
      const rel = path.relative(targetPath, filePath);
      broadcastFsEvent(event, rel);
    });
  } catch (err) {
    console.error('[Chokidar] Watcher failed to start:', err.message);
  }
}

const PORT = process.env.PORT || 3001;
// Default workspace to the parent directory or aura-ide
let currentWorkspace = path.resolve(process.cwd());
let activePythonExe = null;

// Automatically load .env if present
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fsSync.existsSync(envPath)) {
    const envLines = fsSync.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch {}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Helper to sanitize paths within workspace or allow absolute system paths safely
function resolveSafePath(targetPath) {
  if (!targetPath) return currentWorkspace;
  if (path.isAbsolute(targetPath)) return path.normalize(targetPath);
  return path.normalize(path.join(currentWorkspace, targetPath));
}

// 1. Workspace API
app.get('/api/workspace', (req, res) => {
  res.json({
    workspace: currentWorkspace,
    name: path.basename(currentWorkspace),
    parent: path.dirname(currentWorkspace)
  });
});

app.post('/api/workspace', async (req, res) => {
  const { path: newPath } = req.body;
  try {
    const stats = await fs.stat(newPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
    currentWorkspace = path.resolve(newPath);
    startWorkspaceWatcher(currentWorkspace);
    res.json({ workspace: currentWorkspace, name: path.basename(currentWorkspace) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Native folder selection dialog fallback for browser / HTTP
app.post('/api/dialog/open-folder', async (req, res) => {
  try {
    if (process.platform === 'win32') {
      const psScript = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Выберите папку проекта (Aura IDE)'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }`;
      const { stdout } = await execAsync(`powershell.exe -NoProfile -NonInteractive -Command "${psScript}"`);
      const selected = stdout.trim();
      if (selected) {
        currentWorkspace = path.resolve(selected);
        return res.json({ success: true, path: currentWorkspace, name: path.basename(currentWorkspace) });
      }
      return res.json({ canceled: true });
    } else if (process.platform === 'darwin') {
      const { stdout } = await execAsync(`osascript -e 'POSIX path of (choose folder with prompt "Select Project Folder")'`);
      const selected = stdout.trim();
      if (selected) {
        currentWorkspace = path.resolve(selected);
        return res.json({ success: true, path: currentWorkspace, name: path.basename(currentWorkspace) });
      }
      return res.json({ canceled: true });
    } else {
      return res.status(501).json({ error: 'Platform not supported' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. File Tree API (Recursive, fast, ignores heavy folders)
async function buildTree(dirPath, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes = [];

  const ignoreList = new Set(['node_modules', '.git', '.cache', 'dist', 'build', '.next', '.vscode']);

  for (const entry of entries) {
    if (ignoreList.has(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(currentWorkspace, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        relativePath,
        isDirectory: true,
        children: currentDepth < maxDepth ? await buildTree(fullPath, maxDepth, currentDepth + 1) : []
      });
    } else {
      nodes.push({
        name: entry.name,
        path: fullPath,
        relativePath,
        isDirectory: false,
        size: 0
      });
    }
  }

  // Sort directories first, then alphabetical
  return nodes.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name);
    }
    return a.isDirectory ? -1 : 1;
  });
}

app.get('/api/tree', async (req, res) => {
  try {
    const targetDir = req.query.path ? resolveSafePath(req.query.path) : currentWorkspace;
    const tree = await buildTree(targetDir);
    res.json({ tree, root: currentWorkspace, rootName: path.basename(currentWorkspace) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. File Read/Write API
app.get('/api/file', async (req, res) => {
  const filePath = resolveSafePath(req.query.path);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content, path: filePath, relativePath: path.relative(currentWorkspace, filePath).replace(/\\/g, '/') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/file', async (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'File path required' });
  const target = resolveSafePath(filePath);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf-8');
    res.json({ success: true, path: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/create', async (req, res) => {
  const { path: itemPath, type } = req.body;
  const target = resolveSafePath(itemPath);
  try {
    if (type === 'folder') {
      await fs.mkdir(target, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, '', 'utf-8');
    }
    res.json({ success: true, path: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/delete', async (req, res) => {
  const { path: itemPath } = req.body;
  if (!itemPath || typeof itemPath !== 'string' || !itemPath.trim()) {
    return res.status(400).json({ error: 'File path required' });
  }
  const target = resolveSafePath(itemPath);
  const normTarget = path.resolve(target).toLowerCase();
  const normWs = path.resolve(currentWorkspace).toLowerCase();

  // Guard against deleting workspace root, parent, or filesystem root
  if (normTarget === normWs || normTarget === path.dirname(normWs) || normTarget === path.parse(normTarget).root.toLowerCase()) {
    return res.status(400).json({ error: 'Cannot delete workspace root or parent directory' });
  }

  // Guard against deleting anything outside workspace
  const rel = path.relative(normWs, normTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return res.status(400).json({ error: 'Cannot delete files outside workspace' });
  }

  try {
    const stats = await fs.stat(target);
    if (stats.isDirectory()) {
      await fs.rm(target, { recursive: true, force: true });
    } else {
      await fs.unlink(target);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rename', async (req, res) => {
  const { oldPath, newPath } = req.body;
  const source = resolveSafePath(oldPath);
  const target = resolveSafePath(newPath);
  try {
    await fs.rename(source, target);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Search API (Quick Search across files)
app.get('/api/search', async (req, res) => {
  const query = req.query.query;
  const matchCase = req.query.matchCase === 'true';
  const isRegex = req.query.isRegex === 'true';
  if (!query || query.length < 1) return res.json({ results: [] });

  let regex = null;
  if (isRegex) {
    try {
      regex = new RegExp(query, matchCase ? '' : 'i');
    } catch {
      return res.json({ results: [] });
    }
  }

  const results = [];
  const maxResults = 100;

  async function searchInDir(dir) {
    if (results.length >= maxResults) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (['node_modules', '.git', 'dist', 'build', '.venv', 'AuraIDE.exe.WebView2'].includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await searchInDir(fullPath);
        } else {
          // Check extension
          const ext = path.extname(entry.name).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.exe', '.dll', '.bin', '.lock', '.zip'].includes(ext)) continue;

          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults) break;
              const line = lines[i];
              const isMatch = regex ? regex.test(line) : (matchCase ? line.includes(query) : line.toLowerCase().includes(query.toLowerCase()));
              if (isMatch) {
                results.push({
                  file: fullPath,
                  relativePath: path.relative(currentWorkspace, fullPath).replace(/\\/g, '/'),
                  line: i + 1,
                  content: line.trim()
                });
              }
            }
          } catch {
            // Ignore unreadable/binary files
          }
        }
      }
    } catch {
      // Ignore directory errors
    }
  }

  await searchInDir(currentWorkspace);
  res.json({ results });
});

// 5. Git API
app.get('/api/git/status', async (req, res) => {
  try {
    // Check if git repo
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: currentWorkspace });
    
    // Get branch
    const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: currentWorkspace });
    const branch = branchOut.trim() || 'HEAD';

    // Get status porcelain
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: currentWorkspace });
    const lines = statusOut.split('\n').filter(Boolean);
    const files = lines.map(line => {
      const code = line.substring(0, 2);
      const file = line.substring(3).trim();
      let status = 'modified';
      if (code.includes('?')) status = 'untracked';
      else if (code.includes('A')) status = 'added';
      else if (code.includes('D')) status = 'deleted';
      return {
        file,
        fullPath: path.join(currentWorkspace, file),
        code,
        status,
        staged: code[0] !== ' ' && code[0] !== '?'
      };
    });

    res.json({ isRepo: true, branch, files });
  } catch {
    res.json({ isRepo: false, branch: '', files: [] });
  }
});

app.get('/api/git/diff', async (req, res) => {
  const filePath = req.query.file;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'File parameter is required' });
  }
  try {
    // Try git diff for working tree vs HEAD safely without shell injection
    let diff = '';
    try {
      const { stdout } = await execFileAsync('git', ['diff', 'HEAD', '--', filePath], { cwd: currentWorkspace });
      diff = stdout;
    } catch {
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--', filePath], { cwd: currentWorkspace });
        diff = stdout;
      } catch {}
    }

    // Also get original file content from HEAD
    let original = '';
    try {
      const { stdout } = await execFileAsync('git', ['show', `HEAD:${filePath}`], { cwd: currentWorkspace });
      original = stdout;
    } catch {
      original = '';
    }

    // Get current modified content
    let modified = '';
    try {
      modified = await fs.readFile(path.join(currentWorkspace, filePath), 'utf-8');
    } catch {
      modified = '';
    }

    res.json({ diff, original, modified });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/commit', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Commit message is required' });
  }
  try {
    await execFileAsync('git', ['add', '-A'], { cwd: currentWorkspace });
    const { stdout } = await execFileAsync('git', ['commit', '-m', message.trim()], { cwd: currentWorkspace });
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/stage', async (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'File is required' });
  try {
    await execFileAsync('git', ['add', '--', file], { cwd: currentWorkspace });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/unstage', async (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'File is required' });
  try {
    await execFileAsync('git', ['restore', '--staged', '--', file], { cwd: currentWorkspace });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/discard', async (req, res) => {
  const { file, status } = req.body;
  if (!file) return res.status(400).json({ error: 'File is required' });
  try {
    if (status === 'untracked') {
      const fullPath = path.join(currentWorkspace, file);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    } else {
      await execFileAsync('git', ['restore', '--', file], { cwd: currentWorkspace });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/push', async (req, res) => {
  try {
    const { stdout } = await execAsync('git push', { cwd: currentWorkspace });
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/pull', async (req, res) => {
  try {
    const { stdout } = await execAsync('git pull', { cwd: currentWorkspace });
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Python & Rust Environments API
const knownCustomPythons = new Set([
  'F:\\qwen-chat\\venv\\Scripts\\python.exe',
  'F:\\Мое\\asm\\venv\\Scripts\\python.exe'
]);

app.post('/api/python/select', (req, res) => {
  const { path: pyPath } = req.body;
  if (pyPath && typeof pyPath === 'string') {
    activePythonExe = path.resolve(pyPath);
    knownCustomPythons.add(activePythonExe);
  }
  res.json({ success: true, activePython: activePythonExe });
});

// Native file selection dialog for picking python.exe or any compiler executable
app.post('/api/dialog/open-file', async (req, res) => {
  try {
    if (process.platform === 'win32') {
      const psScript = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Выберите исполняемый файл (python.exe)'; $f.Filter = 'Исполняемые файлы (*.exe)|*.exe|Все файлы (*.*)|*.*'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.FileName }`;
      const { stdout } = await execAsync(`powershell.exe -NoProfile -NonInteractive -Command "${psScript}"`);
      const selected = stdout.trim();
      if (selected && fsSync.existsSync(selected)) {
        let version = 'Custom Python';
        try {
          const { stdout: verOut } = await execAsync(`"${selected}" --version`);
          version = verOut.trim();
        } catch {}
        activePythonExe = selected;
        knownCustomPythons.add(selected);
        return res.json({ success: true, path: selected, name: `${version} (Custom)`, version });
      }
      return res.json({ canceled: true });
    } else {
      return res.status(501).json({ error: 'Platform not supported' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/python/environments', async (req, res) => {
  try {
    const venvs = [];
    const systemPythons = [];
    const seen = new Set();

    const addCandidate = async (p, isVenv = false, customName = null) => {
      if (!p) return;
      const resolved = path.resolve(p);
      const lower = resolved.toLowerCase();
      if (seen.has(lower)) return;
      try {
        await fs.access(resolved);
        seen.add(lower);
        let version = isVenv ? 'Python (venv)' : 'Python';
        try {
          const { stdout } = await execAsync(`"${resolved}" --version`);
          version = stdout.trim();
        } catch {}

        const dirName = path.basename(path.dirname(resolved));
        const parentName = path.basename(path.dirname(path.dirname(resolved)));
        const displayName = customName || (isVenv ? `${version} (${parentName})` : `${version} (${dirName})`);

        const item = {
          name: displayName,
          path: resolved,
          version,
          isVenv,
          folder: path.dirname(resolved)
        };

        if (isVenv) {
          venvs.push(item);
        } else {
          systemPythons.push(item);
        }
      } catch {}
    };

    // 1. Check workspace for venvs (.venv, venv, env, .env, etc.)
    const possibleVenvDirs = ['.venv', 'venv', 'env', '.env'];
    for (const dirName of possibleVenvDirs) {
      const venvPath = path.join(currentWorkspace, dirName);
      const pythonExe = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');
      await addCandidate(pythonExe, true, `${dirName} (venv)`);
    }

    // 2. Scan known project venvs (e.g. on F: drive)
    for (const customPath of knownCustomPythons) {
      await addCandidate(customPath, customPath.toLowerCase().includes('venv'));
    }

    // 3. Scan Windows py launcher: py -0p
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync('py -0p');
        for (const line of stdout.split('\n')) {
          const match = line.match(/-V:([^\s]+)\s+(?:[*]\s+)?(.*)/);
          if (match) {
            const ver = match[1].trim();
            const pyPath = match[2].trim();
            await addCandidate(pyPath, false, `Python ${ver} (Global)`);
          }
        }
      } catch {}

      // 4. Scan AppData\Local\Programs\Python directory
      const localPyDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
      try {
        const subs = await fs.readdir(localPyDir, { withFileTypes: true });
        for (const sub of subs) {
          if (sub.isDirectory()) {
            const p = path.join(localPyDir, sub.name, 'python.exe');
            await addCandidate(p, false, `${sub.name}`);
          }
        }
      } catch {}

      // 5. where.exe python
      try {
        const { stdout } = await execAsync('where.exe python');
        for (const l of stdout.split('\n')) {
          const trimmed = l.trim();
          if (trimmed) await addCandidate(trimmed, false, 'System PATH');
        }
      } catch {}
    } else {
      try {
        const { stdout } = await execAsync('which python3 || which python');
        const first = stdout.trim();
        if (first) await addCandidate(first, false, 'System Python 3');
      } catch {}
    }

    // Determine active environment
    let active = null;
    if (activePythonExe) {
      const match = [...venvs, ...systemPythons].find(e => e.path.toLowerCase() === activePythonExe.toLowerCase());
      if (match) active = match;
    }
    if (!active) {
      active = venvs[0] || systemPythons[0] || {
        name: 'python',
        path: 'python',
        version: 'Default Python',
        isVenv: false
      };
      activePythonExe = active.path;
    }

    res.json({
      active,
      venvs,
      system: systemPythons
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Inline Code Autocomplete (GitHub Copilot style with Local AST Fallback + Multi-Model Gemini)
const copilotCache = new Map();

function cleanCopilotCompletion(raw, prefix) {
  let clean = (raw || '')
    .replace(/^```[a-zA-Z]*\r?\n?/g, '')
    .replace(/```\s*$/g, '');

  if (prefix && clean.startsWith(prefix)) {
    clean = clean.slice(prefix.length);
  }

  const lines = (prefix || '').split('\n');
  const lastLine = lines[lines.length - 1] || '';
  if (lastLine.trim() && clean.startsWith(lastLine)) {
    clean = clean.slice(lastLine.length);
  } else if (lastLine.trim() && clean.startsWith(lastLine.trimStart())) {
    clean = clean.slice(lastLine.trimStart().length);
  }

  // Token / word overlap stripping
  const pTrim = (prefix || '').trimEnd();
  let cTrim = clean.trimStart();
  const maxCheck = Math.min(pTrim.length, cTrim.length);
  for (let len = maxCheck; len >= 2; len--) {
    const pSub = pTrim.slice(-len);
    const cSub = cTrim.slice(0, len);
    if (pSub.toLowerCase() === cSub.toLowerCase()) {
      clean = cTrim.slice(len);
      break;
    }
  }

  if ((prefix || '').endsWith(' ') && clean.startsWith(' ')) {
    clean = clean.trimStart();
  }

  clean = clean.replace(/^(Here is|To complete|You can|Sure|Certainly|Note:).*?\r?\n/i, '');
  return clean;
}

function generateLocalSemanticFallback(prefix, suffix, language, filename) {
  const cleanPrefix = (prefix || '').replace(/\r\n/g, '\n');
  const lines = cleanPrefix.split('\n');
  const currentLine = lines[lines.length - 1] || '';
  const lang = (language || '').toLowerCase();

  // Python
  if (lang === 'python' || (filename && filename.endsWith('.py'))) {
    // 1. from <pkg> import
    const fromMatch = currentLine.match(/^\s*from\s+([a-zA-Z0-9_.]+)\s+import\s*(.*)$/);
    if (fromMatch) {
      const targetMod = fromMatch[1].toLowerCase();
      const after = fromMatch[2].trim();
      if (!after) {
        const popular = {
          'aiogram': 'Bot, Dispatcher, types, F, Router',
          'aiogram.filters': 'Command, CommandStart',
          'aiogram.types': 'Message, CallbackQuery',
          'asyncio': 'run, sleep, gather, create_task',
          'os': 'path, environ, getcwd',
          'sys': 'argv, exit, path',
          'math': 'sin, cos, pi, sqrt, ceil, floor',
          'typing': 'Optional, List, Dict, Any, Union, Tuple',
          'pydantic': 'BaseModel, Field',
          'fastapi': 'FastAPI, Depends, HTTPException, status',
          'flask': 'Flask, request, jsonify, render_template',
          'datetime': 'datetime, timedelta, timezone',
          'json': 'dumps, loads',
          'requests': 'get, post, Response',
          'subprocess': 'run, Popen, PIPE',
          'unittest.mock': 'Mock, patch, MagicMock',
          'pathlib': 'Path',
          'collections': 'defaultdict, Counter, deque',
          'itertools': 'chain, combinations, permutations',
          'random': 'choice, randint, random, shuffle',
          're': 'search, match, findall, sub'
        };
        if (popular[targetMod]) return popular[targetMod];
      }
    }

    // 2. import
    if (/^\s*import\s*$/.test(currentLine)) {
      return 'os, sys, json, time';
    }

    // 3. if __name__ ==
    if (/if\s+__name__\s*==\s*['"]?$/.test(currentLine)) {
      return `'__main__':\n    asyncio.run(main())`;
    }

    // 4. async def main():
    if (/^\s*async\s+def\s+main\(\s*\)\s*:\s*$/.test(currentLine)) {
      const indent = currentLine.match(/^\s*/)[0] + '    ';
      return `\n${indent}print("Starting...")\n\nif __name__ == '__main__':\n    asyncio.run(main())`;
    }

    // 5. def func(args):
    if (/^\s*def\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:\s*$/.test(currentLine)) {
      const indent = currentLine.match(/^\s*/)[0] + '    ';
      return `\n${indent}pass`;
    }

    // 6. class Name:
    if (/^\s*class\s+[a-zA-Z0-9_]+(\([^)]*\))?\s*:\s*$/.test(currentLine)) {
      const indent = currentLine.match(/^\s*/)[0] + '    ';
      return `\n${indent}def __init__(self):\n${indent}    pass`;
    }
  }

  // JavaScript / TypeScript
  if (lang === 'typescript' || lang === 'javascript' || lang === 'typescriptreact' || lang === 'javascriptreact') {
    if (/const\s*\[([a-zA-Z0-9_]+),\s*set\1\]\s*=\s*$/i.test(currentLine)) {
      return 'useState(null);';
    }
    if (/^\s*import\s*$/i.test(currentLine)) {
      return "{ useState, useEffect } from 'react';";
    }
  }

  return '';
}

app.post('/api/ai/inline-complete', async (req, res) => {
  const { prefix, suffix, language, filename, apiKey: customKey } = req.body;
  if (!prefix && !suffix) return res.json({ completion: '' });

  const cacheKey = (prefix ? prefix.slice(-200) : '') + ':::' + (suffix ? suffix.slice(0, 100) : '');
  if (copilotCache.has(cacheKey)) {
    return res.json({ completion: copilotCache.get(cacheKey), cached: true });
  }

  const deepseekApiKey = req.body.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
  const geminiApiKey = customKey || process.env.GEMINI_API_KEY;

  // 1. Primary AI Engine: DeepSeek FIM (Fill-In-The-Middle official code completion)
  if (deepseekApiKey) {
    try {
      const fimRes = await fetch('https://api.deepseek.com/beta/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          prompt: prefix ? prefix.slice(-1500) : '',
          suffix: suffix ? suffix.slice(0, 500) : '',
          max_tokens: 64,
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(3000)
      });

      if (fimRes.ok) {
        const json = await fimRes.json();
        const rawText = json.choices?.[0]?.text;
        if (rawText && typeof rawText === 'string') {
          const cleaned = cleanCopilotCompletion(rawText, prefix);
          if (cleaned.trim()) {
            if (copilotCache.size > 200) {
              const firstKey = copilotCache.keys().next().value;
              copilotCache.delete(firstKey);
            }
            copilotCache.set(cacheKey, cleaned);
            console.log(`[AI Copilot] deepseek-fim (${language}) => ${JSON.stringify(cleaned)}`);
            return res.json({ completion: cleaned, model: 'deepseek-chat' });
          }
        }
      }
    } catch (e) {
      console.warn(`[AI Copilot] DeepSeek FIM fallback: ${e.message}`);
    }
  }

  // 2. Secondary AI Engine: Google Gemini Flash with multi-model fallback
  if (geminiApiKey) {
    const models = [
      'gemini-3.1-flash-lite',
      'gemini-flash-latest'
    ];

  const prompt = `You are GitHub Copilot inline code completion engine.
Output ONLY the raw code continuation that immediately follows the cursor.
NEVER explain. NEVER use markdown fences. DO NOT repeat the code before cursor.
Language: ${language || 'plaintext'}
File: ${filename || 'code'}

Context:
${prefix ? prefix.slice(-1000) : ''}<CURSOR>${suffix ? suffix.slice(0, 300) : ''}

Raw continuation at <CURSOR>:`;

  for (const model of models) {
      try {
        const body = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 48,
            temperature: 0.1
          }
        });

        const sendRequest = () => {
          return new Promise((resolve) => {
            const httpsReq = https.request({
              hostname: 'generativelanguage.googleapis.com',
              path: `/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
              },
              timeout: 1800
            }, (apiRes) => {
              let d = '';
              apiRes.on('data', chunk => d += chunk);
              apiRes.on('end', () => resolve({ statusCode: apiRes.statusCode, data: d }));
            });

            httpsReq.on('error', (err) => resolve({ statusCode: 500, error: err.message }));
            httpsReq.on('timeout', () => {
              httpsReq.destroy();
              resolve({ statusCode: 504, timeout: true });
            });

            httpsReq.write(body);
            httpsReq.end();
          });
        };

        const result = await sendRequest();
        if (result.statusCode === 429) {
          // Free tier quota exhausted, break immediately to local fallback
          break;
        }

        if (result.statusCode === 200 && result.data) {
          const json = JSON.parse(result.data);
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText && typeof rawText === 'string') {
            const cleaned = cleanCopilotCompletion(rawText, prefix);
            if (cleaned.trim()) {
              if (copilotCache.size > 200) {
                const firstKey = copilotCache.keys().next().value;
                copilotCache.delete(firstKey);
              }
              copilotCache.set(cacheKey, cleaned);
              console.log(`[AI Copilot] ${model} (${language}) => ${JSON.stringify(cleaned)}`);
              return res.json({ completion: cleaned, model });
            }
          }
        }
      } catch {}
    }
  }

  // 3. Intelligent Local Semantic Fallback (0ms, 100% reliable)
  const localFallback = generateLocalSemanticFallback(prefix, suffix, language, filename);
  if (localFallback && localFallback.trim()) {
    if (copilotCache.size > 200) {
      const firstKey = copilotCache.keys().next().value;
      copilotCache.delete(firstKey);
    }
    copilotCache.set(cacheKey, localFallback);
    console.log(`[AI Copilot Fallback] (${language}) => ${JSON.stringify(localFallback)}`);
    return res.json({ completion: localFallback, model: 'local-semantic' });
  }

  res.json({ completion: '' });
});

// Dedicated Conversational AI Agent endpoint (with automatic model fallback)
app.post('/api/ai/chat', async (req, res) => {
  const { messages, context, apiKey: customKey, provider } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const deepseekApiKey = req.body.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
  const geminiApiKey = customKey || process.env.GEMINI_API_KEY;

  if (!deepseekApiKey && !geminiApiKey) {
    return res.status(401).json({ error: 'No AI API Key configured. Please set DEEPSEEK_API_KEY or GEMINI_API_KEY in .env.' });
  }

  let systemPrompt = 'You are Aura AI, an expert programming assistant built directly into Aura IDE. You write concise, high-performance, and correct code. When asked in Russian, respond in clean natural Russian. Format code blocks with appropriate language tags. STRICT RULE: NEVER use any emojis or emoji symbols in any part of your response. Use standard markdown bold, lists, and code blocks.';
  if (context && context.code) {
    systemPrompt += `\n\nActive File: ${context.filename || 'code'} (${context.language || 'plaintext'})\n\`\`\`${context.language || ''}\n${context.code.slice(0, 4000)}\n\`\`\``;
  }

  const callDeepSeek = async () => {
    if (!deepseekApiKey) return null;
    try {
      const dsMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      ];

      const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: dsMessages,
          max_tokens: 2048,
          temperature: 0.3
        }),
        signal: AbortSignal.timeout(25000)
      });

      if (dsRes.ok) {
        const json = await dsRes.json();
        let replyText = json.choices?.[0]?.message?.content;
        if (replyText) {
          replyText = replyText.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
          return { reply: replyText, model: 'deepseek-chat' };
        }
      }
    } catch (e) {
      console.warn(`[AI Chat] DeepSeek chat error: ${e.message}`);
    }
    return null;
  };

  const callGemini = async () => {
    if (!geminiApiKey) return null;
    const chatModels = [
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemini-3.8-flash'
    ];

    const geminiContents = messages.map((m, idx) => {
      let text = m.content;
      if (idx === 0 && systemPrompt) {
        text = `[Instructions & Context]\n${systemPrompt}\n\n[User Request]\n${text}`;
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }]
      };
    });

    for (const model of chatModels) {
      try {
        const sendRequest = () => {
          return new Promise((resolve) => {
            const body = JSON.stringify({
              contents: geminiContents,
              generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.4
              }
            });

            const httpsReq = https.request({
              hostname: 'generativelanguage.googleapis.com',
              path: `/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
              },
              timeout: 15000
            }, (apiRes) => {
              let d = '';
              apiRes.on('data', chunk => d += chunk);
              apiRes.on('end', () => resolve({ statusCode: apiRes.statusCode, data: d }));
            });

            httpsReq.on('error', (err) => resolve({ statusCode: 500, error: err.message }));
            httpsReq.on('timeout', () => {
              httpsReq.destroy();
              resolve({ statusCode: 504, timeout: true });
            });

            httpsReq.write(body);
            httpsReq.end();
          });
        };

        const result = await sendRequest();
        if (result.statusCode === 200 && result.data) {
          const json = JSON.parse(result.data);
          let replyText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            replyText = replyText.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
            return { reply: replyText, model };
          }
        }
      } catch {}
    }
    return null;
  };

  if (provider === 'gemini') {
    const resGemini = await callGemini();
    if (resGemini) return res.json(resGemini);
    const resDeepSeek = await callDeepSeek();
    if (resDeepSeek) return res.json(resDeepSeek);
  } else {
    const resDeepSeek = await callDeepSeek();
    if (resDeepSeek) return res.json(resDeepSeek);
    const resGemini = await callGemini();
    if (resGemini) return res.json(resGemini);
  }

  res.status(500).json({ error: 'Failed to generate response from AI models' });
});

// Helper for finding executable paths on system
function findSystemBinaries(names) {
  const isWin = process.platform === 'win32';
  const found = [];
  for (const name of names) {
    try {
      const cmd = isWin ? `where.exe ${name}` : `which ${name}`;
      const { stdout } = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const paths = stdout.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
      for (const p of paths) {
        if (!found.includes(p)) found.push(p);
      }
    } catch {}
  }
  return found;
}

// 7. Universal Compilers & Interpreters Discovery API
app.get('/api/compilers', async (req, res) => {
  try {
    const isWin = process.platform === 'win32';

    // 1. Python (venvs + globals)
    const pythonList = [];
    const possibleVenvDirs = ['.venv', 'venv', 'env', '.env'];
    for (const dirName of possibleVenvDirs) {
      const venvPath = path.join(currentWorkspace, dirName);
      const pythonExe = isWin ? path.join(venvPath, 'Scripts', 'python.exe') : path.join(venvPath, 'bin', 'python');
      try {
        await fs.access(pythonExe);
        pythonList.push({
          id: `venv-${dirName}`,
          name: `Python (${dirName})`,
          path: pythonExe,
          isVenv: true,
          type: 'interpreter'
        });
      } catch {}
    }
    const sysPythons = findSystemBinaries(['python', 'python3']);
    for (const pyPath of sysPythons) {
      const matchVer = pyPath.match(/Python(\d+)/i);
      const label = matchVer ? `Python ${matchVer[1]} (Global)` : 'Python (System PATH)';
      pythonList.push({
        id: `sys-${pyPath}`,
        name: label,
        path: pyPath,
        isVenv: false,
        type: 'interpreter'
      });
    }
    if (pythonList.length === 0) {
      pythonList.push({ id: 'py-default', name: 'python', path: 'python', isVenv: false, type: 'interpreter' });
    }

    // 2. Rust (cargo + rustc)
    const rustList = [];
    const cargos = findSystemBinaries(['cargo']);
    if (cargos.length > 0) {
      rustList.push({ id: 'cargo', name: 'Cargo (cargo run)', path: cargos[0], isCargo: true, type: 'builder' });
    } else {
      rustList.push({ id: 'cargo', name: 'Cargo (cargo run)', path: 'cargo', isCargo: true, type: 'builder' });
    }
    const rustcs = findSystemBinaries(['rustc']);
    if (rustcs.length > 0) {
      rustList.push({ id: 'rustc', name: 'Rust Compiler (rustc)', path: rustcs[0], isCargo: false, type: 'compiler' });
    }

    // 3. C / C++ (gcc, g++, clang, clang++, cl)
    const cppList = [];
    const gccs = findSystemBinaries(['gcc', 'g++', 'clang', 'clang++', 'cl']);
    for (const bin of gccs) {
      const base = path.basename(bin).toLowerCase();
      let label = base;
      if (base.includes('g++')) label = 'G++ C++ Compiler';
      else if (base.includes('gcc')) label = 'GCC C/C++ Compiler';
      else if (base.includes('clang++')) label = 'Clang++ C++ Compiler';
      else if (base.includes('clang')) label = 'Clang C Compiler';
      else if (base.includes('cl')) label = 'MSVC Compiler (cl.exe)';
      cppList.push({ id: `cpp-${bin}`, name: `${label} (${bin})`, path: bin, type: 'compiler' });
    }
    if (cppList.length === 0) {
      cppList.push({ id: 'gcc-default', name: 'GCC (System)', path: 'gcc', type: 'compiler' });
      cppList.push({ id: 'gpp-default', name: 'G++ (System)', path: 'g++', type: 'compiler' });
    }

    // 4. Go
    const goList = [];
    const gos = findSystemBinaries(['go']);
    if (gos.length > 0) {
      goList.push({ id: 'go', name: 'Go Runtime (go run)', path: gos[0], type: 'interpreter' });
    } else {
      goList.push({ id: 'go', name: 'Go (go run)', path: 'go', type: 'interpreter' });
    }

    // 5. JavaScript / TypeScript (node, bun, deno)
    const jsList = [];
    const nodes = findSystemBinaries(['node']);
    if (nodes.length > 0) {
      jsList.push({ id: 'node', name: 'Node.js Runtime', path: nodes[0], type: 'interpreter' });
    } else {
      jsList.push({ id: 'node', name: 'Node.js', path: 'node', type: 'interpreter' });
    }
    const buns = findSystemBinaries(['bun']);
    if (buns.length > 0) {
      jsList.push({ id: 'bun', name: 'Bun Runtime', path: buns[0], type: 'interpreter' });
    }
    const denos = findSystemBinaries(['deno']);
    if (denos.length > 0) {
      jsList.push({ id: 'deno', name: 'Deno Runtime', path: denos[0], type: 'interpreter' });
    }

    // 6. C# / .NET
    const csList = [];
    const dotnets = findSystemBinaries(['dotnet']);
    if (dotnets.length > 0) {
      csList.push({ id: 'dotnet', name: '.NET SDK (dotnet run)', path: dotnets[0], type: 'builder' });
    } else {
      csList.push({ id: 'dotnet', name: '.NET (dotnet run)', path: 'dotnet', type: 'builder' });
    }

    res.json({
      compilers: {
        python: pythonList,
        rust: rustList,
        c: cppList,
        cpp: cppList,
        go: goList,
        javascript: jsList,
        typescript: jsList,
        csharp: csList
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/python/create-venv', async (req, res) => {
  const { name = '.venv' } = req.body;
  if (typeof name !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(name.trim())) {
    return res.status(400).json({ error: 'Invalid venv folder name. Only alphanumeric characters, dots, and hyphens allowed.' });
  }
  const cleanName = name.trim();
  const targetDir = path.resolve(currentWorkspace, cleanName);

  // Guard against escaping workspace
  const normTarget = targetDir.toLowerCase();
  const normWs = path.resolve(currentWorkspace).toLowerCase();
  const rel = path.relative(normWs, normTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return res.status(400).json({ error: 'Venv must be created inside workspace' });
  }

  try {
    // Run python -m venv <cleanName> safely using execFileAsync without shell
    await execFileAsync('python', ['-m', 'venv', targetDir], { cwd: currentWorkspace });
    const pythonExe = process.platform === 'win32'
      ? path.join(targetDir, 'Scripts', 'python.exe')
      : path.join(targetDir, 'bin', 'python');

    res.json({
      success: true,
      path: pythonExe,
      name: cleanName,
      folder: targetDir
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rust/status', async (req, res) => {
  try {
    const cargoTomlPath = path.join(currentWorkspace, 'Cargo.toml');
    let hasCargo = false;
    let packageName = '';
    try {
      await fs.access(cargoTomlPath);
      hasCargo = true;
      const content = await fs.readFile(cargoTomlPath, 'utf-8');
      const match = content.match(/name\s*=\s*"([^"]+)"/);
      if (match) packageName = match[1];
    } catch {}

    let cargoVersion = '';
    let rustcVersion = '';
    try {
      const { stdout: cOut } = await execAsync('cargo --version');
      cargoVersion = cOut.trim();
    } catch {}

    try {
      const { stdout: rOut } = await execAsync('rustc --version');
      rustcVersion = rOut.trim();
    } catch {}

    res.json({
      hasCargo,
      packageName,
      cargoVersion,
      rustcVersion
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. AST & Workspace Code Symbols Parser Engine (Language-Aware)
let workspaceSymbols = [];
let lastSymbolsScan = 0;

async function scanWorkspaceSymbols() {
  const symbols = [];
  async function walk(dir, depth = 0) {
    if (depth > 6) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (['node_modules', '.git', 'dist', 'build', '.venv', '__pycache__', 'target', '.idea', '.vscode'].includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(currentWorkspace, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          symbols.push({
            name: entry.name,
            kind: 'folder',
            file: relPath,
            detail: `Directory (${relPath})`,
            insertText: entry.name
          });
          await walk(fullPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          const baseName = path.basename(entry.name, ext);
          
          let fileLang = '';
          if (ext === '.py') fileLang = 'python';
          else if (['.ts', '.tsx'].includes(ext)) fileLang = 'typescript';
          else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) fileLang = 'javascript';
          else if (ext === '.rs') fileLang = 'rust';
          else if (ext === '.go') fileLang = 'go';
          else if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext)) fileLang = 'cpp';

          // Every file is an importable module within its language
          if (fileLang) {
            symbols.push({
              name: baseName,
              kind: 'module',
              lang: fileLang,
              file: relPath,
              detail: `${fileLang.toUpperCase()} Module ${baseName} (${relPath})`,
              insertText: baseName
            });
          }

          // Deep parse symbols for Python, JS/TS, Rust, Go, C/C++
          if (fileLang) {
            try {
              const stat = await fs.stat(fullPath);
              if (stat.size < 500000) {
                const code = await fs.readFile(fullPath, 'utf-8');
                const lines = code.split('\n');

                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  const lineNum = i + 1;

                  // Python AST-like extraction
                  if (fileLang === 'python') {
                    const fnMatch = line.match(/^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
                    if (fnMatch) {
                      symbols.push({
                        name: fnMatch[1],
                        kind: 'function',
                        lang: 'python',
                        file: relPath,
                        line: lineNum,
                        detail: `def ${fnMatch[1]}(${fnMatch[2].trim()})`,
                        insertText: `${fnMatch[1]}($0)`
                      });
                    }
                    const classMatch = line.match(/^\s*class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/);
                    if (classMatch) {
                      symbols.push({
                        name: classMatch[1],
                        kind: 'class',
                        lang: 'python',
                        file: relPath,
                        line: lineNum,
                        detail: `class ${classMatch[1]}${classMatch[2] ? `(${classMatch[2]})` : ''}`,
                        insertText: classMatch[1]
                      });
                    }
                    const constMatch = line.match(/^([A-Z0-9_]{2,})\s*=/);
                    if (constMatch) {
                      symbols.push({
                        name: constMatch[1],
                        kind: 'variable',
                        lang: 'python',
                        file: relPath,
                        line: lineNum,
                        detail: `constant ${constMatch[1]}`,
                        insertText: constMatch[1]
                      });
                    }
                  }

                  // JS/TS functions, classes, types, interfaces
                  if (fileLang === 'typescript' || fileLang === 'javascript') {
                    const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
                    if (fnMatch) {
                      symbols.push({
                        name: fnMatch[1],
                        kind: 'function',
                        lang: fileLang,
                        file: relPath,
                        line: lineNum,
                        detail: `function ${fnMatch[1]}(${fnMatch[2].trim()})`,
                        insertText: `${fnMatch[1]}($0)`
                      });
                    }
                    const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
                    if (classMatch) {
                      symbols.push({
                        name: classMatch[1],
                        kind: 'class',
                        lang: fileLang,
                        file: relPath,
                        line: lineNum,
                        detail: `class ${classMatch[1]}`,
                        insertText: classMatch[1]
                      });
                    }
                    const constMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/);
                    if (constMatch) {
                      symbols.push({
                        name: constMatch[1],
                        kind: 'variable',
                        lang: fileLang,
                        file: relPath,
                        line: lineNum,
                        detail: `const ${constMatch[1]}`,
                        insertText: constMatch[1]
                      });
                    }
                    const ifaceMatch = line.match(/(?:export\s+)?(?:interface|type)\s+([a-zA-Z0-9_$]+)/);
                    if (ifaceMatch) {
                      symbols.push({
                        name: ifaceMatch[1],
                        kind: 'interface',
                        lang: fileLang,
                        file: relPath,
                        line: lineNum,
                        detail: `interface ${ifaceMatch[1]}`,
                        insertText: ifaceMatch[1]
                      });
                    }
                  }

                  // Rust fn, struct, enum, trait
                  if (fileLang === 'rust') {
                    const fnMatch = line.match(/(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/);
                    if (fnMatch) {
                      symbols.push({
                        name: fnMatch[1],
                        kind: 'function',
                        lang: 'rust',
                        file: relPath,
                        line: lineNum,
                        detail: `fn ${fnMatch[1]}(${fnMatch[2].trim()})`,
                        insertText: `${fnMatch[1]}($0)`
                      });
                    }
                    const structMatch = line.match(/(?:pub(?:\([^)]+\))?\s+)?struct\s+([a-zA-Z0-9_]+)/);
                    if (structMatch) {
                      symbols.push({
                        name: structMatch[1],
                        kind: 'struct',
                        lang: 'rust',
                        file: relPath,
                        line: lineNum,
                        detail: `struct ${structMatch[1]}`,
                        insertText: structMatch[1]
                      });
                    }
                    const enumMatch = line.match(/(?:pub(?:\([^)]+\))?\s+)?enum\s+([a-zA-Z0-9_]+)/);
                    if (enumMatch) {
                      symbols.push({
                        name: enumMatch[1],
                        kind: 'class',
                        lang: 'rust',
                        file: relPath,
                        line: lineNum,
                        detail: `enum ${enumMatch[1]}`,
                        insertText: enumMatch[1]
                      });
                    }
                  }

                  // Go functions, types
                  if (fileLang === 'go') {
                    const fnMatch = line.match(/func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
                    if (fnMatch) {
                      symbols.push({
                        name: fnMatch[1],
                        kind: 'function',
                        lang: 'go',
                        file: relPath,
                        line: lineNum,
                        detail: `func ${fnMatch[1]}`,
                        insertText: `${fnMatch[1]}($0)`
                      });
                    }
                    const typeMatch = line.match(/type\s+([a-zA-Z0-9_]+)\s+(?:struct|interface)/);
                    if (typeMatch) {
                      symbols.push({
                        name: typeMatch[1],
                        kind: 'struct',
                        lang: 'go',
                        file: relPath,
                        line: lineNum,
                        detail: `type ${typeMatch[1]}`,
                        insertText: typeMatch[1]
                      });
                    }
                  }

                  // C/C++ functions, classes, structs
                  if (fileLang === 'cpp') {
                    const fnMatch = line.match(/(?:inline\s+|virtual\s+|static\s+)?(?:[a-zA-Z0-9_<>:*&]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:const)?\s*[{;]/);
                    if (fnMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(fnMatch[1])) {
                      symbols.push({
                        name: fnMatch[1],
                        kind: 'function',
                        lang: 'cpp',
                        file: relPath,
                        line: lineNum,
                        detail: `${fnMatch[1]}(${fnMatch[2].trim()})`,
                        insertText: `${fnMatch[1]}($0)`
                      });
                    }
                    const classMatch = line.match(/(?:class|struct)\s+([a-zA-Z0-9_]+)/);
                    if (classMatch) {
                      symbols.push({
                        name: classMatch[1],
                        kind: 'class',
                        lang: 'cpp',
                        file: relPath,
                        line: lineNum,
                        detail: `class ${classMatch[1]}`,
                        insertText: classMatch[1]
                      });
                    }
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  await walk(currentWorkspace);
  workspaceSymbols = symbols;
  lastSymbolsScan = Date.now();
  return symbols;
}

app.get('/api/symbols', async (req, res) => {
  if (Date.now() - lastSymbolsScan > 5000 || workspaceSymbols.length === 0) {
    await scanWorkspaceSymbols();
  }
  const lang = req.query.lang;
  const filtered = lang ? workspaceSymbols.filter(s => s.lang === lang || (!s.lang && s.kind === 'folder')) : workspaceSymbols;
  res.json({ count: filtered.length, symbols: filtered });
});

// Helper to get candidate Python executables in priority order
function getCandidatePythons(preferredEnv) {
  const candidates = [];
  if (preferredEnv && fsSync.existsSync(preferredEnv)) {
    candidates.push(preferredEnv);
  }
  const venvPyWin = path.join(currentWorkspace, '.venv', 'Scripts', 'python.exe');
  const venvPyNix = path.join(currentWorkspace, '.venv', 'bin', 'python');
  if (fsSync.existsSync(venvPyWin)) candidates.push(venvPyWin);
  else if (fsSync.existsSync(venvPyNix)) candidates.push(venvPyNix);
  
  // System python
  candidates.push('python');
  if (process.platform === 'win32') {
    candidates.push('py');
  } else {
    candidates.push('python3');
  }
  return Array.from(new Set(candidates));
}

function runPythonScript(pyExe, script, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let cp;
    try {
      cp = spawn(pyExe, ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return reject(e);
    }
    let stdout = '';
    let stderr = '';
    let isDone = false;
    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        try { cp.kill(); } catch {}
        reject(new Error('Timeout'));
      }
    }, timeoutMs);

    cp.stdout.on('data', d => stdout += d.toString());
    cp.stderr.on('data', d => stderr += d.toString());
    cp.on('close', code => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`Exit ${code}: ${stderr}`));
    });
    cp.on('error', err => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timer);
      reject(err);
    });
    try {
      cp.stdin.write(script);
      cp.stdin.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Cached module lists for autocomplete
let cachedPyModules = [];
let lastPyModulesScan = 0;

app.get('/api/python/modules', async (req, res) => {
  if (Date.now() - lastPyModulesScan < 60000 && cachedPyModules.length > 0) {
    return res.json({ modules: cachedPyModules });
  }

  const stdBuiltins = [
    'aiogram', 'math', 'sys', 'os', 'json', 'datetime', 're', 'asyncio', 'itertools',
    'collections', 'pathlib', 'random', 'subprocess', 'threading', 'time', 'typing',
    'copy', 'functools', 'hashlib', 'logging', 'shutil', 'tempfile', 'urllib', 'xml',
    'requests', 'numpy', 'pandas', 'torch', 'scipy', 'fastapi', 'pydantic', 'flask',
    'pytest', 'socket', 'sqlite3', 'struct', 'traceback', 'uuid', 'zipfile', 'csv',
    'http', 'io', 'multiprocessing', 'platform', 'queue', 'select', 'signal', 'ssl'
  ];

  const pyScript = `import sys, pkgutil, json
pkgs = list(sys.builtin_module_names)
try:
    for m in pkgutil.iter_modules():
        if not m.name.startswith('_'):
            pkgs.append(m.name)
except: pass
print(json.dumps(list(set(pkgs))))`;

  let found = [...stdBuiltins];
  const candidates = getCandidatePythons(req.query.env);
  for (const py of candidates) {
    try {
      const stdout = await runPythonScript(py, pyScript, 3000);
      const parsed = JSON.parse(stdout.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        found = Array.from(new Set([...found, ...parsed]));
        break;
      }
    } catch {}
  }

  // Also include any .py files in current workspace root as top-level modules
  try {
    const files = await fs.readdir(currentWorkspace);
    for (const f of files) {
      if (f.endsWith('.py') && f !== '__init__.py') {
        found.push(path.basename(f, '.py'));
      }
    }
  } catch {}

  cachedPyModules = Array.from(new Set(found)).sort();
  lastPyModulesScan = Date.now();
  res.json({ modules: cachedPyModules });
});

// Dynamic Python Library Introspection (supporting aiogram, requests, numpy, math, workspace files, etc.)
const pyModuleCache = new Map();

app.get('/api/python/introspect', async (req, res) => {
  const modName = req.query.module;
  if (!modName || typeof modName !== 'string' || !/^[a-zA-Z0-9_.]+$/.test(modName)) {
    return res.status(400).json({ error: 'Valid module name required' });
  }

  if (pyModuleCache.has(modName)) {
    return res.json({ module: modName, symbols: pyModuleCache.get(modName) });
  }

  const safeWs = currentWorkspace.replace(/\\/g, '/');
  const pyScript = `import importlib, inspect, json, sys, os, pkgutil
mod_name = "${modName}"
ws_path = "${safeWs}"
if ws_path not in sys.path:
    sys.path.insert(0, ws_path)

mod = None
try:
    mod = importlib.import_module(mod_name)
except Exception as e:
    sys.exit(1)

items = []
seen = set()

raw_all = getattr(mod, "__all__", None)
if raw_all and isinstance(raw_all, (list, tuple)):
    for name in raw_all:
        if not isinstance(name, str) or name in seen or name.startswith("_"): continue
        seen.add(name)
        try:
            v = getattr(mod, name)
            kind = "class" if inspect.isclass(v) else ("function" if callable(v) else ("module" if inspect.ismodule(v) else "variable"))
            doc_str = getattr(v, "__doc__", "") or ""
            doc = (doc_str if isinstance(doc_str, str) else "")[:120].strip()
            items.append({"name": name, "kind": kind, "doc": doc, "sig": ""})
        except:
            items.append({"name": name, "kind": "variable", "doc": "", "sig": ""})

for name in dir(mod):
    if name in seen or name.startswith("_"): continue
    seen.add(name)
    try:
        v = getattr(mod, name)
        kind = "class" if inspect.isclass(v) else ("function" if callable(v) else ("module" if inspect.ismodule(v) else "variable"))
        doc_str = getattr(v, "__doc__", "") or ""
        doc = (doc_str if isinstance(doc_str, str) else "")[:120].strip()
        items.append({"name": name, "kind": kind, "doc": doc, "sig": ""})
    except:
        items.append({"name": name, "kind": "variable", "doc": "", "sig": ""})

if hasattr(mod, "__path__"):
    try:
        for sub in pkgutil.iter_modules(mod.__path__):
            if sub.name not in seen and not sub.name.startswith("_"):
                seen.add(sub.name)
                items.append({"name": sub.name, "kind": "module", "doc": f"Submodule {mod_name}.{sub.name}", "sig": ""})
    except:
        pass

print(json.dumps(items))
`;

  const candidates = getCandidatePythons(req.query.env);
  let symbols = [];
  let succeeded = false;

  for (const py of candidates) {
    try {
      const stdout = await runPythonScript(py, pyScript, 10000);
      const parsed = JSON.parse(stdout.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        symbols = parsed;
        succeeded = true;
        break;
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  // Fallback: If module is a workspace file (e.g. test_python) and failed to import
  if (!succeeded) {
    const localPyFile = path.join(currentWorkspace, `${modName}.py`);
    if (fsSync.existsSync(localPyFile)) {
      try {
        const content = await fs.readFile(localPyFile, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const fn = line.match(/^def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
          if (fn) symbols.push({ name: fn[1], kind: 'function', doc: `def ${fn[1]}(${fn[2]})`, sig: `(${fn[2]})` });
          const cl = line.match(/^class\s+([a-zA-Z0-9_]+)/);
          if (cl) symbols.push({ name: cl[1], kind: 'class', doc: `class ${cl[1]}`, sig: '' });
          const va = line.match(/^([A-Za-z0-9_]+)\s*=/);
          if (va && !symbols.some(s => s.name === va[1])) symbols.push({ name: va[1], kind: 'variable', doc: '', sig: '' });
        }
        succeeded = symbols.length > 0;
      } catch {}
    }
  }

  if (succeeded) {
    pyModuleCache.set(modName, symbols);
  }
  res.json({ module: modName, symbols });
});

// Universal Multi-Language Introspection API
app.get('/api/introspect', async (req, res) => {
  const lang = req.query.lang || 'python';
  const modName = req.query.module;
  if (!modName || typeof modName !== 'string') {
    return res.status(400).json({ error: 'Module name required' });
  }

  if (lang === 'python') {
    return res.redirect(`/api/python/introspect?module=${encodeURIComponent(modName)}`);
  }

  // JavaScript / TypeScript introspection
  if (lang === 'javascript' || lang === 'typescript') {
    // If local relative file
    if (modName.startsWith('.')) {
      const targetPath = resolveSafePath(modName.endsWith('.ts') || modName.endsWith('.js') || modName.endsWith('.tsx') ? modName : `${modName}.ts`);
      let filePath = targetPath;
      if (!fsSync.existsSync(filePath)) filePath = `${targetPath}.tsx`;
      if (!fsSync.existsSync(filePath)) filePath = `${targetPath}.js`;
      if (fsSync.existsSync(filePath)) {
        try {
          const code = await fs.readFile(filePath, 'utf-8');
          const exports = [];
          const matches = code.matchAll(/export\s+(?:const|function|class|type|interface|let)\s+([a-zA-Z0-9_$]+)/g);
          for (const m of matches) {
            exports.push({ name: m[1], kind: 'property', detail: `Exported from ${modName}` });
          }
          return res.json({ module: modName, symbols: exports });
        } catch {}
      }
    }
    // Check node_modules
    const pkgDir = path.join(currentWorkspace, 'node_modules', modName);
    let dtsPath = null;
    if (fsSync.existsSync(pkgDir)) {
      try {
        const pkgJson = JSON.parse(await fs.readFile(path.join(pkgDir, 'package.json'), 'utf-8'));
        const typingsFile = pkgJson.typings || pkgJson.types;
        if (typingsFile) {
          dtsPath = path.join(pkgDir, typingsFile);
        } else if (pkgJson.exports && pkgJson.exports['.']) {
          const expTypes = typeof pkgJson.exports['.'] === 'object' ? pkgJson.exports['.'].types : null;
          if (expTypes) dtsPath = path.join(pkgDir, expTypes);
        }
      } catch {}
    }
    if (!dtsPath || !fsSync.existsSync(dtsPath)) {
      const typesPkg = path.join(currentWorkspace, 'node_modules', '@types', modName, 'index.d.ts');
      if (fsSync.existsSync(typesPkg)) {
        dtsPath = typesPkg;
      }
    }
    if (dtsPath && fsSync.existsSync(dtsPath)) {
      try {
        const dts = await fs.readFile(dtsPath, 'utf-8');
        const exports = [];
        const seen = new Set();
        // 1. Direct export / declare statements
        const matches = dts.matchAll(/(?:export\s+)?(?:declare\s+)?(?:const|function|class|type|interface|var|let)\s+([a-zA-Z0-9_$]+)/g);
        for (const m of matches) {
          const name = m[1];
          if (!seen.has(name)) {
            seen.add(name);
            exports.push({ name, kind: 'property', detail: `Package ${modName}` });
            if (exports.length >= 600) break;
          }
        }
        // 2. export { ... } blocks
        if (exports.length < 600) {
          const exportBlockMatches = dts.matchAll(/export\s*\{([^}]+)\}/g);
          for (const block of exportBlockMatches) {
            const names = block[1].split(',').map(s => {
              const parts = s.trim().split(/\s+as\s+/);
              return parts[parts.length - 1].trim();
            }).filter(Boolean);
            for (const n of names) {
              if (/^[a-zA-Z0-9_$]+$/.test(n) && !seen.has(n)) {
                seen.add(n);
                exports.push({ name: n, kind: 'property', detail: `Package ${modName}` });
                if (exports.length >= 600) break;
              }
            }
            if (exports.length >= 600) break;
          }
        }
        if (exports.length > 0) return res.json({ module: modName, symbols: exports });
      } catch {}
    }
    return res.json({ module: modName, symbols: [] });
  }

  // Rust std & crates
  if (lang === 'rust') {
    const rustStd = {
      'std::io': ['stdin', 'stdout', 'stderr', 'BufReader', 'BufWriter', 'Read', 'Write', 'Result', 'Error', 'copy'],
      'std::fs': ['read_to_string', 'write', 'File', 'OpenOptions', 'create_dir_all', 'remove_file', 'rename', 'metadata'],
      'std::collections': ['HashMap', 'HashSet', 'BTreeMap', 'BTreeSet', 'VecDeque', 'BinaryHeap', 'LinkedList'],
      'std::path': ['Path', 'PathBuf'],
      'std::sync': ['Arc', 'Mutex', 'RwLock', 'Barrier', 'Once', 'mpsc'],
      'std::thread': ['spawn', 'sleep', 'current', 'park', 'JoinHandle'],
      'std::time': ['Duration', 'Instant', 'SystemTime'],
      'std::env': ['var', 'args', 'current_dir', 'set_var'],
    };
    if (rustStd[modName]) {
      return res.json({
        module: modName,
        symbols: rustStd[modName].map(name => ({ name, kind: 'function', detail: `${modName}::${name}` }))
      });
    }
    return res.json({ module: modName, symbols: [] });
  }

  // Go std packages
  if (lang === 'go') {
    const goStd = {
      'fmt': [
        { name: 'Println', kind: 'function', sig: '(a ...any) (n int, err error)' },
        { name: 'Printf', kind: 'function', sig: '(format string, a ...any) (n int, err error)' },
        { name: 'Sprintf', kind: 'function', sig: '(format string, a ...any) string' },
        { name: 'Errorf', kind: 'function', sig: '(format string, a ...any) error' },
        { name: 'Scanln', kind: 'function', sig: '(a ...any) (n int, err error)' },
        { name: 'Print', kind: 'function', sig: '(a ...any) (n int, err error)' }
      ],
      'os': [
        { name: 'Open', kind: 'function', sig: '(name string) (*File, error)' },
        { name: 'Create', kind: 'function', sig: '(name string) (*File, error)' },
        { name: 'ReadFile', kind: 'function', sig: '(name string) ([]byte, error)' },
        { name: 'WriteFile', kind: 'function', sig: '(name string, data []byte, perm FileMode) error' },
        { name: 'Getenv', kind: 'function', sig: '(key string) string' },
        { name: 'Setenv', kind: 'function', sig: '(key, value string) error' },
        { name: 'Exit', kind: 'function', sig: '(code int)' },
        { name: 'Args', kind: 'variable', sig: '[]string' }
      ],
      'strings': [
        { name: 'Contains', kind: 'function', sig: '(s, substr string) bool' },
        { name: 'Split', kind: 'function', sig: '(s, sep string) []string' },
        { name: 'Join', kind: 'function', sig: '(elems []string, sep string) string' },
        { name: 'HasPrefix', kind: 'function', sig: '(s, prefix string) bool' },
        { name: 'HasSuffix', kind: 'function', sig: '(s, suffix string) bool' },
        { name: 'ReplaceAll', kind: 'function', sig: '(s, old, new string) string' },
        { name: 'TrimSpace', kind: 'function', sig: '(s string) string' },
        { name: 'ToLower', kind: 'function', sig: '(s string) string' },
        { name: 'ToUpper', kind: 'function', sig: '(s string) string' }
      ],
      'net/http': [
        { name: 'Get', kind: 'function', sig: '(url string) (*Response, error)' },
        { name: 'Post', kind: 'function', sig: '(url, contentType string, body io.Reader) (*Response, error)' },
        { name: 'NewRequest', kind: 'function', sig: '(method, url string, body io.Reader) (*Request, error)' },
        { name: 'ListenAndServe', kind: 'function', sig: '(addr string, handler Handler) error' },
        { name: 'HandleFunc', kind: 'function', sig: '(pattern string, handler func(ResponseWriter, *Request))' }
      ]
    };
    if (goStd[modName]) {
      return res.json({ module: modName, symbols: goStd[modName] });
    }
    return res.json({ module: modName, symbols: [] });
  }

  res.json({ module: modName, symbols: [] });
});

// 9. CORS & Frame-Unblocking Web Proxy for Universal Web Preview
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target || typeof target !== 'string' || (!target.startsWith('http://') && !target.startsWith('https://'))) {
    return res.status(400).send('Valid URL required');
  }

  try {
    const upstreamRes = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    const contentType = upstreamRes.headers.get('content-type') || 'text/html; charset=utf-8';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', contentType);
    // Explicitly strip frame-blocking headers
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    if (contentType.includes('text/html')) {
      let html = await upstreamRes.text();
      // Inject base tag so relative links and assets resolve to original domain
      try {
        const baseTag = `<base href="${new URL(target).origin}/">`;
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>${baseTag}`);
        } else {
          html = `${baseTag}${html}`;
        }
      } catch {}
      res.send(html);
    } else {
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      res.send(buffer);
    }
  } catch (err) {
    res.status(502).send(`<html><body style="background:#18181a;color:#eee;font-family:sans-serif;padding:30px;text-align:center;"><h3>Failed to load URL</h3><p style="color:#aaa;">${err.message}</p></body></html>`);
  }
});

// 7. Live Web Preview API (Real HTTP server for workspace HTML/JS/CSS)
app.use('/preview', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  
  // Dynamically serve static files from the active currentWorkspace
  express.static(currentWorkspace, {
    index: ['index.html', 'index.htm', 'default.html'],
    dotfiles: 'ignore',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
    }
  })(req, res, next);
});

// Fallback for directory preview without trailing slash or specific files
app.get('/preview', (req, res) => {
  const indexFile = path.join(currentWorkspace, 'index.html');
  if (fsSync.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.send('<html><body style="font-family:sans-serif;background:#18181a;color:#ccc;padding:40px;text-align:center;"><h2>No index.html found in workspace root</h2><p>Create an index.html or select an HTML file to preview.</p></body></html>');
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Server uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server unhandledRejection]', reason);
});

// 8. Interactive Terminal via WebSocket with native node-pty
wss.on('connection', (ws) => {
  console.log('[Terminal] Client connected');
  const isWindows = process.platform === 'win32';
  const shell = isWindows ? 'powershell.exe' : 'bash';
  const args = isWindows ? [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-NoExit',
    '-Command',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; Set-PSReadLineOption -HistorySaveStyle SaveNothing -ErrorAction SilentlyContinue; Clear-Host'
  ] : [];

  let ptyProcess;
  let isExited = false;
  try {
    const termEnv = { 
      ...process.env, 
      TERM: 'xterm-256color',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      POWERSHELL_TELEMETRY_OPTOUT: '1',
    };
    if (activePythonExe) {
      const pyDir = path.dirname(activePythonExe);
      const scriptsDir = path.join(pyDir, 'Scripts');
      const sep = isWindows ? ';' : ':';
      termEnv.PATH = `${pyDir}${sep}${scriptsDir}${sep}${process.env.PATH || ''}`;
    }

    ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: currentWorkspace,
      env: termEnv,
      useConpty: isWindows
    });

    const safeWrite = (data) => {
      if (isExited || !ptyProcess) return;
      try {
        ptyProcess.write(data);
      } catch (err) {
        if (err.code !== 'EAGAIN' && err.code !== 'EPIPE') {
          console.warn('[Terminal safeWrite warning]', err.message);
        }
      }
    };

    ptyProcess.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'output', data }));
        } catch {}
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      isExited = true;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
        } catch {}
      }
    });

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'input') {
          safeWrite(parsed.data);
        } else if (parsed.type === 'execute') {
          safeWrite(`${parsed.command}\r\n`);
        } else if (parsed.type === 'resize') {
          if (parsed.cols && parsed.rows && parsed.cols > 0 && parsed.rows > 0 && !isExited && ptyProcess) {
            try { ptyProcess.resize(parsed.cols, parsed.rows); } catch {}
          }
        }
      } catch {
        safeWrite(msg.toString());
      }
    });

    ws.on('close', () => {
      console.log('[Terminal] Client disconnected');
      if (!isExited && ptyProcess) {
        try {
          if (isWindows) {
            safeWrite('exit\r\n');
            setTimeout(() => {
              if (!isExited && ptyProcess) {
                try { ptyProcess.kill(); } catch {}
              }
            }, 300);
          } else {
            ptyProcess.kill();
          }
        } catch {}
      }
    });
  } catch (err) {
    console.error('[Terminal] Error creating pty:', err);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data: `Failed to spawn terminal: ${err.message}\r\n` }));
    }
  }
});

// 9. Dedicated Isolated Code Execution Runner via WebSocket (/runner)
// Never clutters or interferes with the user's interactive PowerShell session!
runnerWss.on('connection', (ws) => {
  let activeProcess = null;

  ws.on('message', (msgStr) => {
    try {
      const msg = JSON.parse(msgStr.toString());
      if (msg.type === 'run') {
        if (activeProcess) {
          try {
            if (process.platform === 'win32') {
              exec(`taskkill /PID ${activeProcess.pid} /T /F`);
            } else {
              activeProcess.kill();
            }
          } catch {}
          activeProcess = null;
        }

        const startTime = Date.now();
        const cmd = msg.command;
        const isWin = process.platform === 'win32';

        // Isolated non-interactive execution that leaves general PowerShell untouched
        const shellExe = isWin ? 'powershell.exe' : '/bin/bash';
        const shellArgs = isWin 
          ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd]
          : ['-c', cmd];

        try {
          activeProcess = spawn(shellExe, shellArgs, {
            cwd: currentWorkspace,
            env: {
              ...process.env,
              PYTHONIOENCODING: 'utf-8',
              PYTHONUTF8: '1',
            }
          });

          activeProcess.stdout.on('data', (chunk) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'stdout', data: chunk.toString('utf-8') }));
            }
          });

          activeProcess.stderr.on('data', (chunk) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'stderr', data: chunk.toString('utf-8') }));
            }
          });

          activeProcess.on('close', (code) => {
            const durationMs = Date.now() - startTime;
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'exit', code: code !== null ? code : 0, durationMs }));
            }
            activeProcess = null;
          });

          activeProcess.on('error', (err) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'stderr', data: `Ошибка запуска: ${err.message}\n` }));
              ws.send(JSON.stringify({ type: 'exit', code: 1, durationMs: Date.now() - startTime }));
            }
            activeProcess = null;
          });
        } catch (spawnErr) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stderr', data: `Не удалось запустить процесс: ${spawnErr.message}\n` }));
            ws.send(JSON.stringify({ type: 'exit', code: 1, durationMs: 0 }));
          }
        }
      } else if (msg.type === 'stop') {
        if (activeProcess) {
          try {
            if (process.platform === 'win32') {
              exec(`taskkill /PID ${activeProcess.pid} /T /F`);
            } else {
              activeProcess.kill('SIGTERM');
            }
          } catch {}
          activeProcess = null;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stderr', data: '\n[Процесс остановлен пользователем]\n' }));
            ws.send(JSON.stringify({ type: 'exit', code: 130, durationMs: 0 }));
          }
        }
      } else if (msg.type === 'stdin') {
        if (activeProcess && activeProcess.stdin && activeProcess.stdin.writable) {
          activeProcess.stdin.write(msg.data + '\n');
        }
      }
    } catch (e) {
      console.error('[Runner] message parse error', e);
    }
  });

  ws.on('close', () => {
    if (activeProcess) {
      try {
        if (process.platform === 'win32') {
          exec(`taskkill /PID ${activeProcess.pid} /T /F`);
        } else {
          activeProcess.kill();
        }
      } catch {}
      activeProcess = null;
    }
  });
});

// HTTP Upgrade routing for WebSocket endpoints: /terminal, /runner and /events
server.on('upgrade', (request, socket, head) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/terminal') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/runner') {
      runnerWss.handleUpgrade(request, socket, head, (ws) => {
        runnerWss.emit('connection', ws, request);
      });
    } else if (pathname === '/events') {
      eventsWss.handleUpgrade(request, socket, head, (ws) => {
        eventsWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  } catch (err) {
    socket.destroy();
  }
});

// 7. Static Frontend Serving (Production build with cache busting)
const distPath = path.join(process.cwd(), 'dist');
if (fsSync.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/terminal') || req.path.startsWith('/events') || req.path.startsWith('/preview') || req.path.startsWith('/proxy')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`[Aura IDE Backend] Running on http://localhost:${PORT}`);
  console.log(`[Aura IDE Backend] Active workspace: ${currentWorkspace}`);
  startWorkspaceWatcher(currentWorkspace);
});
