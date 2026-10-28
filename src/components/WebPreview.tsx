import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  RotateCw, 
  ExternalLink, 
  X, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Globe, 
  ArrowLeft, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

interface WebPreviewProps {
  initialUrl?: string;
  onClose: () => void;
  width?: number;
  onWidthChange?: (width: number) => void;
}

export const WebPreview: React.FC<WebPreviewProps> = ({
  initialUrl = '/preview/index.html',
  onClose,
  width = 540,
  onWidthChange,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeKey, setIframeKey] = useState(0);
  const [useProxy, setUseProxy] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('aura_preview_width');
    return saved ? parseInt(saved, 10) : (width || 540);
  });
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync when user switches active HTML tab
  useEffect(() => {
    setUrl(initialUrl);
    setInputUrl(initialUrl);
    setIframeKey(k => k + 1);
  }, [initialUrl]);

  // Handle Drag Resizing
  const updateWidth = useCallback((newWidth: number) => {
    const clamped = Math.min(Math.max(newWidth, 280), window.innerWidth - 300);
    setPanelWidth(clamped);
    localStorage.setItem('aura_preview_width', clamped.toString());
    onWidthChange?.(clamped);
  }, [onWidthChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rightEdge = containerRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      const newWidth = rightEdge - e.clientX;
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

  const handleRefresh = () => {
    setIframeKey(k => k + 1);
  };

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    let target = inputUrl.trim();

    // Check if target is an external URL
    if (target.startsWith('http://') || target.startsWith('https://')) {
      setUrl(target);
    } else if (target.startsWith('/preview/') || target.startsWith('/')) {
      setUrl(target);
    } else if (target.includes('.') && (target.includes('.com') || target.includes('.org') || target.includes('.net') || target.includes('.io') || target.includes('localhost'))) {
      const full = target.startsWith('localhost') ? `http://${target}` : `https://${target}`;
      setUrl(full);
      setInputUrl(full);
    } else {
      // Local workspace file
      const cleanPath = target.startsWith('/') ? target : `/${target}`;
      const localUrl = `/preview${cleanPath}`;
      setUrl(localUrl);
      setInputUrl(localUrl);
    }
    setIframeKey(k => k + 1);
  };

  const openExternal = () => {
    const fullUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
    window.open(fullUrl, '_blank');
  };

  const getContainerWidth = () => {
    switch (deviceMode) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      default:
        return '100%';
    }
  };

  const effectiveIframeSrc = useProxy && (url.startsWith('http://') || url.startsWith('https://'))
    ? `/proxy?url=${encodeURIComponent(url)}`
    : url;

  return (
    <div 
      ref={containerRef}
      style={{ width: `${panelWidth}px` }}
      className="relative flex flex-col h-full bg-[var(--bg-primary)] border-l border-[var(--border-subtle)] overflow-hidden select-none shrink-0 shadow-2xl z-20"
    >
      {/* Left Resizer Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        title="Drag to resize Web Browser Preview"
        className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-50 flex items-center justify-center group hover:bg-[var(--accent-subtle)] transition-colors"
      >
        <div className="w-1 h-8 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--accent-color)] transition-colors" />
      </div>

      {/* Transparent drag overlay to prevent iframe mouse trapping */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize bg-transparent select-none" />
      )}

      {/* Browser Toolbar */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-x-2 text-xs shrink-0">
        {/* Navigation & Refresh */}
        <div className="flex items-center space-x-1 text-[var(--text-secondary)]">
          <button
            onClick={() => {
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.history.back();
              }
            }}
            title="Back"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.history.forward();
              }
            }}
            title="Forward"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleRefresh}
            title="Reload Preview"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Address Bar */}
        <form onSubmit={handleNavigate} className="flex-1 max-w-md">
          <div className="h-6 px-2.5 flex items-center space-x-1.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[11px]">
            <Globe className="w-3 h-3 text-[var(--accent-color)] shrink-0" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 bg-transparent text-[var(--text-primary)] outline-none"
              placeholder="/preview/index.html or https://example.com"
            />
            <span className="text-[9px] text-[var(--text-secondary)] uppercase shrink-0 font-sans">
              {url.startsWith('https') ? 'HTTPS' : (url.startsWith('http') ? 'HTTP' : 'LOCAL')}
            </span>
          </div>
        </form>

        {/* Device Mode Switchers & Actions */}
        <div className="flex items-center space-x-1 text-[var(--text-secondary)]">
          <div className="flex items-center bg-[var(--bg-primary)] rounded-md p-0.5 border border-[var(--border-subtle)]">
            <button
              onClick={() => setDeviceMode('desktop')}
              title="Responsive (100%)"
              className={`p-1 rounded ${deviceMode === 'desktop' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'hover:text-[var(--text-primary)]'}`}
            >
              <Monitor className="w-3 h-3" />
            </button>
            <button
              onClick={() => setDeviceMode('tablet')}
              title="Tablet (768px)"
              className={`p-1 rounded ${deviceMode === 'tablet' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'hover:text-[var(--text-primary)]'}`}
            >
              <Tablet className="w-3 h-3" />
            </button>
            <button
              onClick={() => setDeviceMode('mobile')}
              title="Mobile (375px)"
              className={`p-1 rounded ${deviceMode === 'mobile' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'hover:text-[var(--text-primary)]'}`}
            >
              <Smartphone className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={() => {
              setUseProxy(p => !p);
              setIframeKey(k => k + 1);
            }}
            title={useProxy ? "Disable Proxy Mode (CORS Bypass: ON)" : "Enable Proxy Mode (CORS / X-Frame Bypass)"}
            className={`p-1 rounded transition-colors ${useProxy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={openExternal}
            title="Open in System Browser"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClose}
            title="Close Preview"
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Frame Viewport */}
      <div className="flex-1 w-full bg-[var(--bg-primary)] overflow-auto flex items-start justify-center p-2">
        <div 
          style={{ width: getContainerWidth() }}
          className="h-full bg-white shadow-lg rounded-b overflow-hidden transition-all duration-200 border border-[var(--border-subtle)]"
        >
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={effectiveIframeSrc}
            title="Workspace Web Preview"
            className="w-full h-full border-0"
            allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write;"
          />
        </div>
      </div>
    </div>
  );
};
