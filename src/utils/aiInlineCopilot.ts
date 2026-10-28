// AI Inline Code Autocomplete Engine (Copilot Style using Gemini 3.1 Flash-Lite)
let isCopilotRegistered = false;

interface CacheEntry {
  text: string;
  line: number;
  col: number;
  modelUri: string;
}

export function registerAiInlineCopilot(monaco: any) {
  if (isCopilotRegistered || !monaco || !monaco.languages || !monaco.languages.registerInlineCompletionsProvider) {
    return;
  }
  isCopilotRegistered = true;

  let lastFetchTime = 0;
  let lastResult: CacheEntry | null = null;
  let activeAbortController: AbortController | null = null;
  const memoryCache = new Map<string, string>();

  monaco.languages.registerInlineCompletionsProvider('*', {
    provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
      let isEnabled = true;
      try {
        const saved = localStorage.getItem('aura_settings');
        if (saved && JSON.parse(saved).aiCopilotEnabled === false) {
          isEnabled = false;
        }
      } catch {}

      if (!isEnabled) return { items: [] };

      const modelUri = model.uri.toString();
      const lineContent = model.getLineContent(position.lineNumber);
      const isExplicit = context?.triggerKind === 1;

      // 1. Local prefix continuation check (instant 0ms response when continuing typing)
      if (lastResult && lastResult.modelUri === modelUri && lastResult.line === position.lineNumber) {
        if (position.column >= lastResult.col) {
          const typedSince = lineContent.substring(lastResult.col - 1, position.column - 1);
          if (lastResult.text.startsWith(typedSince)) {
            const remainder = lastResult.text.substring(typedSince.length);
            if (remainder) {
              return {
                items: [{
                  insertText: remainder,
                  range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                }],
                enableForwardStability: true
              };
            }
          }
        }
      }

      // Do not autocomplete inside a word unless explicitly requested (Alt+\)
      const charAfterCursor = lineContent.charAt(position.column - 1);
      if (charAfterCursor && /[a-zA-Z0-9_]/.test(charAfterCursor) && !isExplicit) {
        return { items: [] };
      }

      // 2. Smart debounce considering rate-limit window
      if (!isExplicit) {
        const elapsedSinceLastFetch = Date.now() - lastFetchTime;
        const requiredWait = Math.max(350, 1200 - elapsedSinceLastFetch);
        await new Promise((resolve) => setTimeout(resolve, requiredWait));
        if (token.isCancellationRequested) return { items: [] };
      }

      const offset = model.getOffsetAt(position);
      const fullText = model.getValue();
      const prefix = fullText.slice(0, offset);
      const suffix = fullText.slice(offset);

      if (!prefix.trim()) return { items: [] };

      const cacheKey = `${prefix.slice(-200)}:::${suffix.slice(0, 100)}`;
      if (memoryCache.has(cacheKey)) {
        const cached = memoryCache.get(cacheKey)!;
        return {
          items: [{
            insertText: cached,
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
          }],
          enableForwardStability: true
        };
      }

      // Abort previous pending fetch
      if (activeAbortController) {
        activeAbortController.abort();
      }
      const controller = new AbortController();
      activeAbortController = controller;

      const cancelDisposable = token.onCancellationRequested?.(() => {
        controller.abort();
      });

      const language = model.getLanguageId();
      const filename = model.uri.path ? model.uri.path.split('/').pop() : 'code';
      lastFetchTime = Date.now();

      try {
        const res = await fetch('/api/ai/inline-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, suffix, language, filename }),
          signal: controller.signal,
        });

        if (token.isCancellationRequested || !res.ok) return { items: [] };

        const data = await res.json();
        const text = data.completion;
        if (!text || typeof text !== 'string' || !text.trim()) return { items: [] };

        memoryCache.set(cacheKey, text);
        if (memoryCache.size > 150) {
          const firstKey = memoryCache.keys().next().value;
          if (firstKey) memoryCache.delete(firstKey);
        }

        lastResult = {
          text,
          line: position.lineNumber,
          col: position.column,
          modelUri
        };

        return {
          items: [{
            insertText: text,
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
          }],
          enableForwardStability: true
        };
      } catch {
        return { items: [] };
      } finally {
        cancelDisposable?.dispose?.();
      }
    },
    disposeInlineCompletions: () => {},
    freeInlineCompletions: () => {}
  });
}
