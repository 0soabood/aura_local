import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BlackboardEvent, RoadmapItem, SystemLog, TelemetryMetrics } from '../shared/types';
import type { VetoAction } from '../lib/veto/types';

export type ModelRole = 'daily_driver' | 'long_context' | 'reasoning' | 'agent_orchestrator' | 'vision' | 'translate' | 'compaction' | 'bulk_fast' | 'experimental';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system' | 'synthesis' | 'error';
  content: string;
  agent?: string;
  timestamp: number;
}

export interface AgentEvent {
  type: string;
  agent: string;
  content: string;
  timestamp: number;
  metadata?: any;
}

export interface AgentBid {
  agentName: string;
  confidence: number;
  proposedAction: string;
}

export interface AuraState {
  // Navigation state
  currentView: string;
  setCurrentView: (view: string) => void;

  // Sessions
  sessions: Array<{ id: string; title?: string; state?: string; updated_at: string }>;
  activeSession: string | null;
  sessionsLoading: boolean;
  fetchSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  selectSession: (id: string) => void;

  // Chat / Orchestration
  messages: ChatMessage[];
  isOrchestrating: boolean;
  activeAgent: string | null;
  agentBids: AgentBid[];
  agentEvents: AgentEvent[];
  streamResponse: string;
  pendingMessages: string[];
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  addMessage: (msg: ChatMessage) => void;
  setAgentBids: (bids: AgentBid[]) => void;
  setActiveAgent: (agent: string | null) => void;
  setOrchestrating: (v: boolean) => void;
  appendStreamResponse: (text: string) => void;
  resetStreamResponse: () => void;
  addAgentEvent: (event: AgentEvent) => void;
  clearAgentEvents: () => void;

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

  // Veto / Approval
  pendingApproval: VetoAction | null;
  setPendingApproval: (action: VetoAction | null) => void;
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
      activeSession: null,
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
              }).then(async r => {
                if (!r.ok) {
                  const text = await r.text().catch(() => 'unknown error');
                  throw new Error(`Server returned ${r.status}: ${text}`);
                }
                return r.json();
              });

          if (res && res.id) {
            await get().fetchSessions();
            set({ activeSession: res.id });
            return res.id;
          }
          throw new Error('Server returned empty response');
        } catch (err: any) {
          console.error('Failed to create session:', err);
          const errMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'error',
            content: `Failed to create session: ${err.message}. Make sure the AURA server is running.`,
            timestamp: Date.now(),
          };
          set((s) => ({ messages: [...s.messages, errMsg] }));
          return null;
        }
      },
      selectSession: (id) => set({ activeSession: id }),

      // Chat / Orchestration
      messages: [],
      isOrchestrating: false,
      activeAgent: null,
      agentBids: [],
      agentEvents: [],
      streamResponse: '',
      pendingMessages: [],
      sendMessage: async (message: string) => {
        // If already orchestrating, queue the message and show a toast
        if (get().isOrchestrating) {
          set((s) => ({ pendingMessages: [...s.pendingMessages, message] }));
          const queuedMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: `⏳ Queued: "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}" — will send when current task completes.`,
            timestamp: Date.now(),
          };
          set((s) => ({ messages: [...s.messages, queuedMsg] }));
          return;
        }

        // Check if any models are available first
        let hasModels = true;
        try {
          const modelRes = await fetch('/api/models');
          if (modelRes.ok) {
            const modelData = await modelRes.json();
            const totalModels = modelData.providers?.reduce((sum: number, p: any) => sum + (p.models?.length || 0), 0) || 0;
            if (totalModels === 0) hasModels = false;
          }
        } catch {
          hasModels = false;
        }

        if (!hasModels) {
          const errMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'error',
            content: 'No AI models available. Go to Settings → API Keys to add your OpenRouter or Groq API key, or ensure the AURA server has environment keys configured.',
            timestamp: Date.now(),
          };
          set((s) => ({ messages: [...s.messages, errMsg] }));
          return;
        }

        let activeSession = get().activeSession;
        if (!activeSession) {
          // Auto-create session
          const sid = await get().createSession();
          if (!sid) {
            // createSession already posted an error message
            return;
          }
          activeSession = sid;
          set({ activeSession: sid });
        }

        const sessionId = activeSession;
        const preferredModel = get().selectedModel;
        const agentOverrides = get().agentModelOverrides;
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: message,
          timestamp: Date.now(),
        };
        set((s) => ({ messages: [...s.messages, userMsg], isOrchestrating: true, agentBids: [], agentEvents: [] }));

        try {
          // Try SSE streaming first, fall back to polling
          const res = await fetch('/api/orchestrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, sessionId: sessionId, stream: true, preferredModel, agentOverrides }),
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => 'unknown error');
            throw new Error(`Server returned ${res.status}: ${errText}`);
          }

          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream')) {
            // SSE streaming
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (line.startsWith('event: ')) {
                    const sseEventType = line.slice(7);
                    // Use index i (not indexOf) to handle duplicate event types correctly
                    const dataLine = lines[i + 1];
                    if (dataLine?.startsWith('data: ')) {
                      try {
                        const data = JSON.parse(dataLine.slice(6));
                        // SSE events are wrapped as 'agent_event' with the real type in data.event_type.
                        // The server uses 'author' (not 'agent') for the agent name.
                        const realEventType = data.event_type || sseEventType;
                        const agentName = data.author || data.agent || 'system';
                        const evt: AgentEvent = { type: realEventType, agent: agentName, content: data.content || '', timestamp: Date.now(), metadata: data.metadata };
                        set((s) => ({ agentEvents: [...s.agentEvents, evt] }));

                        if (agentName && !agentName.includes('orchestrator')) {
                          set({ activeAgent: agentName });
                        }

                        if (realEventType === 'agent_complete' || realEventType === 'synthesis_complete') {
                          const synthMsg: ChatMessage = {
                            id: crypto.randomUUID(),
                            role: agentName.includes('synthesis') ? 'synthesis' : 'agent',
                            content: data.content || '',
                            agent: agentName,
                            timestamp: Date.now(),
                          };
                          set((s) => ({ messages: [...s.messages, synthMsg] }));
                        }

                        if (realEventType === 'agent_error') {
                          const errMsg: ChatMessage = {
                            id: crypto.randomUUID(),
                            role: 'error',
                            content: data.content || 'An error occurred',
                            agent: agentName,
                            timestamp: Date.now(),
                          };
                          set((s) => ({ messages: [...s.messages, errMsg] }));
                        }

                        // Handle veto/approval events
                        if (realEventType === 'approval_required' && data.action) {
                          set({ pendingApproval: data.action });
                        }
                        if (realEventType === 'veto_action_update' && data.action) {
                          // If the action was resolved (approved/rejected), clear the modal
                          if (['approved', 'rejected', 'modified'].includes(data.action.status)) {
                            set((s) => {
                              // Only clear if it matches the current pending action
                              if (s.pendingApproval?.id === data.action.id) {
                                return { pendingApproval: null };
                              }
                              return {};
                            });
                          }
                        }
                      } catch { /* skip parse errors */ }
                    }
                  }
                }
              }
            }
          } else {
            // JSON response (fallback)
            const data = await res.json();
            if (data.final_response || data.response) {
              const reply: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'synthesis',
                content: data.final_response || data.response,
                timestamp: Date.now(),
              };
              set((s) => ({ messages: [...s.messages, reply] }));
            }
          }
        } catch (err: any) {
          console.error('Orchestration failed:', err);
          const errMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'error',
            content: `Orchestration failed: ${err.message}. Check your API keys in Settings, or ensure the server is running.`,
            timestamp: Date.now(),
          };
          set((s) => ({ messages: [...s.messages, errMsg] }));
        } finally {
          set({ isOrchestrating: false, activeAgent: null });
          // BUG-NEW-B: Auto-send queued messages when current task completes
          const pending = get().pendingMessages;
          if (pending.length > 0) {
            // Pop the first queued message, keep the rest
            const [nextMsg, ...remaining] = pending;
            set({ pendingMessages: remaining });
            const processedMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: remaining.length > 0
                ? `▶ Processing queued message (${remaining.length + 1} remaining)...`
                : `▶ Processing queued message...`,
              timestamp: Date.now(),
            };
            set((s) => ({ messages: [...s.messages, processedMsg] }));
            // Small delay to let the UI settle before firing the next request
            setTimeout(() => {
              get().sendMessage(nextMsg);
            }, 300);
          }
        }
      },
      clearChat: () => set({ messages: [], agentBids: [], agentEvents: [], streamResponse: '', pendingMessages: [] }),
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      setAgentBids: (bids) => set({ agentBids: bids }),
      setActiveAgent: (agent) => set({ activeAgent: agent }),
      setOrchestrating: (v) => set({ isOrchestrating: v }),
      appendStreamResponse: (text) => set((s) => ({ streamResponse: s.streamResponse + text })),
      resetStreamResponse: () => set({ streamResponse: '' }),
      addAgentEvent: (event) => set((s) => ({ agentEvents: [...s.agentEvents, event] })),
      clearAgentEvents: () => set({ agentEvents: [] }),

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

      // Veto / Approval
      pendingApproval: null,
      setPendingApproval: (action) => set({ pendingApproval: action }),
    }),
    {
      name: 'aura-store',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        modelConfig: state.modelConfig,
        agentModelOverrides: state.agentModelOverrides,
        energyMode: state.energyMode,
        brainDumpMode: state.brainDumpMode,
      }),
    }
  )
);
