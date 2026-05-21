import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelectedModel, useSetSelectedModel } from '../stores/useAura';
import { Cpu, ChevronDown, Check } from 'lucide-react';

interface ProviderGroup {
  id: string;
  name: string;
  hasKey: boolean;
  models: Array<{ id: string; label: string }>;
}

export function ModelSelector() {
  const selectedModel = useSelectedModel();
  const setSelectedModel = useSetSelectedModel();
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        const data = res.ok ? await res.json() : null;
        if (data && Array.isArray(data.providers)) {
          // Only show providers that have keys
          const active = data.providers.filter((p: ProviderGroup) => p.hasKey);
          setProviders(active);
        }
      } catch (err) {
        console.error('Failed to fetch models for selector:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchModels();
  }, []);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleSelect = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    setOpen(false);
  }, [setSelectedModel]);

  // Derive display label for the selected model
  const selectedLabel = React.useMemo(() => {
    if (selectedModel === 'auto' || !selectedModel) return 'AUTO';
    // Try to find the label from providers
    for (const p of providers) {
      const m = p.models.find(mod => mod.id === selectedModel);
      if (m) return m.label;
    }
    // Fallback: clean up the ID
    const parts = selectedModel.split(':');
    const raw = parts.length > 1 ? parts[1] : selectedModel;
    const short = raw.split('/').pop() || raw;
    return short.length > 18 ? short.slice(0, 18) + '…' : short;
  }, [selectedModel, providers]);

  // Derive provider color dot for the selected model
  const selectedProvider = React.useMemo(() => {
    if (selectedModel === 'auto') return null;
    const pid = selectedModel.split(':')[0];
    return pid;
  }, [selectedModel]);

  const totalModels = providers.reduce((sum, p) => sum + p.models.length, 0);

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        disabled={loading || totalModels === 0}
        className={`
          inline-flex items-center gap-1.5 px-2 py-1 rounded-md
          text-[10px] font-mono tracking-wide
          border transition-all duration-150
          ${open
            ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
            : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] hover:text-white/60'
          }
          ${loading || totalModels === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        title={selectedModel !== 'auto' ? selectedModel : 'Auto-routing'}
      >
        <Cpu size={11} className={open ? 'text-indigo-400' : 'text-white/30'} />
        <span className="max-w-[120px] truncate">{selectedLabel}</span>
        <ChevronDown
          size={11}
          className={`transition-transform duration-200 ${open ? 'rotate-180 text-indigo-400' : 'text-white/25'}`}
        />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 mb-2 z-50 w-64 max-h-[320px] overflow-y-auto rounded-lg border border-white/[0.08] bg-[#0d0d1a] shadow-xl shadow-black/40 backdrop-blur-xl"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 px-3 py-2 border-b border-white/[0.06] bg-[#0d0d1a]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-white/25 uppercase tracking-wider">Model</span>
              <span className="text-[8px] font-mono text-white/15">{totalModels} available</span>
            </div>
          </div>

          {/* Auto option */}
          <button
            onClick={() => handleSelect('auto')}
            className={`
              w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
              ${selectedModel === 'auto' || !selectedModel
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-white/50 hover:bg-white/[0.03] hover:text-white/70'
              }
            `}
          >
            <span className="w-3.5 flex justify-center">
              {(selectedModel === 'auto' || !selectedModel) && (
                <Check size={12} className="text-indigo-400" />
              )}
            </span>
            <div className="flex flex-col">
              <span className="text-[11px] font-mono">AUTO</span>
              <span className="text-[8px] text-white/25">Route to best model</span>
            </div>
          </button>

          {/* Providers & Models */}
          {providers.map(provider => (
            <div key={provider.id}>
              <div className="px-3 py-1.5 text-[8px] font-mono text-white/20 uppercase tracking-wider border-t border-white/[0.04]">
                {provider.name}
              </div>
              {provider.models.map(model => {
                const isActive = selectedModel === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(model.id)}
                    className={`
                      w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors
                      ${isActive
                        ? 'bg-indigo-500/10 text-indigo-300'
                        : 'text-white/40 hover:bg-white/[0.03] hover:text-white/60'
                      }
                    `}
                    title={model.id}
                  >
                    <span className="w-3.5 flex justify-center shrink-0">
                      {isActive && <Check size={12} className="text-indigo-400" />}
                    </span>
                    <span className="text-[10px] font-mono truncate">{model.label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {totalModels === 0 && !loading && (
            <div className="px-3 py-4 text-center text-[10px] text-white/20 font-mono">
              No models available.
              <br />
              <span className="text-white/15">Check API keys in Settings.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
