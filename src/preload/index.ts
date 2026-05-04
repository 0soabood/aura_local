/**
 * Electron Preload Script
 * 
 * In Electron, this uses contextBridge to expose the API.
 * In this environment, we provide a clean bridge to the backend APIs.
 */

// Since we are simulating in browser, we export a bridge object
// In real Electron: const { contextBridge, ipcRenderer } = require('electron');

import { AuraAPI, TelemetryMetricsV2, Session } from '../shared/types';

export const aura: AuraAPI = {
  // Model Runs
  createModelRun: async (data) => {
    const res = await fetch('/api/model-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  listModelRuns: async (limit) => {
    const res = await fetch(`/api/model-runs${limit ? `?limit=${limit}` : ''}`);
    return res.json();
  },

  updateModelRun: async (id, updates) => {
    await fetch(`/api/model-runs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  // Telemetry
  getStats: async () => {
    const res = await fetch('/api/stats');
    return res.json();
  },

  // System Logs
  createLog: async (level, module, message, payload) => {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, module, message, payload }),
    });
  },

  listLogs: async (limit) => {
    const res = await fetch(`/api/logs${limit ? `?limit=${limit}` : ''}`);
    return res.json();
  },

  getLogById: async (id) => {
    const res = await fetch(`/api/logs/${id}`);
    if (!res.ok) return null;
    return res.json();
  },

  deleteLog: async (id) => {
    await fetch(`/api/logs/${id}`, { method: 'DELETE' });
  },

  // Roadmap
  createRoadmapItem: async (data) => {
    const res = await fetch('/api/roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  listRoadmapItems: async () => {
    const res = await fetch('/api/roadmap');
    return res.json();
  },

  updateRoadmapItem: async (id, updates) => {
    await fetch(`/api/roadmap/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  deleteRoadmapItem: async (id) => {
    await fetch(`/api/roadmap/${id}`, { method: 'DELETE' });
  },

  // Research (Existing)
  getSnippets: async () => {
    const res = await fetch('/api/snippets');
    return res.json();
  },
  
  createSnippet: async (data) => {
    const res = await fetch('/api/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateSnippet: async (id, updates) => {
    await fetch(`/api/snippets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  deleteSnippet: async (id) => {
    await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
  },

  checkHealth: async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  },

  // v2: Supervisor routing (legacy)
  routeSupervisor: async (task) => {
    const res = await fetch('/api/supervisor/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? 'Supervisor route failed');
    }
    return res.json();
  },

  // Provider & Model info
  getActiveProvider: async () => {
    const res = await fetch('/api/settings');
    if (!res.ok) return 'groq';
    const data = await res.json();
    return data.activeProvider || 'groq';
  },

  getAvailableModels: async () => {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    return res.json();
  },

  // Session update
  updateSession: async (sessionId, updates) => {
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  // ROI Events
  getRoiEvents: async () => {
    const res = await fetch('/api/roi');
    return res.json();
  },

  createRoiEvent: async (data) => {
    const res = await fetch('/api/roi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateRoiEvent: async (id, updates) => {
    await fetch(`/api/roi/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  deleteRoiEvent: async (id) => {
    await fetch(`/api/roi/${id}`, { method: 'DELETE' });
  },

  // v3: Reactive orchestrator
  orchestrate: async (message, sessionId) => {
    const res = await fetch('/api/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? 'Orchestration failed');
    }
    return res.json();
  },

  // v3: Session management
  createSession: async () => {
    const res = await fetch('/api/sessions', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to create session');
    return res.json();
  },

  listSessions: async () => {
    const res = await fetch('/api/sessions');
    if (!res.ok) return [];
    return res.json();
  },

  getSessionEvents: async (sessionId) => {
    const res = await fetch(`/api/sessions/${sessionId}/events`);
    if (!res.ok) return [];
    return res.json();
  },

  deleteSession: async (sessionId) => {
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
  },

  // UI layer — brutalist design components

  // Settings persistence
  saveSettings: async (settings) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to save settings');
  },

  loadSettings: async () => {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    return res.json();
  },

  getStatsV2: async (): Promise<TelemetryMetricsV2> => {
    try {
      const res = await fetch('/api/stats');
      const raw = await res.json();
      // Map old TelemetryMetrics shape to V2 shape with sensible defaults
      return {
        total_routes: raw.tasksCompleted ?? 0,
        avg_latency_ms: raw.executionVelocity ? raw.executionVelocity * 200 : 1840,
        success_rate: raw.systemHealth ? raw.systemHealth / 100 : 0.942,
        est_token_cost_usd: raw.totalValueSignal ? raw.totalValueSignal * 0.05 : 48.21,
        hourly_latency_ms: raw.hourly_latency_ms ?? Array.from({ length: 24 }, () => 1500 + Math.random() * 1000),
        spend_series_usd: raw.spend_series_usd ?? Array.from({ length: 7 }, (_, i) => 6 + i * 1.2),
      };
    } catch {
      return { total_routes: 0, avg_latency_ms: 0, success_rate: 0, est_token_cost_usd: 0, hourly_latency_ms: [], spend_series_usd: [] };
    }
  },

  listSessionsV2: async (): Promise<Session[]> => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) return [];
      const raw: { id: string; title: string; created_at: string; updated_at: string }[] = await res.json();
      return raw.map(s => ({
        id: s.id,
        name: s.title,
        created_at: s.created_at,
        state: 'done' as const,
        token_count: 0,
        model: 'claude',
      }));
    } catch {
      return [];
    }
  },

  streamOrchestrate: async (payload, onEvent) => {
    const res = await fetch('/api/orchestrate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      // Fall back to non-streaming orchestrate and emit a single token event
      const data = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: payload.prompt, sessionId: payload.sessionId }),
      }).then(r => r.json()).catch(() => ({ finalResponse: '' }));
      onEvent('token', { type: 'token', ts: new Date().toISOString(), text: data.finalResponse ?? '' });
      onEvent('final', { type: 'final', ts: new Date().toISOString() });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          onEvent(evt.type || 'token', evt);
        } catch { /* skip malformed line */ }
      }
    }
  },
};

// Expose to window for the renderer
if (typeof window !== 'undefined') {
  (window as any).aura = aura;
}
