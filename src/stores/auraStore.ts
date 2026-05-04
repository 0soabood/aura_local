import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BlackboardEvent, RoadmapItem, SystemLog, TelemetryMetrics } from '../shared/types';

export type ModelRole = 'daily_driver' | 'long_context' | 'reasoning' | 'agent_orchestrator' | 'vision' | 'translate' | 'compaction' | 'bulk_fast' | 'experimental';

export interface AuraState {
  // Navigation state
  currentView: string;
  setCurrentView: (view: string) => void;

  // Sessions
  sessions: Array<{ id: string; title?: string; state?: string; updated_at: string }>;
  sessionsLoading: boolean;
  fetchSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;

  // Stats
  stats: TelemetryMetrics | null;
  statsLoading: boolean;
  fetchStats: () => Promise<void>;

  // Roadmap
  roadmapItems: RoadmapItem[];
  roadmapLoading: boolean;
  fetchRoadmapItems: () => Promise<void>;

  // System Logs
  logs: SystemLog[];
  logsLoading: boolean;
  fetchLogs: (limit?: number) => Promise<void>;

  // UI State
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  brainDumpMode: boolean;
  setBrainDumpMode: (mode: boolean) => void;
  energyMode: 'low' | 'high';
  setEnergyMode: (mode: 'low' | 'high') => void;

  // Model Selection (legacy - for backward compatibility)
  selectedModel: string;
  setSelectedModel: (model: string) => void;

  // Per-Role Model Configuration
  modelConfig: Partial<Record<ModelRole, string>>;
  setModelForRole: (role: ModelRole, model: string) => void;
  resetModelConfig: () => void;

  // Per-Agent Model Overrides
  agentModelOverrides: Record<string, string>;
  setModelForAgent: (agent: string, model: string) => void;
  resetAgentModelOverrides: () => void;
}

const getAura = () => (window as any).aura;

export const useAuraStore = create<AuraState>()(
  persist(
    (set, get) => ({
      // Navigation
      currentView: 'hub',
      setCurrentView: (view) => set({ currentView: view }),

      // Sessions
      sessions: [],
      sessionsLoading: false,
      fetchSessions: async () => {
        set({ sessionsLoading: true });
        try {
          const data = getAura()?.listSessions
            ? await getAura().listSessions()
            : await fetch('/api/sessions').then(res => res.ok ? res.json() : []).catch(() => []);
          set({ sessions: Array.isArray(data) ? data : [], sessionsLoading: false });
        } catch (err) {
          console.error('Failed to fetch sessions:', err);
          set({ sessionsLoading: false });
        }
      },
      createSession: async () => {
        try {
          const res = getAura()?.createSession
            ? await getAura().createSession()
            : await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'New Session' })
              }).then(r => r.ok ? r.json() : null);

          if (res && res.id) {
            await get().fetchSessions();
            return res.id;
          }
          return null;
        } catch (err) {
          console.error('Failed to create session:', err);
          return null;
        }
      },

      // Stats
      stats: null,
      statsLoading: false,
      fetchStats: async () => {
        set({ statsLoading: true });
        try {
          const data = getAura()?.getStatsV2
            ? await getAura().getStatsV2()
            : await fetch('/api/stats-v2').then(res => res.ok ? res.json() : null).catch(() => null);
          set({ stats: data, statsLoading: false });
        } catch (err) {
          console.error('Failed to fetch stats:', err);
          set({ statsLoading: false });
        }
      },

      // Roadmap
      roadmapItems: [],
      roadmapLoading: false,
      fetchRoadmapItems: async () => {
        set({ roadmapLoading: true });
        try {
          const data = getAura()?.listRoadmapItems
            ? await getAura().listRoadmapItems()
            : await fetch('/api/roadmap').then(res => res.ok ? res.json() : []).catch(() => []);
          set({ roadmapItems: Array.isArray(data) ? data : [], roadmapLoading: false });
        } catch (err) {
          console.error('Failed to fetch roadmap items:', err);
          set({ roadmapLoading: false });
        }
      },

      // Logs
      logs: [],
      logsLoading: false,
      fetchLogs: async (limit = 200) => {
        set({ logsLoading: true });
        try {
          const data = getAura()?.listLogs
            ? await getAura().listLogs(limit)
            : await fetch(`/api/logs?limit=${limit}`).then(res => res.ok ? res.json() : []).catch(() => []);
          set({ logs: Array.isArray(data) ? data : [], logsLoading: false });
        } catch (err) {
          console.error('Failed to fetch logs:', err);
          set({ logsLoading: false });
        }
      },

      // UI State
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      brainDumpMode: false,
      setBrainDumpMode: (mode) => set({ brainDumpMode: mode }),
      energyMode: 'high' as 'low' | 'high',
      setEnergyMode: (mode) => set({ energyMode: mode }),
      selectedModel: 'auto',
      setSelectedModel: (model) => set({ selectedModel: model }),

      // Per-Role Model Configuration
      modelConfig: {},
      setModelForRole: (role, model) => set((state) => ({
        modelConfig: { ...state.modelConfig, [role]: model }
      })),
      resetModelConfig: () => set({ modelConfig: {} }),

      // Per-Agent Model Overrides
      agentModelOverrides: {},
      setModelForAgent: (agent, model) => set((state) => ({
        agentModelOverrides: { ...state.agentModelOverrides, [agent]: model }
      })),
      resetAgentModelOverrides: () => set({ agentModelOverrides: {} }),
    }),
    {
      name: 'aura-store',
      partialize: (state) => ({
        // Only persist these fields
        selectedModel: state.selectedModel,
        modelConfig: state.modelConfig,
        agentModelOverrides: state.agentModelOverrides,
        energyMode: state.energyMode,
        brainDumpMode: state.brainDumpMode,
      }),
    }
  )
);
