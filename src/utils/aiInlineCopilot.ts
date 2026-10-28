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
  const memoryCache = new Map<string, string>();

  // Register for all languages via wildcard selector '*'
  monaco.languages.registerInlineCompletionsProvider('*', {
    provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
      // 1. Check if AI Copilot is enabled in user settings
      let isEnabled = true;
      try {
        const saved = localStorage.getItem('aura_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.aiCopilotEnabled === false) isEnabled = false;
        }
      } catch {}

      if (!isEnabled) return { items: [] };

      const modelUri = model.uri.toString();
      const lineContent = model.getLineContent(position.lineNumber);
      const isExplicit = context?.triggerKind === 1;

      // 2. Fast local prefix continuation check (instant 0ms response when continuing typing)
      if (lastResult && lastResult.modelUri === modelUri && lastResult.line === position.lineNumber) {
        if (position.column >= lastResult.col) {
          const typedSince = lineContent.substring(lastResult.col - 1, position.column - 1);
          if (lastResult.text.startsWith(typedSince)) {
            const remainder = lastResult.text.substring(typedSince.length);
            if (remainder) {
              const maxCol = model.getLineMaxColumn(position.lineNumber);
              return {
                items: [
                  {
                    insertText: remainder,
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, maxCol)
                  }
                ],
                enableForwardStability: true
              };
            }
          }
        }
      }

      // 3. Cooperative debounce: wait 280ms for typing pause (or instant if explicit Alt+\)
      if (!isExplicit) {
        await new Promise((resolve) => setTimeout(resolve, 280));
        if (token.isCancellationRequested) return { items: [] };
      }

      // 4. Rate-limit guard for Free Tier (15 RPM):
      // Automatic completions require at least 1200ms spacing between requests
      const now = Date.now();
      if (!isExplicit && now - lastFetchTime < 1200) {
        return { items: [] };
      }

      // Don't autocomplete if cursor is in middle of a word unless explicitly requested
      const charAfterCursor = lineContent.charAt(position.column - 1);
      if (charAfterCursor && /[a-zA-Z0-9_]/.test(charAfterCursor) && !isExplicit) {
        return { items: [] };
      }

      // 5. Build prefix & suffix context
      const offset = model.getOffsetAt(position);
      const fullText = model.getValue();
      const prefix = fullText.slice(0, offset);
      const suffix = fullText.slice(offset);

      if (!prefix.trim()) return { items: [] };

      const cacheKey = prefix.slice(-200) + ':::' + suffix.slice(0, 100);
      if (memoryCache.has(cacheKey)) {
        const cached = memoryCache.get(cacheKey)!;
        const maxCol = model.getLineMaxColumn(position.lineNumber);
        return {
          items: [
            {
              insertText: cached,
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, maxCol)
            }
          ],
          enableForwardStability: true
        };
      }

      const language = model.getLanguageId();
      const filename = model.uri.path ? model.uri.path.split('/').pop() : 'code';

      lastFetchTime = Date.now();

      try {
        const res = await fetch('/api/ai/inline-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, suffix, language, filename })
        });

        if (token.isCancellationRequested) return { items: [] };
        if (!res.ok) return { items: [] };

        const data = await res.json();
        let text = data.completion;
        if (!text || typeof text !== 'string' || !text.trim()) return { items: [] };

        // Strip leading newlines if cursor is at end of line
        if (text.startsWith('\n') && lineContent.trim()) {
          // Keep newline
        }

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

        const maxCol = model.getLineMaxColumn(position.lineNumber);

        return {
          items: [
            {
              insertText: text,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                maxCol
              )
            }
          ],
          enableForwardStability: true
        };
      } catch {
        return { items: [] };
      }
    },
    disposeInlineCompletions: () => {},
    freeInlineCompletions: () => {}
  });
}
