import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Search, 
  RefreshCw, 
  X, 
  ExternalLink,
  Send,
  Bot,
  User,
  Copy,
  Check,
  Code2,
  FileCode,
  Trash2,
  CornerDownLeft,
  Bug,
  Zap,
  FileCheck,
  Plus,
  MessageSquare,
  ChevronDown
} from 'lucide-react';
import { MarkdownView } from './MarkdownView';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface AiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  width?: number;
  onWidthChange?: (width: number) => void;
  activeTab?: {
    name: string;
    language: string;
    content: string;
  } | null;
  activeCodeSelection?: string;
  service?: 'gemini' | 'google' | 'deepseek';
  onServiceChange?: (service: 'gemini' | 'google' | 'deepseek') => void;
  onInsertCode?: (code: string) => void;
  onDiffCode?: (code: string) => void;
}

export const AiPanel: React.FC<AiPanelProps> = ({
  isOpen,
  onClose,
  width = 460,
  onWidthChange,
  activeTab,
  activeCodeSelection,
  service,
  onServiceChange,
  onInsertCode,
  onDiffCode,
}) => {
  const [activeService, setActiveService] = useState<'gemini' | 'google' | 'deepseek'>(service || 'gemini');

  useEffect(() => {
    if (service && service !== activeService) {
      setActiveService(service);
    }
  }, [service]);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('aura_ai_panel_width');
    return saved ? parseInt(saved, 10) : (width || 460);
  });
  const [isDragging, setIsDragging] = useState(false);

  // Gemini Multi-Chat Session State
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('aura_gemini_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    // Migrate legacy single chat history if exists
    const legacyHistory = localStorage.getItem('aura_gemini_chat_history');
    let legacyMsgs: ChatMessage[] = [];
    if (legacyHistory) {
      try { legacyMsgs = JSON.parse(legacyHistory); } catch {}
    }
    const defaultMessages: ChatMessage[] = legacyMsgs.length > 0 ? legacyMsgs : [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Привет! Я встроенный ИИ-ассистент Aura IDE на базе **Gemini 3.1 Flash-Lite**.\n\nЗадай мне любой вопрос, попроси написать код, найти ошибки в текущем файле или объяснить алгоритм.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
    return [{
      id: `session-${Date.now()}`,
      title: 'Основной диалог',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: defaultMessages
    }];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const savedId = localStorage.getItem('aura_gemini_active_session_id');
    if (savedId) return savedId;
    return sessions[0]?.id || `session-${Date.now()}`;
  });

  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const googleIframeRef = useRef<HTMLIFrameElement>(null);
  const deepseekIframeRef = useRef<HTMLIFrameElement>(null);

  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0] || {
    id: 'fallback',
    title: 'Диалог',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };
  const messages = currentSession.messages;

  // Persist sessions
  useEffect(() => {
    try {
      localStorage.setItem('aura_gemini_sessions', JSON.stringify(sessions));
      localStorage.setItem('aura_gemini_active_session_id', activeSessionId);
    } catch {}
  }, [sessions, activeSessionId]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (activeService === 'gemini') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeService, isLoading]);

  // Synchronize width updates
  const updateWidth = useCallback((newWidth: number) => {
    const clamped = Math.min(Math.max(newWidth, 340), window.innerWidth - 300);
    setPanelWidth(clamped);
    localStorage.setItem('aura_ai_panel_width', clamped.toString());
    onWidthChange?.(clamped);
  }, [onWidthChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX;
      updateWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateWidth]);

  if (!isOpen) return null;

  const createNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: 'Новый чат',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: 'Привет! Начат новый диалог с **Gemini 3.1 Flash-Lite**. Чем могу помочь?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    setIsSessionsDrawerOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const deleteSession = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      if (filtered.length === 0) {
        const freshId = `session-${Date.now()}`;
        const freshSession: ChatSession = {
          id: freshId,
          title: 'Новый чат',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [
            {
              id: `welcome-${Date.now()}`,
              role: 'assistant',
              content: 'Привет! Чем могу помочь?',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]
        };
        setActiveSessionId(freshId);
        return [freshSession];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputValue).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const targetSessionId = currentSession.id;
    const newHistory = [...messages, userMsg];

    // Auto-update title if it's default
    let updatedTitle = currentSession.title;
    if (currentSession.title === 'Новый чат' || currentSession.title === 'Основной диалог') {
      const clean = textToSend.replace(/\n.*/s, '').trim();
      updatedTitle = clean.length > 28 ? clean.slice(0, 28) + '...' : clean;
    }

    setSessions(prev => prev.map(s => {
      if (s.id === targetSessionId) {
        return {
          ...s,
          title: updatedTitle,
          updatedAt: Date.now(),
          messages: newHistory
        };
      }
      return s;
    }));

    if (!customPrompt) setInputValue('');
    setIsLoading(true);

    try {
      const context = activeTab ? {
        code: activeCodeSelection ? activeCodeSelection : activeTab.content,
        selection: activeCodeSelection || undefined,
        fullCode: activeCodeSelection ? activeTab.content : undefined,
        filename: activeTab.name,
        language: activeTab.language
      } : undefined;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
          context
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const replyText = data.reply || 'Извините, не удалось сформировать ответ.';

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setSessions(prev => prev.map(s => {
        if (s.id === targetSessionId) {
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [...newHistory, botMsg]
          };
        }
        return s;
      }));
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Ошибка запроса к ИИ: ${err.message || 'Сбой сети'}. Проверьте доступность API и лимиты.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setSessions(prev => prev.map(s => {
        if (s.id === targetSessionId) {
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [...newHistory, errMsg]
          };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleClearHistory = () => {
    const fresh: ChatMessage[] = [
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: 'История чата очищена. Чем я могу помочь?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: 'Новый чат',
          updatedAt: Date.now(),
          messages: fresh
        };
      }
      return s;
    }));
  };

  const handleReloadWeb = () => {
    if (activeService === 'deepseek' && deepseekIframeRef.current) {
      deepseekIframeRef.current.src = 'https://chat.deepseek.com';
    } else if (activeService === 'google' && googleIframeRef.current) {
      googleIframeRef.current.src = '/proxy?url=https://www.google.com/search?q=&udm=50';
    }
  };

  const handleSwitchService = (next: 'gemini' | 'google' | 'deepseek') => {
    setActiveService(next);
    onServiceChange?.(next);
  };

  const openInBrowser = () => {
    const url = activeService === 'deepseek' ? 'https://chat.deepseek.com' : 'https://www.google.com/search?q=&udm=50';
    window.open(url, '_blank');
  };

  return (
    <div 
      style={{ width: `${panelWidth}px` }}
      className="relative h-full flex flex-col bg-[var(--bg-secondary)] border-l border-[var(--border-subtle)] text-[var(--text-primary)] select-none shrink-0 shadow-2xl z-20"
    >
      {/* Left Resizer Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        title="Перетащите для изменения ширины ИИ-панели"
        className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-50 flex items-center justify-center group hover:bg-[var(--accent-color)]/20 transition-colors"
      >
        <div className="w-1 h-8 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--accent-color)] transition-colors" />
      </div>

      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize bg-transparent select-none" />
      )}

      {/* Top Bar Switcher */}
      <div className="h-10 px-2.5 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] shrink-0">
        <div className="p-0.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center space-x-1">
          <button
            onClick={() => handleSwitchService('gemini')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
              activeService === 'gemini'
                ? 'bg-[var(--accent-color)] text-[var(--accent-text)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Gemini AI</span>
          </button>

          <button
            onClick={() => handleSwitchService('google')}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-all ${
              activeService === 'google'
                ? 'bg-[var(--accent-color)] text-[var(--accent-text)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Google</span>
          </button>

          <button
            onClick={() => handleSwitchService('deepseek')}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-all ${
              activeService === 'deepseek'
                ? 'bg-[var(--accent-color)] text-[var(--accent-text)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <span>DeepSeek</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1 text-[var(--text-secondary)]">
          {activeService === 'gemini' && (
            <button
              onClick={handleClearHistory}
              title="Очистить текущий диалог"
              className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {activeService !== 'gemini' && (
            <>
              <button
                onClick={handleReloadWeb}
                title="Обновить страницу"
                className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={openInBrowser}
                title="Открыть в браузере"
                className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            onClick={onClose}
            title="Закрыть ИИ-панель"
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 w-full flex flex-col overflow-hidden relative">
        {/* TAB 1: Native Gemini AI Assistant */}
        {activeService === 'gemini' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
            {/* Multi-Session Header Bar */}
            <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center justify-between text-xs shrink-0">
              <button
                onClick={() => setIsSessionsDrawerOpen(!isSessionsDrawerOpen)}
                className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition text-xs max-w-[260px] truncate"
                title="История чатов / Переключение диалогов"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />
                <span className="truncate font-medium">{currentSession.title}</span>
                <span className="text-[10px] text-[var(--text-secondary)] shrink-0">({currentSession.messages.filter(m => m.role === 'user').length})</span>
                <ChevronDown className="w-3 h-3 text-[var(--text-secondary)] opacity-70 shrink-0" />
              </button>

              <button
                onClick={createNewSession}
                title="Создать новый диалог (+)"
                className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-[var(--accent-color)] text-[var(--accent-text)] hover:opacity-90 transition text-xs font-medium shadow-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Новый чат</span>
              </button>
            </div>

            {/* Sessions Drawer Dropdown / List */}
            {isSessionsDrawerOpen && (
              <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-2 space-y-1 max-h-56 overflow-y-auto shadow-inner select-none z-10 shrink-0">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                  <span>Диалоги с Gemini ({sessions.length})</span>
                  <button
                    onClick={createNewSession}
                    className="flex items-center space-x-1 text-[var(--accent-color)] hover:underline"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Создать</span>
                  </button>
                </div>
                {sessions.map((sess) => {
                  const isActive = sess.id === activeSessionId;
                  const userCount = sess.messages.filter(m => m.role === 'user').length;
                  const dateStr = new Date(sess.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div
                      key={sess.id}
                      onClick={() => {
                        setActiveSessionId(sess.id);
                        setIsSessionsDrawerOpen(false);
                      }}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                        isActive
                          ? 'bg-[var(--accent-subtle)] text-[var(--accent-color)] border border-[var(--accent-color)]/30 font-medium'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[var(--accent-color)]' : 'text-[var(--text-secondary)]'}`} />
                        <div className="min-w-0">
                          <p className="text-xs truncate">{sess.title}</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">{dateStr} · {userCount} {userCount === 1 ? 'запрос' : userCount >= 2 && userCount <= 4 ? 'запроса' : 'запросов'}</p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => deleteSession(sess.id, e)}
                        title="Удалить этот чат"
                        className="p-1 rounded hover:bg-rose-500/20 hover:text-rose-400 text-[var(--text-secondary)] transition opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Context Chips Bar */}
            <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center space-x-1.5 overflow-x-auto no-scrollbar text-[11px] shrink-0">
              <span className="text-[var(--text-secondary)] shrink-0 font-medium">Действия:</span>
              <button
                onClick={() => handleSendMessage(activeCodeSelection ? 'Объясни выделенный фрагмент кода и как он работает.' : 'Объясни структуру и логику этого файла.')}
                disabled={!activeTab || isLoading}
                className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] shrink-0 transition disabled:opacity-40"
              >
                <Code2 className="w-3 h-3 text-emerald-400" />
                <span>Объяснить</span>
              </button>
              <button
                onClick={() => handleSendMessage(activeCodeSelection ? 'Проанализируй выделенный фрагмент кода и найди потенциальные ошибки, баги или утечки.' : 'Проанализируй код в файле и найди потенциальные ошибки, баги или утечки.')}
                disabled={!activeTab || isLoading}
                className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] shrink-0 transition disabled:opacity-40"
              >
                <Bug className="w-3 h-3 text-amber-400" />
                <span>Найти баги</span>
              </button>
              <button
                onClick={() => handleSendMessage(activeCodeSelection ? 'Оптимизируй выделенный фрагмент кода для максимальной производительности и читаемости.' : 'Оптимизируй этот код для максимальной производительности и читаемости.')}
                disabled={!activeTab || isLoading}
                className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] shrink-0 transition disabled:opacity-40"
              >
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>Оптимизировать</span>
              </button>
              <button
                onClick={() => handleSendMessage(activeCodeSelection ? 'Напиши юнит-тесты для выделенного фрагмента кода.' : 'Напиши юнит-тесты для функций этого файла.')}
                disabled={!activeTab || isLoading}
                className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] shrink-0 transition disabled:opacity-40"
              >
                <FileCheck className="w-3 h-3 text-purple-400" />
                <span>Тесты</span>
              </button>
            </div>

            {/* Messages Chat List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3.5 select-text text-xs leading-relaxed">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-1.5 mb-1 px-1">
                      {isUser ? (
                        <>
                          <span className="text-[10px] text-[var(--text-secondary)]">{msg.timestamp}</span>
                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">Вы</span>
                          <User className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Bot className="w-3 h-3" />
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-400">Aura AI (Gemini Flash-Lite)</span>
                          <span className="text-[10px] text-[var(--text-secondary)]">{msg.timestamp}</span>
                        </>
                      )}
                    </div>

                    <div 
                      className={`max-w-[92%] rounded-xl px-3.5 py-2.5 shadow-sm text-xs ${
                        isUser 
                          ? 'bg-[var(--accent-color)] text-[var(--accent-text)] rounded-tr-none whitespace-pre-wrap' 
                          : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-tl-none'
                      }`}
                    >
                      {isUser ? (
                        msg.content
                      ) : (
                        <MarkdownView content={msg.content} onInsertCode={onInsertCode} onDiffCode={onDiffCode} />
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center space-x-1.5 mb-1 px-1">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse">
                      <Bot className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400">Aura AI генерирует ответ...</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center space-x-2 text-xs text-[var(--text-secondary)]">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Gemini 3.1 Flash-Lite анализирует запрос...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-sidebar)] shrink-0">
              {activeCodeSelection ? (
                <div className="flex items-center space-x-1.5 mb-1.5 text-[10px] text-[var(--accent-color)] px-1.5 py-0.5 rounded bg-[var(--accent-subtle)] truncate">
                  <Code2 className="w-3 h-3 text-[var(--accent-color)] shrink-0" />
                  <span className="truncate">Выделено строк: {activeCodeSelection.split('\n').length} (в приоритете контекста)</span>
                </div>
              ) : activeTab ? (
                <div className="flex items-center space-x-1.5 mb-1.5 text-[10px] text-[var(--text-secondary)] px-1 truncate">
                  <FileCode className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">Контекст: {activeTab.name}</span>
                </div>
              ) : null}

              <div className="flex items-end space-x-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] focus-within:border-[var(--accent-color)] rounded-xl p-1.5 transition">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Спроси Aura AI или нажми Enter..."
                  rows={2}
                  className="flex-1 bg-transparent border-0 resize-none outline-none text-xs text-[var(--text-primary)] placeholder-zinc-500 px-1 py-0.5 leading-relaxed max-h-24 select-text"
                />

                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isLoading}
                  title="Отправить (Enter)"
                  className="p-2 rounded-lg bg-[var(--accent-color)] text-[var(--accent-text)] hover:opacity-90 disabled:opacity-30 disabled:hover:opacity-30 transition shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Google Search AI Frame */}
        {activeService === 'google' && (
          <div className="w-full h-full absolute inset-0 bg-white">
            <iframe
              ref={googleIframeRef}
              src="/proxy?url=https://www.google.com/search?q=&udm=50"
              title="Google Search AI"
              allow="clipboard-read; clipboard-write; microphone"
              className="w-full h-full border-0"
            />
          </div>
        )}

        {/* TAB 3: DeepSeek Chat Frame */}
        {activeService === 'deepseek' && (
          <div className="w-full h-full absolute inset-0 bg-white">
            <iframe
              ref={deepseekIframeRef}
              src="https://chat.deepseek.com"
              title="DeepSeek AI Chat"
              allow="clipboard-read; clipboard-write; microphone; camera"
              className="w-full h-full border-0"
            />
          </div>
        )}
      </div>
    </div>
  );
};
