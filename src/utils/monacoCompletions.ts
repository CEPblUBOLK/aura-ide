// Dynamic AST-Aware Monaco Autocomplete & Real Code Intelligence Engine
// Features:
// 1. Strict language separation: Python files ONLY suggest Python symbols, never TypeScript or other languages
// 2. Deep library parsing for "from <pkg> import " and "<pkg>." across Python (aiogram, math, os, requests, numpy, torch, etc.)
// 3. Deep imports & introspection for JS/TS (node_modules + workspace), Rust (std + Cargo.toml), Go (std packages), C/C++ (headers)
// 4. In-document token extraction for instant same-file completion (scoped per language)

interface WorkspaceSymbol {
  name: string;
  kind: string;
  lang?: string;
  file: string;
  line?: number;
  detail?: string;
  insertText: string;
}

let cachedWorkspaceSymbols: WorkspaceSymbol[] = [];
let lastSymbolsFetch = 0;
const pyModuleCache = new Map<string, any[]>();
let cachedPyModules: string[] = [];
let lastPyModulesFetch = 0;

export async function refreshWorkspaceSymbols(): Promise<WorkspaceSymbol[]> {
  try {
    const res = await fetch('/api/symbols');
    if (res.ok) {
      const data = await res.json();
      cachedWorkspaceSymbols = data.symbols || [];
      lastSymbolsFetch = Date.now();
    }
  } catch {}
  return cachedWorkspaceSymbols;
}

// Ensure symbols are loaded early
if (typeof window !== 'undefined') {
  setTimeout(() => { refreshWorkspaceSymbols(); }, 400);
}

async function getPythonModuleMembers(moduleName: string): Promise<any[]> {
  if (pyModuleCache.has(moduleName)) {
    return pyModuleCache.get(moduleName)!;
  }
  try {
    const res = await fetch(`/api/python/introspect?module=${encodeURIComponent(moduleName)}`);
    if (res.ok) {
      const data = await res.json();
      const syms = data.symbols || [];
      pyModuleCache.set(moduleName, syms);
      return syms;
    }
  } catch {}
  return [];
}

async function getPythonModulesList(): Promise<string[]> {
  if (Date.now() - lastPyModulesFetch < 60000 && cachedPyModules.length > 0) {
    return cachedPyModules;
  }
  try {
    const res = await fetch('/api/python/modules');
    if (res.ok) {
      const data = await res.json();
      cachedPyModules = data.modules || [];
      lastPyModulesFetch = Date.now();
      return cachedPyModules;
    }
  } catch {}
  return [
    'aiogram', 'math', 'sys', 'os', 'json', 'datetime', 're', 'asyncio', 'itertools',
    'collections', 'pathlib', 'random', 'subprocess', 'threading', 'time', 'typing',
    'requests', 'numpy', 'pandas', 'torch', 'scipy', 'fastapi', 'pydantic', 'flask'
  ];
}

async function getIntrospectSymbols(lang: string, moduleName: string): Promise<any[]> {
  try {
    const res = await fetch(`/api/introspect?lang=${encodeURIComponent(lang)}&module=${encodeURIComponent(moduleName)}`);
    if (res.ok) {
      const data = await res.json();
      return data.symbols || [];
    }
  } catch {}
  return [];
}

let isRegistered = false;

export function registerMonacoCompletions(monaco: any) {
  if (isRegistered || !monaco) return;
  isRegistered = true;

  const Kind = monaco.languages.CompletionItemKind;
  const SnippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  const mapSymbolKind = (k: string) => {
    switch (k) {
      case 'function': return Kind.Function;
      case 'class': return Kind.Class;
      case 'variable': return Kind.Variable;
      case 'constant': return Kind.Constant;
      case 'interface': return Kind.Interface;
      case 'struct': return Kind.Struct;
      case 'module': return Kind.Module;
      case 'folder': return Kind.Folder;
      default: return Kind.Property;
    }
  };

  // Helper: extracts tokens defined in current active editor document
  const extractDocumentTokens = (model: any): string[] => {
    const text = model.getValue();
    const matches = text.match(/[a-zA-Z_$][a-zA-Z0-9_$]{2,}/g) || [];
    return Array.from(new Set(matches));
  };

  // =========================================================================
  // 1. DYNAMIC PYTHON COMPLETIONS (STRICT LANGUAGE SEPARATION)
  // =========================================================================
  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.', ' ', '(', '@', ':', '\'', '"', ','],
    provideCompletionItems: async (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      const lineUpToCursor = lineContent.substring(0, position.column - 1);
      
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Background symbol refresh
      if (Date.now() - lastSymbolsFetch > 10000) {
        refreshWorkspaceSymbols();
      }

      // CASE A: User typed "from <pkg> import " or "from <pkg.sub> import "
      const fromImportMatch = lineUpToCursor.match(/^\s*from\s+([a-zA-Z0-9_.]+)\s+import\s*(.*)$/);
      if (fromImportMatch) {
        const targetMod = fromImportMatch[1];
        const afterImport = fromImportMatch[2];
        const tokens = afterImport.split(',').map((s: string) => s.trim()).filter(Boolean);
        const alreadyImported = afterImport.trim().endsWith(',') ? tokens : tokens.slice(0, -1);

        const live = await getPythonModuleMembers(targetMod);
        const suggestions: any[] = [];

        live.forEach(m => {
          if (!alreadyImported.includes(m.name)) {
            suggestions.push({
              label: m.name,
              kind: m.kind === 'function' ? Kind.Function : (m.kind === 'class' ? Kind.Class : (m.kind === 'module' ? Kind.Module : Kind.Variable)),
              insertText: m.name,
              detail: `${targetMod}.${m.name}${m.sig || ''}`,
              documentation: m.doc || `${m.kind} in ${targetMod}`,
              range,
            });
          }
        });

        // Also check workspace Python symbols from this file/module
        cachedWorkspaceSymbols
          .filter(s => s.lang === 'python' && (s.file.includes(targetMod) || s.name === targetMod))
          .forEach(s => {
            if (!suggestions.some(item => item.label === s.name) && !alreadyImported.includes(s.name)) {
              suggestions.push({
                label: s.name,
                kind: mapSymbolKind(s.kind),
                insertText: s.name,
                detail: s.detail || `${s.kind} in ${s.file}`,
                range,
              });
            }
          });

        // STRICT: inside "from ... import", ONLY suggest exported symbols of that module! Never TS or doc tokens!
        return { suggestions };
      }

      // CASE B: User typed "from <...>" (before "import")
      const fromMatch = lineUpToCursor.match(/^\s*from\s+([a-zA-Z0-9_.]*)$/);
      if (fromMatch) {
        const modules = await getPythonModulesList();
        const suggestions: any[] = modules.map(mod => ({
          label: mod,
          kind: Kind.Module,
          insertText: mod,
          detail: `Python Package (${mod})`,
          range,
        }));

        // Also workspace Python files
        cachedWorkspaceSymbols
          .filter(s => s.lang === 'python' && s.kind === 'module')
          .forEach(s => {
            if (!suggestions.some(item => item.label === s.name)) {
              suggestions.push({
                label: s.name,
                kind: Kind.Module,
                insertText: s.name,
                detail: `Workspace Python Module (${s.file})`,
                range,
              });
            }
          });

        return { suggestions };
      }

      // CASE C: User typed "import <...>"
      const importMatch = lineUpToCursor.match(/^\s*import\s+([a-zA-Z0-9_.]*)$/);
      if (importMatch) {
        const modules = await getPythonModulesList();
        const suggestions: any[] = modules.map(mod => ({
          label: mod,
          kind: Kind.Module,
          insertText: mod,
          detail: `Python Package (${mod})`,
          range,
        }));

        cachedWorkspaceSymbols
          .filter(s => s.lang === 'python' && s.kind === 'module')
          .forEach(s => {
            if (!suggestions.some(item => item.label === s.name)) {
              suggestions.push({
                label: s.name,
                kind: Kind.Module,
                insertText: s.name,
                detail: `Workspace Python Module (${s.file})`,
                range,
              });
            }
          });

        return { suggestions };
      }

      // CASE D: Dot-Access "<caller>." (e.g. aiogram., math., os., requests.)
      const dotMatch = lineUpToCursor.match(/([a-zA-Z0-9_.]+)\.$/);
      if (dotMatch) {
        const callerName = dotMatch[1];
        const dotRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        };

        const liveMembers = await getPythonModuleMembers(callerName);
        const suggestions: any[] = [];

        liveMembers.forEach(m => {
          suggestions.push({
            label: m.name,
            kind: m.kind === 'function' ? Kind.Function : (m.kind === 'class' ? Kind.Class : (m.kind === 'module' ? Kind.Module : Kind.Property)),
            insertText: m.kind === 'function' ? `${m.name}($0)` : m.name,
            insertTextRules: m.kind === 'function' ? SnippetRule : undefined,
            detail: `${callerName}.${m.name}${m.sig || ''}`,
            documentation: m.doc || `Member of ${callerName}`,
            range: dotRange,
          });
        });

        // Also workspace Python symbols from matching file
        cachedWorkspaceSymbols
          .filter(s => s.lang === 'python' && (s.file.includes(callerName) || s.name === callerName))
          .forEach(s => {
            if (!suggestions.some(item => item.label === s.name)) {
              suggestions.push({
                label: s.name,
                kind: mapSymbolKind(s.kind),
                insertText: s.insertText,
                insertTextRules: s.insertText.includes('$') ? SnippetRule : undefined,
                detail: s.detail || `${s.kind} in ${s.file}`,
                range: dotRange,
              });
            }
          });

        return { suggestions };
      }

      // CASE E: General Python Code (Context-Aware: Local definitions, Imported items, Builtins, Keywords)
      const suggestions: any[] = [];
      const docText = model.getValue();

      // 1. Parse ONLY explicitly imported modules & symbols in THIS file
      const importedModules = new Set<string>();
      const importedSymbols = new Map<string, string>(); // symbol -> origin module

      // Match: import x, y as z
      const importRegex = /^\s*import\s+([^#\n]+)/gm;
      let match;
      while ((match = importRegex.exec(docText)) !== null) {
        const parts = match[1].split(',');
        for (const part of parts) {
          const clean = part.trim();
          if (!clean) continue;
          if (clean.includes(' as ')) {
            const alias = clean.split(/\s+as\s+/)[1]?.trim();
            if (alias) importedModules.add(alias);
          } else {
            const mod = clean.split('.')[0]?.trim();
            if (mod) importedModules.add(mod);
          }
        }
      }

      // Match: from x import y as z, w
      const fromImportRegex = /^\s*from\s+([a-zA-Z0-9_.]+)\s+import\s+([^#\n]+)/gm;
      while ((match = fromImportRegex.exec(docText)) !== null) {
        const modOrigin = match[1];
        const items = match[2].split(',');
        for (const item of items) {
          const clean = item.trim();
          if (!clean || clean === '*') continue;
          if (clean.includes(' as ')) {
            const [orig, alias] = clean.split(/\s+as\s+/);
            if (alias?.trim()) importedSymbols.set(alias.trim(), modOrigin);
          } else {
            importedSymbols.set(clean, modOrigin);
          }
        }
      }

      // 2. Parse local definitions in the current file (functions, classes, assignments)
      const localSymbols = new Set<string>();
      const defRegex = /^\s*def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/gm;
      while ((match = defRegex.exec(docText)) !== null) {
        localSymbols.add(match[1]);
        // Also extract function parameters
        const params = match[2].split(',');
        for (const param of params) {
          const pName = param.trim().split(/[:=]/)[0]?.trim();
          if (pName && pName !== 'self' && pName !== 'cls') {
            localSymbols.add(pName);
          }
        }
      }

      const classRegex = /^\s*class\s+([a-zA-Z0-9_]+)/gm;
      while ((match = classRegex.exec(docText)) !== null) {
        localSymbols.add(match[1]);
      }

      const assignRegex = /^\s*([a-zA-Z0-9_]+)\s*=[^=]/gm;
      while ((match = assignRegex.exec(docText)) !== null) {
        localSymbols.add(match[1]);
      }

      // Priority 00: Local variables, params, functions & classes in current file
      localSymbols.forEach(name => {
        suggestions.push({
          label: name,
          kind: Kind.Variable,
          insertText: name,
          detail: 'Local definition',
          sortText: `00_${name}`,
          range,
        });
      });

      // Priority 10: Explicitly imported symbols in this file
      importedSymbols.forEach((origin, sym) => {
        suggestions.push({
          label: sym,
          kind: Kind.Class,
          insertText: sym,
          detail: `Imported from ${origin}`,
          sortText: `10_${sym}`,
          range,
        });
      });

      // Priority 15: Explicitly imported modules in this file
      importedModules.forEach(mod => {
        suggestions.push({
          label: mod,
          kind: Kind.Module,
          insertText: mod,
          detail: `Imported package (${mod})`,
          sortText: `15_${mod}`,
          range,
        });
      });

      // Priority 20: Python Builtins (print, len, range, etc.)
      const pythonBuiltins = [
        { label: 'print', insertText: 'print(${1:value})', detail: 'Builtin: print(*values, sep=" ", end="\\n")' },
        { label: 'len', insertText: 'len(${1:obj})', detail: 'Builtin: return number of items' },
        { label: 'range', insertText: 'range(${1:stop})', detail: 'Builtin: range(stop) or range(start, stop[, step])' },
        { label: 'enumerate', insertText: 'enumerate(${1:iterable})', detail: 'Builtin: enumerate(iterable, start=0)' },
        { label: 'zip', insertText: 'zip(${1:iter1}, ${2:iter2})', detail: 'Builtin: zip(*iterables)' },
        { label: 'isinstance', insertText: 'isinstance(${1:obj}, ${2:class_or_tuple})', detail: 'Builtin: check type' },
        { label: 'str', insertText: 'str(${1:obj})', detail: 'Builtin: string representation' },
        { label: 'int', insertText: 'int(${1:x})', detail: 'Builtin: integer conversion' },
        { label: 'float', insertText: 'float(${1:x})', detail: 'Builtin: float conversion' },
        { label: 'bool', insertText: 'bool(${1:x})', detail: 'Builtin: boolean conversion' },
        { label: 'list', insertText: 'list(${1:iterable})', detail: 'Builtin: list collection' },
        { label: 'dict', insertText: 'dict(${1:})', detail: 'Builtin: dictionary' },
        { label: 'set', insertText: 'set(${1:iterable})', detail: 'Builtin: set collection' },
        { label: 'tuple', insertText: 'tuple(${1:iterable})', detail: 'Builtin: tuple collection' },
        { label: 'open', insertText: 'open(\'${1:file}\', \'${2:r}\', encoding=\'utf-8\')', detail: 'Builtin: open file' },
        { label: 'type', insertText: 'type(${1:object})', detail: 'Builtin: type of object' },
        { label: 'sum', insertText: 'sum(${1:iterable})', detail: 'Builtin: sum of iterable' },
        { label: 'min', insertText: 'min(${1:arg1}, ${2:arg2})', detail: 'Builtin: minimum value' },
        { label: 'max', insertText: 'max(${1:arg1}, ${2:arg2})', detail: 'Builtin: maximum value' },
        { label: 'any', insertText: 'any(${1:iterable})', detail: 'Builtin: True if any element is true' },
        { label: 'all', insertText: 'all(${1:iterable})', detail: 'Builtin: True if all elements are true' },
        { label: 'abs', insertText: 'abs(${1:x})', detail: 'Builtin: absolute value' },
        { label: 'sorted', insertText: 'sorted(${1:iterable})', detail: 'Builtin: return new sorted list' },
        { label: 'map', insertText: 'map(${1:func}, ${2:iterable})', detail: 'Builtin: map function over iterable' },
        { label: 'filter', insertText: 'filter(${1:func}, ${2:iterable})', detail: 'Builtin: filter elements' },
      ];

      pythonBuiltins.forEach(b => {
        suggestions.push({
          label: b.label,
          kind: Kind.Function,
          insertText: b.insertText,
          insertTextRules: SnippetRule,
          detail: b.detail,
          sortText: `20_${b.label}`,
          range,
        });
      });

      // Priority 30: Python Keywords & Syntax Snippets
      const pythonKeywords = [
        { label: 'import', kind: Kind.Keyword, insertText: 'import ${1:module}', insertTextRules: SnippetRule, detail: 'Keyword: import a module' },
        { label: 'from', kind: Kind.Keyword, insertText: 'from ${1:module} import ${2:item}', insertTextRules: SnippetRule, detail: 'Keyword: from ... import' },
        { label: 'def', kind: Kind.Snippet, insertText: 'def ${1:function_name}(${2:params}):\n\t${3:pass}', insertTextRules: SnippetRule, detail: 'Define a function' },
        { label: 'class', kind: Kind.Snippet, insertText: 'class ${1:ClassName}:\n\tdef __init__(self, ${2:args}):\n\t\t${3:pass}', insertTextRules: SnippetRule, detail: 'Define a class' },
        { label: 'if', kind: Kind.Keyword, insertText: 'if ${1:condition}:\n\t${2:pass}', insertTextRules: SnippetRule, detail: 'Conditional if' },
        { label: 'elif', kind: Kind.Keyword, insertText: 'elif ${1:condition}:\n\t${2:pass}', insertTextRules: SnippetRule, detail: 'Conditional elif' },
        { label: 'else', kind: Kind.Keyword, insertText: 'else:\n\t${1:pass}', insertTextRules: SnippetRule, detail: 'Conditional else' },
        { label: 'for', kind: Kind.Snippet, insertText: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', insertTextRules: SnippetRule, detail: 'For loop' },
        { label: 'while', kind: Kind.Snippet, insertText: 'while ${1:condition}:\n\t${2:pass}', insertTextRules: SnippetRule, detail: 'While loop' },
        { label: 'try', kind: Kind.Snippet, insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:raise}', insertTextRules: SnippetRule, detail: 'Try-except block' },
        { label: 'with', kind: Kind.Snippet, insertText: 'with open(\'${1:file}\', \'${2:r}\', encoding=\'utf-8\') as ${3:f}:\n\t${4:data = f.read()}', insertTextRules: SnippetRule, detail: 'With context manager' },
        { label: 'return', kind: Kind.Keyword, insertText: 'return ${1:value}', insertTextRules: SnippetRule, detail: 'Return statement' },
        { label: 'yield', kind: Kind.Keyword, insertText: 'yield ${1:value}', insertTextRules: SnippetRule, detail: 'Generator yield' },
        { label: 'async', kind: Kind.Keyword, insertText: 'async def ${1:func}(${2:params}):\n\t${3:pass}', insertTextRules: SnippetRule, detail: 'Async function' },
        { label: 'await', kind: Kind.Keyword, insertText: 'await ${1:coroutine}', insertTextRules: SnippetRule, detail: 'Await coroutine' },
        { label: 'lambda', kind: Kind.Keyword, insertText: 'lambda ${1:x}: ${2:x}', insertTextRules: SnippetRule, detail: 'Lambda expression' },
        { label: 'pass', kind: Kind.Keyword, insertText: 'pass', detail: 'Pass statement' },
        { label: 'break', kind: Kind.Keyword, insertText: 'break', detail: 'Break loop' },
        { label: 'continue', kind: Kind.Keyword, insertText: 'continue', detail: 'Continue loop' },
        { label: 'main', kind: Kind.Snippet, insertText: 'if __name__ == \'__main__\':\n\t${1:main()}', insertTextRules: SnippetRule, detail: 'Main boilerplate' },
      ];

      pythonKeywords.forEach(k => {
        suggestions.push({
          ...k,
          sortText: `30_${k.label}`,
          range,
        });
      });

      // Priority 40: Workspace symbols matching Python only
      cachedWorkspaceSymbols
        .filter(s => s.lang === 'python')
        .forEach(s => {
          if (!suggestions.some(item => item.label === s.name)) {
            suggestions.push({
              label: s.name,
              kind: mapSymbolKind(s.kind),
              insertText: s.insertText,
              insertTextRules: s.insertText.includes('$') ? SnippetRule : undefined,
              detail: s.detail || `${s.kind} [${s.file}]`,
              sortText: `40_${s.name}`,
              range,
            });
          }
        });

      return { suggestions };
    }
  });

  // =========================================================================
  // 2. DYNAMIC RUST COMPLETIONS (STRICT LANGUAGE SEPARATION)
  // =========================================================================
  monaco.languages.registerCompletionItemProvider('rust', {
    triggerCharacters: ['.', ':', '!', ' '],
    provideCompletionItems: async (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      const lineUpToCursor = lineContent.substring(0, position.column - 1);

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: any[] = [];

      // Check "use std::..." or "use crate::..."
      const useMatch = lineUpToCursor.match(/use\s+([a-zA-Z0-9_:]+)::$/);
      if (useMatch) {
        const modName = useMatch[1];
        const syms = await getIntrospectSymbols('rust', modName);
        syms.forEach(s => {
          suggestions.push({
            label: s.name,
            kind: s.kind === 'function' ? Kind.Function : Kind.Class,
            insertText: s.name,
            detail: s.detail,
            range,
          });
        });
        if (suggestions.length > 0) return { suggestions };
      }

      const rustKeywords = [
        { label: 'fn', kind: Kind.Snippet, insertText: 'fn ${1:name}(${2:params}) -> ${3:Result<(), Box<dyn std::error::Error>>} {\n\t${4:Ok(())}\n}', insertTextRules: SnippetRule, detail: 'Define function' },
        { label: 'main', kind: Kind.Snippet, insertText: 'fn main() {\n\tprintln!("${1:Hello, world!}");\n}', insertTextRules: SnippetRule, detail: 'fn main entry point' },
        { label: 'let', kind: Kind.Keyword, insertText: 'let ${1:var} = ${2:val};', insertTextRules: SnippetRule, detail: 'Immutable binding' },
        { label: 'let mut', kind: Kind.Keyword, insertText: 'let mut ${1:var} = ${2:val};', insertTextRules: SnippetRule, detail: 'Mutable binding' },
        { label: 'struct', kind: Kind.Snippet, insertText: 'struct ${1:Name} {\n\t${2:field}: ${3:Type},\n}', insertTextRules: SnippetRule, detail: 'Define struct' },
        { label: 'enum', kind: Kind.Snippet, insertText: 'enum ${1:Name} {\n\t${2:Variant},\n}', insertTextRules: SnippetRule, detail: 'Define enum' },
        { label: 'impl', kind: Kind.Snippet, insertText: 'impl ${1:Type} {\n\tpub fn new() -> Self {\n\t\tSelf {}\n\t}\n}', insertTextRules: SnippetRule, detail: 'Implement type' },
        { label: 'match', kind: Kind.Snippet, insertText: 'match ${1:expr} {\n\t${2:pattern} => ${3:action},\n\t_ => (),\n}', insertTextRules: SnippetRule, detail: 'Match expression' },
        { label: 'use', kind: Kind.Keyword, insertText: 'use ${1:std::collections::HashMap};', insertTextRules: SnippetRule, detail: 'Import module' },
        { label: 'pub', kind: Kind.Keyword, insertText: 'pub ', detail: 'Public visibility' },
        { label: 'println!', kind: Kind.Function, insertText: 'println!("${1:{}", ${2:val});', insertTextRules: SnippetRule, detail: 'Print line macro' },
        { label: 'vec!', kind: Kind.Function, insertText: 'vec![${1:items}]', insertTextRules: SnippetRule, detail: 'Vector macro' },
        { label: 'format!', kind: Kind.Function, insertText: 'format!("${1:{}", ${2:val})', insertTextRules: SnippetRule, detail: 'Format string macro' },
        { label: 'std::io', kind: Kind.Module, insertText: 'std::io', detail: 'Rust std::io' },
        { label: 'std::fs', kind: Kind.Module, insertText: 'std::fs', detail: 'Rust std::fs' },
        { label: 'std::path::Path', kind: Kind.Class, insertText: 'std::path::Path', detail: 'Path' },
        { label: 'std::collections::HashMap', kind: Kind.Class, insertText: 'std::collections::HashMap', detail: 'HashMap' },
      ];
      rustKeywords.forEach(k => suggestions.push({ ...k, range }));

      // Workspace symbols: STRICTLY Rust symbols ONLY!
      cachedWorkspaceSymbols
        .filter(s => s.lang === 'rust')
        .forEach(s => {
          suggestions.push({
            label: s.name,
            kind: mapSymbolKind(s.kind),
            insertText: s.insertText,
            insertTextRules: s.insertText.includes('$') ? SnippetRule : undefined,
            detail: s.detail || `${s.kind} [${s.file}]`,
            range,
          });
        });

      // Document tokens
      extractDocumentTokens(model).forEach(t => {
        if (!suggestions.some(s => s.label === t)) {
          suggestions.push({ label: t, kind: Kind.Variable, insertText: t, detail: 'Document token', range });
        }
      });

      return { suggestions };
    }
  });

  // =========================================================================
  // 3. JAVASCRIPT & TYPESCRIPT COMPLETIONS (STRICT LANGUAGE SEPARATION)
  // =========================================================================
  const registerJsTs = (lang: string) => {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', ' ', '\'', '"', '/', '<', '{'],
      provideCompletionItems: async (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const lineContent = model.getLineContent(position.lineNumber);
        const lineUpToCursor = lineContent.substring(0, position.column - 1);

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];

        // CASE 1: typing "import { " -> introspect module
        const importFromMatch = lineUpToCursor.match(/import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/);
        const importCurlyMatch = lineUpToCursor.match(/import\s*\{\s*([a-zA-Z0-9_,\s]*)$/);
        if (importCurlyMatch && lineContent.includes('from')) {
          const fromPart = lineContent.match(/from\s*['"]([^'"]+)['"]/);
          if (fromPart) {
            const syms = await getIntrospectSymbols('javascript', fromPart[1]);
            syms.forEach(s => {
              suggestions.push({
                label: s.name,
                kind: Kind.Property,
                insertText: s.name,
                detail: s.detail || `Exported from ${fromPart[1]}`,
                range,
              });
            });
            if (suggestions.length > 0) return { suggestions };
          }
        }

        // CASE 2: typing "from '...' "
        if (lineUpToCursor.includes('from') || lineUpToCursor.includes('import')) {
          cachedWorkspaceSymbols
            .filter(s => s.lang === 'typescript' || s.lang === 'javascript')
            .filter(s => s.kind === 'module')
            .forEach(s => {
              suggestions.push({
                label: `./${s.file.replace(/\.(ts|js|tsx|jsx)$/, '')}`,
                kind: Kind.File,
                insertText: `./${s.file.replace(/\.(ts|js|tsx|jsx)$/, '')}`,
                detail: `Workspace module (${s.file})`,
                range,
              });
            });
        }

        const jsKeywords = [
          { label: 'import', kind: Kind.Snippet, insertText: 'import { ${2:item} } from \'${1:module}\';', insertTextRules: SnippetRule, detail: 'Import statement' },
          { label: 'import default', kind: Kind.Snippet, insertText: 'import ${1:name} from \'${2:module}\';', insertTextRules: SnippetRule, detail: 'Import default' },
          { label: 'export', kind: Kind.Keyword, insertText: 'export ', detail: 'Export keyword' },
          { label: 'const', kind: Kind.Keyword, insertText: 'const ${1:name} = ${2:value};', insertTextRules: SnippetRule, detail: 'Declare constant' },
          { label: 'let', kind: Kind.Keyword, insertText: 'let ${1:name} = ${2:value};', insertTextRules: SnippetRule, detail: 'Declare variable' },
          { label: 'function', kind: Kind.Snippet, insertText: 'function ${1:name}(${2:params}) {\n\t${3:}\n}', insertTextRules: SnippetRule, detail: 'Declare function' },
          { label: 'arrow', kind: Kind.Snippet, insertText: 'const ${1:name} = (${2:params}) => {\n\t${3:}\n};', insertTextRules: SnippetRule, detail: 'Arrow function' },
          { label: 'async function', kind: Kind.Snippet, insertText: 'async function ${1:name}(${2:params}) {\n\t${3:}\n}', insertTextRules: SnippetRule, detail: 'Async function' },
          { label: 'console.log', kind: Kind.Function, insertText: 'console.log(${1:value});', insertTextRules: SnippetRule, detail: 'Console log' },
          { label: 'interface', kind: Kind.Snippet, insertText: 'interface ${1:Name} {\n\t${2:prop}: ${3:string};\n}', insertTextRules: SnippetRule, detail: 'TypeScript interface' },
          { label: 'type', kind: Kind.Snippet, insertText: 'type ${1:Name} = ${2:string};', insertTextRules: SnippetRule, detail: 'TypeScript type alias' },
          { label: 'useEffect', kind: Kind.Function, insertText: 'useEffect(() => {\n\t${1:}\n}, [${2:}]);', insertTextRules: SnippetRule, detail: 'React useEffect' },
          { label: 'useState', kind: Kind.Function, insertText: 'const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initial});', insertTextRules: SnippetRule, detail: 'React useState' },
          { label: 'useCallback', kind: Kind.Function, insertText: 'useCallback((${1:}) => {\n\t${2:}\n}, [${3:}]);', insertTextRules: SnippetRule, detail: 'React useCallback' },
          { label: 'useRef', kind: Kind.Function, insertText: 'const ${1:ref} = useRef<${2:HTMLDivElement}>(null);', insertTextRules: SnippetRule, detail: 'React useRef' },
        ];
        jsKeywords.forEach(k => suggestions.push({ ...k, range }));

        // Workspace symbols: STRICTLY JS/TS symbols ONLY!
        cachedWorkspaceSymbols
          .filter(s => s.lang === 'javascript' || s.lang === 'typescript')
          .forEach(s => {
            suggestions.push({
              label: s.name,
              kind: mapSymbolKind(s.kind),
              insertText: s.insertText,
              insertTextRules: s.insertText.includes('$') ? SnippetRule : undefined,
              detail: s.detail || `${s.kind} [${s.file}]`,
              range,
            });
          });

        // Document tokens
        extractDocumentTokens(model).forEach(t => {
          if (!suggestions.some(s => s.label === t)) {
            suggestions.push({ label: t, kind: Kind.Variable, insertText: t, detail: 'Document token', range });
          }
        });

        return { suggestions };
      }
    });
  };

  registerJsTs('javascript');
  registerJsTs('typescript');

  // =========================================================================
  // 4. GO COMPLETIONS (STRICT LANGUAGE SEPARATION)
  // =========================================================================
  monaco.languages.registerCompletionItemProvider('go', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: async (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      const lineUpToCursor = lineContent.substring(0, position.column - 1);

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: any[] = [];

      // Check dot access on standard package: fmt., os., strings.
      const dotMatch = lineUpToCursor.match(/([a-zA-Z0-9_]+)\.$/);
      if (dotMatch) {
        const pkg = dotMatch[1];
        const dotRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        };
        const syms = await getIntrospectSymbols('go', pkg);
        syms.forEach(s => {
          suggestions.push({
            label: s.name,
            kind: s.kind === 'function' ? Kind.Function : Kind.Variable,
            insertText: s.kind === 'function' ? `${s.name}($0)` : s.name,
            insertTextRules: s.kind === 'function' ? SnippetRule : undefined,
            detail: `${pkg}.${s.name} ${s.sig || ''}`,
            range: dotRange,
          });
        });
        if (suggestions.length > 0) return { suggestions };
      }

      const goKeywords = [
        { label: 'func', kind: Kind.Snippet, insertText: 'func ${1:name}(${2:params}) ${3:error} {\n\t${4:return nil}\n}', insertTextRules: SnippetRule, detail: 'Function declaration' },
        { label: 'main', kind: Kind.Snippet, insertText: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("${1:Hello}")\n}', insertTextRules: SnippetRule, detail: 'Main package boilerplate' },
        { label: 'struct', kind: Kind.Snippet, insertText: 'type ${1:Name} struct {\n\t${2:Field} ${3:string}\n}', insertTextRules: SnippetRule, detail: 'Struct definition' },
        { label: 'interface', kind: Kind.Snippet, insertText: 'type ${1:Name} interface {\n\t${2:Method}() error\n}', insertTextRules: SnippetRule, detail: 'Interface definition' },
        { label: 'fmt.Println', kind: Kind.Function, insertText: 'fmt.Println(${1:value})', insertTextRules: SnippetRule, detail: 'Print line' },
        { label: 'if err != nil', kind: Kind.Snippet, insertText: 'if err != nil {\n\t${1:return err}\n}', insertTextRules: SnippetRule, detail: 'Error check idiom' },
      ];
      goKeywords.forEach(k => suggestions.push({ ...k, range }));

      // Workspace symbols: STRICTLY Go symbols ONLY!
      cachedWorkspaceSymbols
        .filter(s => s.lang === 'go')
        .forEach(s => {
          suggestions.push({
            label: s.name,
            kind: mapSymbolKind(s.kind),
            insertText: s.insertText,
            insertTextRules: s.insertText.includes('$') ? SnippetRule : undefined,
            detail: s.detail || `${s.kind} [${s.file}]`,
            range,
          });
        });

      return { suggestions };
    }
  });

  // =========================================================================
  // 5. C & C++ COMPLETIONS (STRICT LANGUAGE SEPARATION)
  // =========================================================================
  const registerCpp = (lang: string) => {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', '>', ':', '#', ' '],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          { label: '#include <iostream>', kind: Kind.Snippet, insertText: '#include <iostream>', detail: 'Include iostream' },
          { label: '#include <vector>', kind: Kind.Snippet, insertText: '#include <vector>', detail: 'Include vector' },
          { label: '#include <string>', kind: Kind.Snippet, insertText: '#include <string>', detail: 'Include string' },
          { label: '#include <memory>', kind: Kind.Snippet, insertText: '#include <memory>', detail: 'Include smart pointers' },
          { label: 'int main', kind: Kind.Snippet, insertText: 'int main(int argc, char* argv[]) {\n\tstd::cout << "${1:Hello, World!}" << std::endl;\n\treturn 0;\n}', insertTextRules: SnippetRule, detail: 'Main function' },
          { label: 'std::cout', kind: Kind.Function, insertText: 'std::cout << ${1:value} << std::endl;', insertTextRules: SnippetRule, detail: 'Standard output' },
          { label: 'std::vector', kind: Kind.Class, insertText: 'std::vector<${1:int}> ${2:vec};', insertTextRules: SnippetRule, detail: 'Vector container' },
          { label: 'class', kind: Kind.Snippet, insertText: 'class ${1:Name} {\npublic:\n\t${1:Name}();\n\tvirtual ~${1:Name}();\nprivate:\n\t${2:};\n};', insertTextRules: SnippetRule, detail: 'Class declaration' },
          { label: 'struct', kind: Kind.Snippet, insertText: 'struct ${1:Name} {\n\t${2:int id};\n};', insertTextRules: SnippetRule, detail: 'Struct definition' },
        ].map(s => ({ ...s, range }));

        // Workspace symbols: STRICTLY C/C++ symbols ONLY!
        cachedWorkspaceSymbols
          .filter(s => s.lang === 'cpp')
          .forEach(s => {
            suggestions.push({
              label: s.name,
              kind: mapSymbolKind(s.kind),
              insertText: s.insertText,
              insertTextRules: s.insertText.includes('$') ? SnippetRule : undefined,
              detail: s.detail || `${s.kind} [${s.file}]`,
              range,
            });
          });

        return { suggestions };
      }
    });
  };

  registerCpp('c');
  registerCpp('cpp');

  // =========================================================================
  // 6. HTML COMPLETIONS
  // =========================================================================
  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['<', '!', ' '],
    provideCompletionItems: (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        { label: '!html5', kind: Kind.Snippet, insertText: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${2:<h1>Hello World</h1>}\n</body>\n</html>', insertTextRules: SnippetRule, detail: 'HTML5 Boilerplate' },
        { label: 'div', kind: Kind.Snippet, insertText: '<div class="${1:className}">\n\t${2:}\n</div>', insertTextRules: SnippetRule, detail: '<div> tag' },
        { label: 'button', kind: Kind.Snippet, insertText: '<button type="${1:button}">${2:Click}</button>', insertTextRules: SnippetRule, detail: '<button> tag' },
        { label: 'link:css', kind: Kind.Snippet, insertText: '<link rel="stylesheet" href="${1:style.css}">', insertTextRules: SnippetRule, detail: 'CSS link' },
        { label: 'script:src', kind: Kind.Snippet, insertText: '<script src="${1:app.js}"></script>', insertTextRules: SnippetRule, detail: 'Script tag' },
      ].map(s => ({ ...s, range }));

      return { suggestions };
    }
  });
}
