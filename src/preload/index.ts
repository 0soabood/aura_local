/**
 * Electron Preload Script
 * 
 * In Electron, this uses contextBridge to expose the API.
 * In this environment, we provide a clean bridge to the backend APIs.
 */

// Since we are simulating in browser, we export a bridge object
// In real Electron: const { contextBridge, ipcRenderer } = require('electron');

import { AuraAPI } from '../shared/types';

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
  }
};

// Expose to window for the renderer
if (typeof window !== 'undefined') {
  (window as any).aura = aura;
}
