import sys
import os
import ast
import inspect
import json
import pkgutil
import importlib

def introspect_local_ast(file_path):
    """Safe static AST analysis of a local Python file without executing it."""
    items = []
    seen = set()
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            tree = ast.parse(f.read(), filename=file_path)

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if not node.name.startswith("_") and node.name not in seen:
                    seen.add(node.name)
                    args = [a.arg for a in node.args.args]
                    sig = f"({', '.join(args)})"
                    doc = (ast.get_docstring(node) or "")[:200]
                    items.append({"name": node.name, "kind": "function", "doc": doc, "sig": sig})
            elif isinstance(node, ast.ClassDef):
                if not node.name.startswith("_") and node.name not in seen:
                    seen.add(node.name)
                    doc = (ast.get_docstring(node) or "")[:200]
                    items.append({"name": node.name, "kind": "class", "doc": doc, "sig": ""})
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and not target.id.startswith("_") and target.id not in seen:
                        seen.add(target.id)
                        items.append({"name": target.id, "kind": "variable", "doc": "", "sig": ""})
    except Exception:
        pass
    return items

def introspect(mod_name, ws_path=None):
    # 1. Check if this is a local workspace file (safe static AST parsing)
    if ws_path:
        rel_path = mod_name.replace(".", os.sep)
        local_file = os.path.join(ws_path, f"{rel_path}.py")
        local_init = os.path.join(ws_path, rel_path, "__init__.py")
        if os.path.isfile(local_file):
            print(json.dumps(introspect_local_ast(local_file)))
            return
        elif os.path.isfile(local_init):
            print(json.dumps(introspect_local_ast(local_init)))
            return

    # 2. Import standard or third-party installed packages
    try:
        mod = importlib.import_module(mod_name)
    except Exception:
        print("[]")
        return

    items = []
    seen = set()

    def add_member(name):
        if not isinstance(name, str) or name in seen or name.startswith("_"):
            return
        seen.add(name)
        try:
            v = getattr(mod, name)
            kind = (
                "class" if inspect.isclass(v)
                else "function" if callable(v)
                else "module" if inspect.ismodule(v)
                else "variable"
            )
            doc = (inspect.getdoc(v) or "")[:200]
            sig = ""
            if callable(v) and not inspect.isclass(v):
                try:
                    sig = str(inspect.signature(v))
                except Exception:
                    pass
            items.append({"name": name, "kind": kind, "doc": doc, "sig": sig})
        except Exception:
            items.append({"name": name, "kind": "variable", "doc": "", "sig": ""})

    raw_all = getattr(mod, "__all__", None)
    if isinstance(raw_all, (list, tuple)):
        for name in raw_all:
            add_member(name)

    for name in dir(mod):
        add_member(name)

    if hasattr(mod, "__path__"):
        try:
            for sub in pkgutil.iter_modules(mod.__path__):
                if sub.name not in seen and not sub.name.startswith("_"):
                    seen.add(sub.name)
                    items.append({
                        "name": sub.name,
                        "kind": "module",
                        "doc": f"Submodule {mod_name}.{sub.name}",
                        "sig": ""
                    })
        except Exception:
            pass

    print(json.dumps(items))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[]")
        sys.exit(0)
    introspect(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
