/**
 * Express API factory.
 *
 * Extracted from src/main/index.ts so it can be exercised by Supertest
 * without booting the Vite middleware or binding to a port. The bootstrap
 * in index.ts wraps this with the dev-server middleware + listen call.
 */

import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { SystemLogRepository } from '../db/repositories/SystemLogRepository';
import { SnippetRepository } from '../db/repositories/SnippetRepository';
import { RoadmapRepository } from '../db/repositories/RoadmapRepository';
import { StatsRepository } from '../db/repositories/StatsRepository';
import { ModelRunRepository } from '../db/repositories/ModelRunRepository';
import { AuraService } from './services/AuraService';

export function createApiApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ── Model Runs ──────────────────────────────────────────────────────────
  app.get('/api/model-runs', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    res.json(ModelRunRepository.list(limit));
  });

  app.post('/api/model-runs', (req, res) => {
    const run = { ...req.body, id: crypto.randomUUID() };
    ModelRunRepository.create(run);
    res.status(201).json({ id: run.id });
  });

  app.patch('/api/model-runs/:id', (req, res) => {
    try {
      ModelRunRepository.update(req.params.id, req.body);
      res.sendStatus(204);
    } catch (e: any) {
      // assertVerificationState throws on bad input — surface as 400
      res.status(400).json({ error: e.message });
    }
  });

  // ── Telemetry ───────────────────────────────────────────────────────────
  app.get('/api/stats', (_req, res) => {
    res.json(StatsRepository.getMetrics());
  });

  // ── System Logs ─────────────────────────────────────────────────────────
  app.get('/api/logs', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    res.json(SystemLogRepository.list(limit));
  });

  app.get('/api/logs/:id', (req, res) => {
    const log = SystemLogRepository.findById(parseInt(req.params.id));
    if (log) res.json(log);
    else res.status(404).json({ error: 'Log not found' });
  });

  app.post('/api/logs', (req, res) => {
    const { level, module, message, payload } = req.body;
    SystemLogRepository.create(level, module, message, payload);
    res.status(201).json({ status: 'logged' });
  });

  app.delete('/api/logs/:id', (req, res) => {
    SystemLogRepository.delete(parseInt(req.params.id));
    res.sendStatus(204);
  });

  // ── Roadmap (via Service for transactions/audit) ────────────────────────
  app.post('/api/roadmap', async (req, res) => {
    const { title, description, priority, roi_score, lane } = req.body;
    const result = await AuraService.createRoadmapMilestone(
      title, description, priority, roi_score, lane
    );
    res.status(201).json(result);
  });

  app.get('/api/roadmap', (_req, res) => {
    res.json(RoadmapRepository.list());
  });

  app.patch('/api/roadmap/:id', async (req, res) => {
    try {
      await AuraService.updateMilestone(req.params.id, req.body);
      res.sendStatus(204);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/roadmap/:id', (req, res) => {
    RoadmapRepository.delete(req.params.id);
    res.sendStatus(204);
  });

  // ── Research ────────────────────────────────────────────────────────────
  app.get('/api/snippets', (_req, res) => {
    res.json(SnippetRepository.findAll());
  });

  app.post('/api/snippets', (req, res) => {
    const { title, content, tags, source_url } = req.body;
    const id = crypto.randomUUID();
    SnippetRepository.create({ id, title, content, tags, source_url });
    res.status(201).json({ id });
  });

  app.patch('/api/snippets/:id', (req, res) => {
    try {
      SnippetRepository.update(req.params.id, req.body);
      res.sendStatus(204);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/snippets/:id', (req, res) => {
    SnippetRepository.delete(req.params.id);
    res.sendStatus(204);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Error-handling middleware (4-arg) — must be registered after the routes.
  // Catches malformed-JSON SyntaxError thrown by express.json() so the
  // process stays alive and the client gets a clean 400. Acceptance
  // criterion (TESTING.md): "API endpoints handle malformed JSON payloads
  // without crashing the process."
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON payload' });
    }
    return next(err);
  });

  return app;
}
