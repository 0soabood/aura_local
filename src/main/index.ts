/**
 * AURA_LOCAL_SYNC Main Process
 * 
 * In a true Electron environment, this handles app lifecycle and window creation.
 * In this preview environment, it serves the Vite app + provides the API.
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { schema } from '../db/index';
import { SystemLogRepository } from '../db/repositories/SystemLogRepository';
import { SnippetRepository } from '../db/repositories/SnippetRepository';
import { RoadmapRepository } from '../db/repositories/RoadmapRepository';
import { StatsRepository } from '../db/repositories/StatsRepository';
import { ModelRunRepository } from '../db/repositories/ModelRunRepository';
import { AuraService } from './services/AuraService';

async function bootstrap() {
  const app = express();
  const PORT = 3000;

  // 1. Database Migrations
  schema.up();
  console.log('AURA DB initialized');

  app.use(cors());
  app.use(express.json());

  // 2. Domain Handlers (Equivalent to IPC Handlers)
  
  // Model Runs
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
    ModelRunRepository.update(req.params.id, req.body);
    res.sendStatus(204);
  });

  // Telemetry
  app.get('/api/stats', (req, res) => {
    res.json(StatsRepository.getMetrics());
  });

  // System Logs
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

  // Roadmap (via Service for transactions/audit)
  app.post('/api/roadmap', async (req, res) => {
    const { title, description, priority, roi_score, lane } = req.body;
    const result = await AuraService.createRoadmapMilestone(title, description, priority, roi_score, lane);
    res.status(201).json(result);
  });

  app.get('/api/roadmap', (req, res) => {
    res.json(RoadmapRepository.list());
  });

  app.patch('/api/roadmap/:id', async (req, res) => {
    await AuraService.updateMilestone(req.params.id, req.body);
    res.sendStatus(204);
  });

  app.delete('/api/roadmap/:id', (req, res) => {
    RoadmapRepository.delete(req.params.id);
    res.sendStatus(204);
  });

  // Research
  app.get('/api/snippets', (req, res) => {
    res.json(SnippetRepository.findAll());
  });

  app.post('/api/snippets', (req, res) => {
    const { title, content, tags, source_url } = req.body;
    const id = crypto.randomUUID();
    SnippetRepository.create({ id, title, content, tags, source_url });
    res.status(201).json({ id });
  });

  app.patch('/api/snippets/:id', (req, res) => {
    SnippetRepository.update(req.params.id, req.body);
    res.sendStatus(204);
  });

  app.delete('/api/snippets/:id', (req, res) => {
    SnippetRepository.delete(req.params.id);
    res.sendStatus(204);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 3. Renderer Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AURA MAIN] Process running at http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[AURA MAIN] Failed to start:', err);
  process.exit(1);
});
