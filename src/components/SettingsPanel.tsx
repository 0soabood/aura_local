import React, { useState } from 'react';
import {
  useEnergyMode,
  useSetEnergyMode,
  useBrainDumpMode,
  useSetBrainDumpMode,
  useSelectedModel,
  useSetSelectedModel,
  useAgentModelOverrides,
  useSetModelForAgent,
} from '../stores/useAura';

interface ModelEntry {
  id: string;
  label: string;
  provider: string;
  free: boolean;
}

interface ProviderKeyInfo {
  id: string;
  envKey: string;
  hasEnvKey: boolean;
  hasUserKey: boolean;
  maskedPreview: string | null;
  source: 'env' | 'user' | 'none';
}

export const SettingsPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const energyMode = useEnergyMode();
  const setEnergyMode = useSetEnergyMode();
  const brainDumpMode = useBrainDumpMode();
  const setBrainDumpMode = useSetBrainDumpMode();
  const selectedModel = useSelectedModel();
  const setSelectedModel = useSetSelectedModel();
  const agentOverrides = useAgentModelOverrides();
  const setModelForAgent = useSetModelForAgent();

  const [models, setModels] = useState<ModelEntry[]>([]);
  const [search, setSearch] = useState('');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [providerKeys, setProviderKeys] = useState<ProviderKeyInfo[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keySaving, setKeySaving] = useState(false);

  React.useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(d => {
        const all: ModelEntry[] = [];
        d.providers?.forEach((p: any) => {
          p.models?.forEach((m: any) => {
            all.push({
              id: m.id,
              label: m.label,
              provider: p.id,
              free: m.id.includes(':free') || p.id === 'groq',
            });
          });
        });
        setModels(all);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    fetch('/api/providers/keys')
      .then(r => r.json())
      .then(d => setProviderKeys(d.providers || []))
      .catch(() => {});
  }, []);

  const refreshKeys = () => {
    fetch('/api/providers/keys')
      .then(r => r.json())
      .then(d => setProviderKeys(d.providers || []))
      .catch(() => {});
  };

  const saveKey = async (providerId: string) => {
    setKeySaving(true);
    try {
      const res = await fetch(`/api/providers/keys/${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyInput }),
      });
      if (res.ok) {
        refreshKeys();
        setEditingKey(null);
        setKeyInput('');
      }
    } finally {
      setKeySaving(false);
    }
  };

  const clearKey = async (providerId: string) => {
    await fetch(`/api/providers/keys/${providerId}`, { method: 'DELETE' });
    refreshKeys();
  };

  const filtered = models.filter(m => {
    const matchSearch = !search || m.label.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase());
    const matchProvider = filterProvider === 'all' || m.provider === filterProvider;
    return matchSearch && matchProvider;
  });

  const freeCount = models.filter(m => m.free).length;
  const providers = [...new Set(models.map(m => m.provider))];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0 flex items-center justify-between">
        <span className="text-xs font-mono text-white/40 tracking-wider">SETTINGS</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[10px] text-white/20 hover:text-white/50 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.03]"
            title="Close panel"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Energy Mode */}
        <div>
          <div className="text-[10px] font-mono text-white/25 mb-2 tracking-wider">ENERGY MODE</div>
          <div className="flex gap-1.5">
            {(['low', 'high'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setEnergyMode(mode)}
                className={`flex-1 py-2 rounded-lg text-xs font-mono transition-all border ${
                  energyMode === mode
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/35'
                    : 'bg-white/[0.03] text-white/35 border-white/8 hover:border-white/15'
                }`}
              >
                {mode === 'low' ? '⚡ Low' : '🔥 High'}
              </button>
            ))}
          </div>
        </div>

        {/* Brain Dump Mode */}
        <div>
          <div className="text-[10px] font-mono text-white/25 mb-2 tracking-wider">BRAIN DUMP</div>
          <button
            onClick={() => setBrainDumpMode(!brainDumpMode)}
            className={`w-full py-2 rounded-lg text-xs font-mono transition-all border ${
              brainDumpMode
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                : 'bg-white/[0.03] text-white/35 border-white/8 hover:border-white/15'
            }`}
          >
            {brainDumpMode ? '🧠 ON — Decompose vague goals' : '🧠 OFF — Standard mode'}
          </button>
        </div>

        {/* BYOK: API Keys */}
        <div>
          <div className="text-[10px] font-mono text-white/25 mb-2 tracking-wider flex items-center justify-between">
            <span>API KEYS (BYOK)</span>
            <span className="text-[8px] text-white/15">Bring Your Own Key</span>
          </div>
          <div className="space-y-2">
            {providerKeys.length === 0 && (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <div className="text-[10px] text-white/30 mb-2">No provider keys loaded.</div>
                <button
                  onClick={refreshKeys}
                  className="w-full py-1.5 rounded text-[9px] font-mono bg-indigo-500/10 text-indigo-300/60 hover:text-indigo-300 border border-indigo-500/15 transition-colors"
                >
                  Retry loading keys
                </button>
                <div className="text-[9px] text-white/15 mt-2 leading-relaxed">
                  If this persists, ensure the AURA server is running and API keys are set in <code className="text-white/25">.env.local</code>.
                </div>
              </div>
            )}
            {providerKeys.map(pk => {
              const hasKey = pk.source !== 'none';
              const isEnv = pk.source === 'env';
              const isUser = pk.source === 'user';
              return (
                <div key={pk.id} className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isEnv ? 'bg-blue-400' : isUser ? 'bg-green-400' : 'bg-white/15'
                      }`} />
                      <span className="text-[10px] font-mono text-white/60">{pk.id.toUpperCase()}</span>
                      <span className="text-[8px] font-mono text-white/20">
                        {isEnv ? '(env)' : isUser ? '(yours)' : '(none)'}
                      </span>
                    </div>
                    {hasKey && (
                      <span className="text-[9px] font-mono text-white/25">{pk.maskedPreview}</span>
                    )}
                  </div>
                  {editingKey === pk.id ? (
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        placeholder="Paste your API key..."
                        className="flex-1 bg-white/[0.03] border border-white/8 rounded px-2 py-1 text-[9px] text-white/60 font-mono focus:outline-none focus:border-indigo-500/30"
                        autoFocus
                      />
                      <button
                        onClick={() => saveKey(pk.id)}
                        disabled={keySaving}
                        className="px-2 py-1 rounded text-[8px] font-mono bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/25 disabled:opacity-50"
                      >
                        {keySaving ? '...' : 'SAVE'}
                      </button>
                      <button
                        onClick={() => { setEditingKey(null); setKeyInput(''); }}
                        className="px-2 py-1 rounded text-[8px] font-mono bg-white/[0.03] text-white/30 hover:text-white/50 border border-white/8"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setEditingKey(pk.id); setKeyInput(''); }}
                        className="flex-1 py-1 rounded text-[8px] font-mono bg-white/[0.03] text-white/25 hover:text-white/40 border border-white/8 hover:border-white/15 transition-colors"
                      >
                        {isUser ? 'Change key' : isEnv ? 'Override with BYOK' : 'Add API key'}
                      </button>
                      {isUser && (
                        <button
                          onClick={() => clearKey(pk.id)}
                          className="px-2 py-1 rounded text-[8px] font-mono bg-rose-500/10 text-rose-400/60 hover:text-rose-400 border border-rose-500/15"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Selection */}
        <div>
          <div className="text-[10px] font-mono text-white/25 mb-2 tracking-wider flex items-center justify-between">
            <span>MODELS ({models.length} available, {freeCount} free)</span>
            {selectedModel !== 'auto' && (
              <button onClick={() => setSelectedModel('auto')} className="text-[9px] text-indigo-400 hover:text-indigo-300">
                RESET → AUTO
              </button>
            )}
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search models..."
            className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-1.5 text-[10px] text-white/60 font-mono mb-2 focus:outline-none focus:border-indigo-500/30 placeholder:text-white/15"
          />

          {/* Provider filter */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setFilterProvider('all')}
              className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors border ${
                filterProvider === 'all'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  : 'bg-white/[0.03] text-white/25 border-white/8'
              }`}
            >
              ALL
            </button>
            {providers.map(p => (
              <button
                key={p}
                onClick={() => setFilterProvider(p)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors border ${
                  filterProvider === p
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    : 'bg-white/[0.03] text-white/25 border-white/8'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Model list */}
          <div className="max-h-[220px] overflow-y-auto space-y-0.5 border border-white/5 rounded-lg bg-white/[0.01]">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[10px] text-white/15">No models match</div>
            )}
            {filtered.slice(0, 50).map(m => {
              const isSelected = selectedModel === m.id;
              const providerColor = m.provider === 'groq' ? 'text-green-400' : 'text-purple-400';
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`w-full text-left px-3 py-1.5 text-[10px] font-mono transition-colors flex items-center gap-2 ${
                    isSelected
                      ? 'bg-indigo-500/15 text-white'
                      : 'text-white/40 hover:bg-white/[0.03] hover:text-white/60'
                  }`}
                  style={isSelected ? { borderLeft: '2px solid #6366f1' } : {}}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.free ? 'bg-green-400' : 'bg-amber-400/60'}`} />
                  <span className={providerColor}>{m.provider}</span>
                  <span className="truncate flex-1">{m.label}</span>
                  {isSelected && <span className="text-indigo-400">✓</span>}
                </button>
              );
            })}
            {filtered.length > 50 && (
              <div className="px-3 py-1.5 text-[9px] text-white/15 text-center">
                Showing 50 of {filtered.length} — refine search
              </div>
            )}
          </div>
        </div>

        {/* Agent Overrides */}
        <div>
          <div className="text-[10px] font-mono text-white/25 mb-2 tracking-wider">AGENT OVERRIDES</div>
          {['research_agent', 'code_agent', 'synthesis_agent'].map(agent => (
            <div key={agent} className="mb-2">
              <div className="text-[9px] text-white/20 mb-1 font-mono">{agent.replace('_agent', '')}</div>
              <input
                type="text"
                value={agentOverrides[agent] || ''}
                onChange={(e) => setModelForAgent(agent, e.target.value)}
                placeholder="auto (use global model)"
                className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-1.5 text-[10px] text-white/50 font-mono focus:outline-none focus:border-indigo-500/30 placeholder:text-white/15"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
