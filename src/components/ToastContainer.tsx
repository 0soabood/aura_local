import React, { useEffect, useState, useCallback } from 'react';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastListeners: ((toast: Toast) => void)[] = [];

export function showToast(message: string, type: ToastType = 'info', duration = 4000) {
  const toast: Toast = { id: crypto.randomUUID(), type, message, duration };
  toastListeners.forEach(l => l(toast));
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts(prev => [...prev, toast]);
      if (toast.duration && toast.duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id));
        }, toast.duration);
      }
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  const typeStyles: Record<ToastType, string> = {
    info: 'bg-indigo-500/15 border-indigo-500/25 text-indigo-300',
    success: 'bg-green-500/15 border-green-500/25 text-green-300',
    error: 'bg-rose-500/15 border-rose-500/25 text-rose-300',
    warning: 'bg-amber-500/15 border-amber-500/25 text-amber-300',
  };

  const typeIcons: Record<ToastType, string> = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  };

  return (
    <div className="fixed bottom-20 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border backdrop-blur-md text-[11px] font-mono shadow-lg animate-in slide-in-from-right transition-all ${typeStyles[toast.type]}`}
          style={{ animation: 'slideIn 0.2s ease-out' }}
        >
          <span className="text-[12px] leading-none mt-0.5">{typeIcons[toast.type]}</span>
          <span className="flex-1 leading-relaxed">{toast.message}</span>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-white/30 hover:text-white/70 transition-colors leading-none ml-1"
          >
            ✕
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};
