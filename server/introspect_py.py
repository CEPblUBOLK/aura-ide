import sys
import os
import inspect
import json
import pkgutil
import importlib

def introspect(mod_name, ws_path=None):
    if ws_path and ws_path not in sys.path:
        sys.path.insert(0, ws_path)
    
    # Try importing module
    try:
        mod = importlib.import_module(mod_name)
    except Exception as e:
        # Check if mod_name is a local workspace .py file
        if ws_path:
            local_file = os.path.join(ws_path, f"{mod_name}.py")
            if os.path.isfile(local_file):
                try:
                    spec = importlib.util.spec_from_file_location(mod_name, local_file)
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                except Exception:
                    mod = None
        if not mod:
            print(json.dumps([]))
            sys.exit(0)

    items = []
    seen = set()

    # 1. Prioritize __all__
    raw_all = getattr(mod, "__all__", None)
    if raw_all and isinstance(raw_all, (list, tuple)):
        for name in raw_all:
            if not isinstance(name, str) or name in seen or name.startswith("_"):
                continue
            seen.add(name)
            try:
                v = getattr(mod, name)
                kind = "class" if inspect.isclass(v) else ("function" if callable(v) else ("module" if inspect.ismodule(v) else "variable"))
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

    # 2. Public members from dir(mod)
    for name in dir(mod):
        if name in seen or name.startswith("_"):
            continue
        seen.add(name)
        try:
            v = getattr(mod, name)
            kind = "class" if inspect.isclass(v) else ("function" if callable(v) else ("module" if inspect.ismodule(v) else "variable"))
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

    # 3. Submodules if package
    if hasattr(mod, "__path__"):
        try:
            for sub in pkgutil.iter_modules(mod.__path__):
                if sub.name not in seen and not sub.name.startswith("_"):
                    seen.add(sub.name)
                    items.append({"name": sub.name, "kind": "module", "doc": f"Submodule {mod_name}.{sub.name}", "sig": ""})
        except Exception:
            pass

    print(json.dumps(items))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[]")
        sys.exit(0)
    mod_name = sys.argv[1]
    ws_path = sys.argv[2] if len(sys.argv) > 2 else None
    introspect(mod_name, ws_path)
