import { useCallback, useMemo } from 'react';
import { useAuraStore, ModelRole } from './auraStore';

// Re-export ModelRole for components that import from this file
export type { ModelRole };

// Navigation hooks
export const useCurrentView = () => useAuraStore(state => state.currentView);
export const useSetCurrentView = () => useAuraStore(state => state.setCurrentView);

// Session hooks
export const useSessions = () => useAuraStore(state => state.sessions);
export const useActiveSession = () => useAuraStore(state => state.activeSession);
export const useSessionsLoading = () => useAuraStore(state => state.sessionsLoading);
export const useFetchSessions = () => useAuraStore(state => state.fetchSessions);
export const useCreateSession = () => useAuraStore(state => state.createSession);
export const useSelectSession = () => useAuraStore(state => state.selectSession);

export const useSessionById = (id: string) =>
  useAuraStore(state => state.sessions.find(s => s.id === id));

export const useSessionCount = () => useAuraStore(state => state.sessions.length);

// Chat / Orchestration hooks
export const useMessages = () => useAuraStore(state => state.messages);
export const useIsOrchestrating = () => useAuraStore(state => state.isOrchestrating);
export const useActiveAgent = () => useAuraStore(state => state.activeAgent);
export const useAgentBids = () => useAuraStore(state => state.agentBids);
export const useAgentEvents = () => useAuraStore(state => state.agentEvents);
export const useStreamResponse = () => useAuraStore(state => state.streamResponse);
export const usePendingMessages = () => useAuraStore(state => state.pendingMessages);
export const useSendMessage = () => useAuraStore(state => state.sendMessage);
export const useClearChat = () => useAuraStore(state => state.clearChat);
export const useAddMessage = () => useAuraStore(state => state.addMessage);
export const useSetAgentBids = () => useAuraStore(state => state.setAgentBids);
export const useSetActiveAgent = () => useAuraStore(state => state.setActiveAgent);
export const useSetOrchestrating = () => useAuraStore(state => state.setOrchestrating);
export const useClearAgentEvents = () => useAuraStore(state => state.clearAgentEvents);

// Stats hooks
export const useStats = () => useAuraStore(state => state.stats);
export const useStatsLoading = () => useAuraStore(state => state.statsLoading);
export const useFetchStats = () => useAuraStore(state => state.fetchStats);

// Roadmap hooks
export const useRoadmapItems = () => useAuraStore(state => state.roadmapItems);
export const useRoadmapLoading = () => useAuraStore(state => state.roadmapLoading);
export const useFetchRoadmapItems = () => useAuraStore(state => state.fetchRoadmapItems);

export const useRoadmapByStatus = (status: string) =>
  useAuraStore(state => state.roadmapItems.filter(item => item.status === status));

export const useRoadmapStats = () => {
  const items = useAuraStore(state => state.roadmapItems);
  return useMemo(() => ({
    total: items.length,
    done: items.filter(i => i.status === 'done').length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    backlog: items.filter(i => i.status === 'backlog').length,
    avgRoi: items.reduce((sum, i) => sum + i.roi_score, 0) / (items.length || 1),
  }), [items]);
};

// Logs hooks
export const useLogs = () => useAuraStore(state => state.logs);
export const useLogsLoading = () => useAuraStore(state => state.logsLoading);
export const useFetchLogs = () => useAuraStore(state => state.fetchLogs);

export const useLogsByLevel = (level: string) =>
  useAuraStore(state => state.logs.filter(log => log.level === level));

export const useLogCounts = () => {
  const logs = useAuraStore(state => state.logs);
  return useMemo(() => ({
    all: logs.length,
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
    audit: logs.filter(l => l.level === 'audit').length,
  }), [logs]);
};

// UI State hooks
export const useCommandPaletteOpen = () => useAuraStore(state => state.commandPaletteOpen);
export const useSetCommandPaletteOpen = () => useAuraStore(state => state.setCommandPaletteOpen);

export const useBrainDumpMode = () => useAuraStore(state => state.brainDumpMode);
export const useSetBrainDumpMode = () => useAuraStore(state => state.setBrainDumpMode);

export const useEnergyMode = () => useAuraStore(state => state.energyMode);
export const useSetEnergyMode = () => useAuraStore(state => state.setEnergyMode);

export const useSelectedModel = () => useAuraStore(state => state.selectedModel);
export const useSetSelectedModel = () => useAuraStore(state => state.setSelectedModel);

// Model Configuration Hooks
export const useModelConfig = () => useAuraStore(state => state.modelConfig);
export const useSetModelForRole = () => useAuraStore(state => state.setModelForRole);
export const useResetModelConfig = () => useAuraStore(state => state.resetModelConfig);

export const useModelForRole = (role: ModelRole) =>
  useAuraStore(state => state.modelConfig[role] || null);

export const useAgentModelOverrides = () => useAuraStore(state => state.agentModelOverrides);
export const useSetModelForAgent = () => useAuraStore(state => state.setModelForAgent);
export const useResetAgentModelOverrides = () => useAuraStore(state => state.resetAgentModelOverrides);

export const useModelForAgent = (agent: string) =>
  useAuraStore(state => state.agentModelOverrides[agent] || null);

// Veto / Approval hooks
export const usePendingApproval = () => useAuraStore(state => state.pendingApproval);
export const useSetPendingApproval = () => useAuraStore(state => state.setPendingApproval);

// Combined action hooks
export const useFetchAllData = () => {
  const fetchSessions = useFetchSessions();
  const fetchStats = useFetchStats();
  const fetchRoadmapItems = useFetchRoadmapItems();
  const fetchLogs = useFetchLogs();

  return useCallback(() => {
    fetchSessions();
    fetchStats();
    fetchRoadmapItems();
    fetchLogs();
  }, [fetchSessions, fetchStats, fetchRoadmapItems, fetchLogs]);
};
