import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApiApp } from './app';
import db from '../db/connection';
import * as loader from '../lib/memory/loader';

// Schema migration + per-test table wipe come from tests/setup.ts.

let app: Express;

beforeAll(() => {
  // Seed the cache so getAuraMemory() doesn't throw during tests.
  vi.spyOn(loader, 'getAuraMemory').mockReturnValue({
    soul: 'test soul',
    user: 'test user',
    agents: 'test agents',
    combinedSystemContext: 'test context',
  });
  app = createApiApp();
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('providers');
  });
});

describe('System Logs API', () => {
  it('POST -> GET round-trips a log entry with payload serialization', async () => {
    const post = await request(app)
      .post('/api/logs')
      .send({ level: 'audit', module: 'TEST', message: 'hello', payload: { k: 'v' } });
    expect(post.status).toBe(201);
    expect(post.body).toEqual({ status: 'logged' });

    const list = await request(app).get('/api/logs');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      level: 'audit', module: 'TEST', message: 'hello',
    });
    // Payload is JSON-stringified server-side
    expect(JSON.parse(list.body[0].payload)).toEqual({ k: 'v' });
  });

  it('GET /api/logs/:id returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/logs/999999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });
  });

  it('GET /api/logs/:id returns the single log when it exists', async () => {
    await request(app)
      .post('/api/logs')
      .send({ level: 'info', module: 'M', message: 'one' });

    const inserted = (db.prepare('SELECT id FROM system_logs LIMIT 1').get() as any).id;
    const res = await request(app).get(`/api/logs/${inserted}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('one');
  });

  it('respects ?limit on the list endpoint', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/logs').send({
        level: 'info', module: 'BULK', message: `m${i}`,
      });
    }
    const res = await request(app).get('/api/logs?limit=2');
    expect(res.body).toHaveLength(2);
  });

  it('DELETE removes the row', async () => {
    await request(app).post('/api/logs').send({
      level: 'info', module: 'DEL', message: 'gone',
    });
    const id = (db.prepare('SELECT id FROM system_logs WHERE module = ?').get('DEL') as any).id;

    const del = await request(app).delete(`/api/logs/${id}`);
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/logs/${id}`);
    expect(after.status).toBe(404);
  });
});

describe('Roadmap API', () => {
  it('POST creates a milestone AND emits an audit log atomically', async () => {
    const res = await request(app).post('/api/roadmap').send({
      title: 'Ship v1', description: 'cut release branch',
      priority: 5, roi_score: 750, lane: 'release',
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');

    const list = await request(app).get('/api/roadmap');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      title: 'Ship v1', priority: 5, roi_score: 750, lane: 'release', status: 'todo',
    });

    // AuraService should have written a corresponding audit row
    const logs = await request(app).get('/api/logs');
    const audit = logs.body.find((l: any) => l.module === 'ROADMAP' && l.level === 'audit');
    expect(audit).toBeDefined();
    expect(audit.message).toContain('Ship v1');
  });

  it('PATCH updates a milestone and writes an info log', async () => {
    const created = await request(app).post('/api/roadmap').send({
      title: 'Refactor auth', priority: 1, roi_score: 100,
    });
    const id = created.body.id;

    const patch = await request(app).patch(`/api/roadmap/${id}`).send({ status: 'done' });
    expect(patch.status).toBe(204);

    const after = await request(app).get('/api/roadmap');
    expect(after.body[0].status).toBe('done');

    const logs = await request(app).get('/api/logs');
    expect(logs.body.some((l: any) => l.module === 'ROADMAP' && l.level === 'info')).toBe(true);
  });

  it('PATCH rejects an invalid verification_state with 400 (contract guard)', async () => {
    const created = await request(app).post('/api/roadmap').send({
      title: 'X', priority: 0, roi_score: 0,
    });
    const id = created.body.id;

    const bad = await request(app).patch(`/api/roadmap/${id}`).send({
      verification_state: 'totally-made-up',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/verification_state/i);
  });

  it('DELETE removes the row', async () => {
    const created = await request(app).post('/api/roadmap').send({
      title: 'Doomed', priority: 0, roi_score: 0,
    });
    const id = created.body.id;

    const del = await request(app).delete(`/api/roadmap/${id}`);
    expect(del.status).toBe(204);

    const after = await request(app).get('/api/roadmap');
    expect(after.body).toHaveLength(0);
  });
});

describe('Snippets API', () => {
  it('POST creates a snippet (default verification_state = unverified)', async () => {
    const res = await request(app).post('/api/snippets').send({
      title: 'Note 1', content: 'body', tags: ['a', 'b'], source_url: 'https://x',
    });
    expect(res.status).toBe(201);

    const list = await request(app).get('/api/snippets');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].verification_state).toBe('unverified');
    expect(JSON.parse(list.body[0].tags)).toEqual(['a', 'b']);
  });

  it('PATCH promotes verification_state to a valid value', async () => {
    const created = await request(app).post('/api/snippets').send({
      title: 'N', content: '', tags: [],
    });
    const id = created.body.id;

    const patch = await request(app).patch(`/api/snippets/${id}`).send({
      verification_state: 'accepted',
      verification_reasoning: 'Cross-checked with source',
    });
    expect(patch.status).toBe(204);

    const list = await request(app).get('/api/snippets');
    expect(list.body[0].verification_state).toBe('accepted');
    expect(list.body[0].verification_reasoning).toBe('Cross-checked with source');
  });

  it('PATCH rejects garbage verification_state with 400', async () => {
    const created = await request(app).post('/api/snippets').send({
      title: 'N', content: '', tags: [],
    });
    const res = await request(app).patch(`/api/snippets/${created.body.id}`).send({
      verification_state: 'half_verified',
    });
    expect(res.status).toBe(400);
  });
});

describe('Model Runs API', () => {
  it('POST -> GET round-trips a queued run', async () => {
    const post = await request(app).post('/api/model-runs').send({
      model_id: 'gemini-3-flash-preview',
      prompt: 'scan the repo',
      status: 'queued',
    });
    expect(post.status).toBe(201);
    expect(typeof post.body.id).toBe('string');

    const list = await request(app).get('/api/model-runs');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      model_id: 'gemini-3-flash-preview',
      prompt: 'scan the repo',
      status: 'queued',
    });
  });

  it('PATCH updates lifecycle fields', async () => {
    const created = await request(app).post('/api/model-runs').send({
      model_id: 'm', prompt: 'p', status: 'running',
    });
    const id = created.body.id;

    const patch = await request(app).patch(`/api/model-runs/${id}`).send({
      status: 'completed', latency_ms: 123, response: 'done',
    });
    expect(patch.status).toBe(204);

    const list = await request(app).get('/api/model-runs');
    expect(list.body[0]).toMatchObject({
      status: 'completed', latency_ms: 123, response: 'done',
    });
  });

  it('PATCH rejects invalid verification_state with 400', async () => {
    const created = await request(app).post('/api/model-runs').send({
      model_id: 'm', prompt: 'p',
    });
    const res = await request(app).patch(`/api/model-runs/${created.body.id}`).send({
      verification_state: 'bogus',
    });
    expect(res.status).toBe(400);
  });
});

describe('Telemetry API', () => {
  it('GET /api/stats reflects roadmap + snippet state', async () => {
    await request(app).post('/api/roadmap').send({
      title: 'Done thing', priority: 1, roi_score: 200,
    });
    // Promote it to done so the value signal counts it
    const items = (await request(app).get('/api/roadmap')).body;
    await request(app).patch(`/api/roadmap/${items[0].id}`).send({ status: 'done' });

    await request(app).post('/api/snippets').send({ title: 'S', content: '', tags: [] });

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalValueSignal: 200,
      tasksCompleted: 1,
      activeProposals: 0,
      researchDensity: 1,
    });
    expect(typeof res.body.systemHealth).toBe('number');
    expect(Array.isArray(res.body.recentActivity)).toBe(true);
  });

  it('GET /api/stats-v2 returns live route, success, latency, and spend series', async () => {
    await request(app).post('/api/model-runs').send({
      model_id: 'm1',
      prompt: 'prompt 1',
      status: 'completed',
    });
    const firstRunId = (await request(app).get('/api/model-runs')).body[0].id;
    await request(app).patch(`/api/model-runs/${firstRunId}`).send({
      status: 'completed',
      latency_ms: 1200,
      response: 'ok',
    });

    await request(app).post('/api/model-runs').send({
      model_id: 'm2',
      prompt: 'prompt 2',
      status: 'failed',
    });

    await request(app).post('/api/roi-events').send({
      type: 'expense',
      amount: -12.5,
      currency: 'USD',
      source: 'OpenAI',
      description: 'Token spend',
    });

    const res = await request(app).get('/api/stats-v2');
    expect(res.status).toBe(200);
    expect(res.body.total_routes).toBe(2);
    expect(res.body.est_token_cost_usd).toBe(12.5);
    expect(Array.isArray(res.body.route_count_series)).toBe(true);
    expect(Array.isArray(res.body.hourly_latency_ms)).toBe(true);
    expect(Array.isArray(res.body.success_rate_series)).toBe(true);
    expect(Array.isArray(res.body.spend_series_usd)).toBe(true);
    expect(res.body.route_count_series).toHaveLength(24);
    expect(res.body.hourly_latency_ms).toHaveLength(24);
    expect(res.body.success_rate_series).toHaveLength(24);
    expect(res.body.spend_series_usd).toHaveLength(7);
    expect(res.body.route_count_series.some((value: number) => value > 0)).toBe(true);
    expect(res.body.success_rate_series.some((value: number) => value > 0)).toBe(true);
    expect(res.body.spend_series_usd.some((value: number) => value > 0)).toBe(true);
  });
});

describe('Process resilience', () => {
  it('returns 400 (not 500/crash) on malformed JSON', async () => {
    const res = await request(app)
      .post('/api/logs')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON payload' });
  });

  it('survives the malformed request and continues serving', async () => {
    // After a bad request, normal routes still work.
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('Input Validation', () => {
  it('GET /api/logs?limit=abc returns 400', async () => {
    const res = await request(app).get('/api/logs?limit=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit/);
  });

  it('GET /api/model-runs?limit=abc returns 400', async () => {
    const res = await request(app).get('/api/model-runs?limit=abc');
    expect(res.status).toBe(400);
  });

  it('GET /api/logs/not-a-number returns 400', async () => {
    const res = await request(app).get('/api/logs/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid id');
  });

  it('DELETE /api/logs/not-a-number returns 400', async () => {
    const res = await request(app).delete('/api/logs/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid id');
  });

  it('POST /api/roadmap without title returns 400', async () => {
    const res = await request(app).post('/api/roadmap').send({ priority: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  it('POST /api/roadmap with title > 500 chars returns 400', async () => {
    const res = await request(app).post('/api/roadmap').send({ title: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });

  it('POST /api/snippets without title returns 400', async () => {
    const res = await request(app).post('/api/snippets').send({ content: 'some content' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  it('POST /api/snippets with oversized content returns 400', async () => {
    const res = await request(app).post('/api/snippets').send({ title: 'T', content: 'x'.repeat(50_001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/50,000/);
  });

  it('POST /api/orchestrate with message > 10K chars returns 400', async () => {
    const res = await request(app).post('/api/orchestrate').send({ message: 'x'.repeat(10_001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10,000/);
  });
});

describe('POST /api/admin/reload-memory', () => {
  it('returns success shape on a clean reload', async () => {
    vi.spyOn(loader, 'reloadAuraMemory').mockReturnValue({
      soul: 'new soul',
      user: 'new user',
      agents: 'new agents',
      combinedSystemContext: 'new context',
    });

    const res = await request(app).post('/api/admin/reload-memory');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.reloadedAt).toBe('string');
    expect(res.body.files).toEqual(['SOUL.md', 'USER.md', 'AGENTS.md']);
  });

  it('returns 500 and preserves old cache when reload throws', async () => {
    vi.spyOn(loader, 'reloadAuraMemory').mockImplementation(() => {
      throw new Error('disk read failed');
    });
    // getAuraMemory should still return the previously seeded value.
    vi.spyOn(loader, 'getAuraMemory').mockReturnValue({
      soul: 'old soul',
      user: 'old user',
      agents: 'old agents',
      combinedSystemContext: 'old context',
    });

    const res = await request(app).post('/api/admin/reload-memory');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/disk read failed/);

    // Cache still returns the pre-failure value.
    expect(loader.getAuraMemory().combinedSystemContext).toBe('old context');
  });
});
