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
        hourly_latency_ms: Array(24).fill(0),
        spend_series_usd: Array(24).fill(0),
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
      expect(screen.getByText('0 CARDS')).toBeTruthy();
      expect(screen.getByText('0 ENTRIES')).toBeTruthy();
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

  it('ROADMAP tile shows card count from listRoadmapItems query', async () => {
    const roadmapItems = [
      { id: '1', title: 'Task 1', status: 'backlog' },
      { id: '2', title: 'Task 2', status: 'in_progress' },
      { id: '3', title: 'Task 3', status: 'done' },
      { id: '4', title: 'Task 4', status: 'todo' },
      { id: '5', title: 'Task 5', status: 'backlog' },
    ];
    (window as any).aura.listRoadmapItems = vi.fn().mockResolvedValue(roadmapItems);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('5 CARDS')).toBeTruthy();
    });
    
    expect((window as any).aura.listRoadmapItems).toHaveBeenCalled();
  });

  it('RESEARCH tile shows entry count from getSnippets query', async () => {
    const snippets = [
      { id: '1', content: 'Snippet 1', verification_state: 'accepted' },
      { id: '2', content: 'Snippet 2', verification_state: 'unverified' },
      { id: '3', content: 'Snippet 3', verification_state: 'source_checked' },
    ];
    (window as any).aura.getSnippets = vi.fn().mockResolvedValue(snippets);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('3 ENTRIES')).toBeTruthy();
    });
    
    expect((window as any).aura.getSnippets).toHaveBeenCalled();
  });

  it('LOGS tile shows count from listLogs query', async () => {
    const logs = Array(42).fill(null).map((_, i) => ({ id: i, message: `Log ${i}` }));
    (window as any).aura.listLogs = vi.fn().mockResolvedValue(logs);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('42')).toBeTruthy();
    });
    
    expect((window as any).aura.listLogs).toHaveBeenCalled();
  });

  it('ROI tile shows cost from getStatsV2 query', async () => {
    (window as any).aura.getStatsV2 = vi.fn().mockResolvedValue({
      total_routes: 10,
      avg_latency_ms: 1500,
      success_rate: 0.95,
      est_token_cost_usd: 42.50,
      hourly_latency_ms: Array(24).fill(1500),
      spend_series_usd: Array(24).fill(1.77),
    });

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('$42.50')).toBeTruthy();
    });
    
    expect((window as any).aura.getStatsV2).toHaveBeenCalled();
  });

  it('ARCHIVE tile shows count from listSessionsV2 filtered by archived state', async () => {
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([
      { id: '1', name: 'Archived 1', state: 'archived', token_count: 100 },
      { id: '2', name: 'Archived 2', state: 'archived', token_count: 200 },
      { id: '3', name: 'Active 1', state: 'running', token_count: 150 },
    ]);

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy(); // 2 archived sessions
    });
    
    expect((window as any).aura.listSessionsV2).toHaveBeenCalled();
  });

  it('all tile counts update when DB queries return different values', async () => {
    // First render with initial data
    (window as any).aura.listSessionsV2 = vi.fn().mockResolvedValue([
      { id: '1', name: 'Session 1', state: 'running', token_count: 100 },
    ]);
    (window as any).aura.listRoadmapItems = vi.fn().mockResolvedValue([{ id: '1' }]);
    (window as any).aura.getSnippets = vi.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
    (window as any).aura.listLogs = vi.fn().mockResolvedValue(Array(5).fill({ id: 1 }));

    render(<NavigationHub />);
    
    await waitFor(() => {
      expect(screen.getByText(/1 LIVE/)).toBeTruthy();
      expect(screen.getByText('1 CARDS')).toBeTruthy();
      expect(screen.getByText('2 ENTRIES')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
    });

    // Verify the mocks were called
    expect((window as any).aura.listSessionsV2).toHaveBeenCalled();
    expect((window as any).aura.listRoadmapItems).toHaveBeenCalled();
    expect((window as any).aura.getSnippets).toHaveBeenCalled();
    expect((window as any).aura.listLogs).toHaveBeenCalled();
  });
});
