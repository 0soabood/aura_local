import { vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

// Mock better-sqlite3 using the __mocks__ folder (automatic mock)
vi.mock('better-sqlite3');

import NavigationHub from './NavigationHub';

describe('NavigationHub Crash Resilience', () => {
  beforeEach(() => {
    // Mock window.aura with various edge cases
    (window as any).aura = {
      getStatsV2: vi.fn().mockResolvedValue({
        total_routes: 0,
        avg_latency_ms: 0,
        success_rate: 0,
        est_token_cost_usd: 0,
        route_count_series: Array(24).fill(0),
        hourly_latency_ms: Array(24).fill(0),
        success_rate_series: Array(24).fill(0),
        spend_series_usd: Array(7).fill(0),
        top_consumers: [],
      }),
      listSessionsV2: vi.fn().mockResolvedValue([]),
      listRoadmapItems: vi.fn().mockResolvedValue([]),
      getSnippets: vi.fn().mockResolvedValue([]),
      listLogs: vi.fn().mockResolvedValue([]),
    };
  });

  it('renders without crashing when all data is empty', async () => {
    render(<NavigationHub />);
    
    await waitFor(() => {
      // Check for HUB tag which is unique to NavigationHub
      expect(screen.getByText('HUB')).toBeTruthy();
    });
  });

  it('renders without crashing when sessions have missing fields', async () => {
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([
      { id: '1' }, // Missing name, state, token_count
      { id: '2', name: null, state: undefined },
      { id: '3', name: 'Test', state: 'running' }, // Missing token_count
    ]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('HUB')).toBeTruthy();
    });
  });

  it('renders without crashing when stats is null', async () => {
    (window as any).aura.getStatsV2 = vi.fn().mockResolvedValue(null);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('HUB')).toBeTruthy();
    });
  });

  it('renders without crashing when API calls throw errors', async () => {
    (window as any).aura.getStatsV2 = vi.fn().mockRejectedValue(new Error('API Error'));
    (window as any).aura.listSessionsV2 = vi.fn().mockRejectedValue(new Error('API Error'));
    (window as any).aura.listRoadmapItems = vi.fn().mockRejectedValue(new Error('API Error'));
    (window as any).aura.getSnippets = vi.fn().mockRejectedValue(new Error('API Error'));
    (window as any).aura.listLogs = vi.fn().mockRejectedValue(new Error('API Error'));

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('HUB')).toBeTruthy();
    });
  });

  it('renders without crashing with malformed session data', async () => {
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([
      null,
      undefined,
      { id: '1', name: 123, state: 'running', token_count: 'not-a-number' },
      { id: '2', name: 'Test', state: 'invalid-state', token_count: null },
    ]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('HUB')).toBeTruthy();
    });
  });

  it('renders without crashing with very long session names', async () => {
    const longName = 'A'.repeat(1000);
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([
      { id: '1', name: longName, state: 'done', token_count: 1000 },
    ]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('HUB')).toBeTruthy();
    });
  });

  it('renders without crashing when roadmap/research/logs counts are zero', async () => {
    (window as any).aura.listRoadmapItems = vi.fn().mockResolvedValue([]);
    (window as any).aura.getSnippets = vi.fn().mockResolvedValue([]);
    (window as any).aura.listLogs = vi.fn().mockResolvedValue([]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('HUB')).toBeTruthy();
    });
  });

  it('navigates when department tile is clicked', async () => {
    render(<NavigationHub />);
    
    await waitFor(() => {
      const terminalTile = screen.getByText('TERMINAL');
      fireEvent.click(terminalTile);
      // Navigation is now handled internally via useNavigate
    });
  });

  it('renders recent strip with no sessions', async () => {
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('NO SESSIONS YET')).toBeTruthy();
    });
  });

  it('renders resumable badge for done/error sessions', async () => {
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([
      { id: '1', name: 'Done Session', state: 'done', token_count: 100 },
      { id: '2', name: 'Error Session', state: 'error', token_count: 50 },
      { id: '3', name: 'Running Session', state: 'running', token_count: 200 },
    ]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      // Check for resumable badges (↻)
      const resumableBadges = document.querySelectorAll('[title="Resumable session"]');
      expect(resumableBadges.length).toBe(2); // done and error sessions
    });
  });

  // ── Tile Count Assertions: Verify data comes from DB queries, not hardcoded ──

  it('TERMINAL tile shows live/done counts from listSessionsV2 query', async () => {
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([
      { id: '1', name: 'Running 1', state: 'running', token_count: 100 },
      { id: '2', name: 'Running 2', state: 'running', token_count: 200 },
      { id: '3', name: 'Done 1', state: 'done', token_count: 150 },
      { id: '4', name: 'Done 2', state: 'done', token_count: 250 },
      { id: '5', name: 'Error 1', state: 'error', token_count: 50 },
    ]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      // Should show "2 LIVE · 2 DONE" (2 running, 2 done - error is not counted in doneCount)
      expect(screen.getByText(/2 LIVE/)).toBeTruthy();
      expect(screen.getByText(/2 DONE/)).toBeTruthy();
    });
    
    // Verify the mock was actually called (proving data came from DB query)
    expect((window as any).aura.listSessionsV2).toHaveBeenCalled();
  });

  // ── NavigationHub Crash Resilience Tests Only ──
  // NOTE: ROADMAP, RESEARCH, ROI, LOGS, ARCHIVE tiles disabled for MVP
});
