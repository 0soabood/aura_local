/**
 * Express API factory.
 *
 * Extracted from src/main/index.ts so it can be exercised by Supertest
 * without booting the Vite middleware or binding to a port. The bootstrap
 * in index.ts wraps this with the dev-server middleware + listen call.
 */

import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { SystemLogRepository } from '../db/repositories/SystemLogRepository';
import { SnippetRepository } from '../db/repositories/SnippetRepository';
import { RoadmapRepository } from '../db/repositories/RoadmapRepository';
import { StatsRepository } from '../db/repositories/StatsRepository';
import { ModelRunRepository } from '../db/repositories/ModelRunRepository';
import { SupervisorStatsRepository } from '../db/repositories/SupervisorStatsRepository';
import { OrchestrateSessionRepository } from '../db/repositories/OrchestrateSessionRepository';
import { BlackboardEventRepository } from '../db/repositories/BlackboardEventRepository';
import { AuraService } from './services/AuraService';
import { SupervisorRouter } from '../lib/SupervisorRouter';
import { classifyDomain } from '../lib/supervisors/prompts';
import { SupervisorTask } from '../shared/types';
import { compiledGraph } from '../lib/graph/workflow';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { reloadAuraMemory, getAuraMemory } from '../lib/memory/loader';
import { writeMemoryFn } from '../lib/tools/builtin/write_memory';
import { broadcastEvent, debugEmitter } from '../lib/debug';
import db from '../db/connection';
import { ProviderRegistry } from '../lib/providers/ProviderRegistry';
import { getVetoManager } from '../lib/graph/workflow';
import { DEFAULT_VETO_CONFIG } from '../lib/veto/types';

// Cached ProviderRegistry instance (initialized once, reused across requests)
let cachedRegistry: any = null;
let registryInitializing: Promise<any> | null = null;
let registryInitialized = false;

async function getRegistry() {
  if (cachedRegistry && registryInitialized) return cachedRegistry;

  // Ensure only one initialization happens at a time
  if (registryInitializing) return registryInitializing;

  registryInitializing = (async () => {
    const registry = new ProviderRegistry();

    // Wait for async initialization (OpenRouter models) to complete
    if (registry.waitForInitialization) {
      await registry.waitForInitialization();
    } else {
      // Fallback: wait a reasonable time for async operations
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    cachedRegistry = registry;
    registryInitialized = true;
    registryInitializing = null;
    return registry;
  })();

  return registryInitializing;
}

/** Parse a query param integer, clamped to [min, max]. Returns null if the value is present but not a valid integer. */
function parseLimitParam(val: string | undefined, defaultVal = 100, min = 1, max = 500): number | null {
  if (val === undefined || val === '') return defaultVal;
  const n = parseInt(val, 10);
  if (isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/** Parse a numeric ID param. Returns null if not a valid integer. */
function parseIdParam(val: string): number | null {
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

export function createApiApp(): Express {
  const supervisorRouter = new SupervisorRouter();
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ── API Key Authentication Middleware ────────────────────────────────
  // Checks for X-API-Key header. Set AURA_API_KEY env var, or it defaults to 'dev-key'
  // Disabled in development/Docker mode for easier local testing
  const API_KEY = process.env.AURA_API_KEY || 'dev-key';
  const isDevMode = process.env.NODE_ENV === 'development' || process.env.RUNNING_IN_DOCKER === 'true';

  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for health endpoint
    if (req.path === '/api/health') return next();
    
    // Skip auth in development/Docker mode (local-first app)
    if (isDevMode) return next();
    
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || apiKey !== API_KEY) {
      SystemLogRepository.create('warn', 'API', `Unauthorized request to ${req.path}`, { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized. Provide valid X-API-Key header.' });
    }
    next();
  };
  app.use('/api', authMiddleware);

  // ── Rate Limiting Middleware ────────────────────────────────────────
  // Simple in-memory rate limiter: 100 requests per 15 minutes per IP
  const rateLimitWindowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequestsPerWindow = 100;
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    let record = requestCounts.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + rateLimitWindowMs };
    }
    
    record.count++;
    requestCounts.set(ip, record);
    
    res.setHeader('X-RateLimit-Limit', maxRequestsPerWindow.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequestsPerWindow - record.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    
    if (record.count > maxRequestsPerWindow) {
      SystemLogRepository.create('warn', 'API', `Rate limit exceeded for ${ip}`, { path: req.path });
      return res.status(429).json({ 
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }
    
    next();
  };
  app.use('/api', rateLimitMiddleware);

  // ── Model Runs ──────────────────────────────────────────────────────────
  app.get('/api/model-runs', (req, res) => {
    const limit = parseLimitParam(req.query.limit as string | undefined);
    if (limit === null) return res.status(400).json({ error: '`limit` must be a positive integer' });
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
    const limit = parseLimitParam(req.query.limit as string | undefined);
    if (limit === null) return res.status(400).json({ error: '`limit` must be a positive integer' });
    res.json(SystemLogRepository.list(limit));
  });

  app.get('/api/logs/:id', (req, res) => {
    const id = parseIdParam(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid id' });
    const log = SystemLogRepository.findById(id);
    if (log) res.json(log);
    else res.status(404).json({ error: 'Log not found' });
  });

  app.post('/api/logs', (req, res) => {
    const { level, module, message, payload } = req.body;
    SystemLogRepository.create(level, module, message, payload);
    res.status(201).json({ status: 'logged' });
  });

  app.delete('/api/logs/:id', (req, res) => {
    const id = parseIdParam(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid id' });
    SystemLogRepository.delete(id);
    res.sendStatus(204);
  });

  // ── Roadmap (via Service for transactions/audit) ────────────────────────
  app.post('/api/roadmap', async (req, res) => {
    const { title, description, priority, roi_score, lane } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: '`title` is required' });
    }
    if (title.length > 500) {
      return res.status(400).json({ error: '`title` must be 500 characters or fewer' });
    }
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
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: '`title` is required' });
    }
    if (content && typeof content === 'string' && content.length > 50_000) {
      return res.status(400).json({ error: '`content` must be 50,000 characters or fewer' });
    }
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

  app.get('/api/health', async (_req, res) => {
    const providers = await supervisorRouter.providerHealth();
    res.json({ status: 'ok', providers });
  });

  // ── Available Models ─────────────────────────────────────────────────
  app.get('/api/models', async (_req, res) => {
    const registry = await getRegistry();
    const configs = registry.getAllProviders();

    // Group models by provider
    const providers: Array<{
      id: string;
      name: string;
      hasKey: boolean;
      models: Array<{ id: string; label: string }>;
    }> = [];

    for (const cfg of configs) {
      const hasKey = !!process.env[cfg.envKey];
      const providerName = cfg.id.toUpperCase();

      const providerEntry = {
        id: cfg.id,
        name: hasKey ? `${providerName}` : `${providerName} 🔒`,
        hasKey,
        models: [] as Array<{ id: string; label: string }>,
      };

      if (cfg.models && cfg.models.length > 0) {
        for (const model of cfg.models) {
          providerEntry.models.push({
            id: `${cfg.id}:${model.id}`,
            label: model.name || model.id,
          });
        }
      } else {
        // Fallback: just add the default model for this provider
        providerEntry.models.push({
          id: `${cfg.id}:${cfg.defaultModel}`,
          label: cfg.defaultModel,
        });
      }

      providers.push(providerEntry);
    }

    res.json({
      defaultModel: 'auto',
      providers,
    });
  });

  // ── v2: Supervisor routing ──────────────────────────────────────────────
  app.post('/api/supervisor/route', async (req, res) => {
    let runId: string | undefined;
    try {
      const { objective, sessionId, domain } = req.body;

      if (sessionId) {
        const events = BlackboardEventRepository.findBySession(sessionId);
        
        // 1. Prefer terminal events first
        const terminalTypes = ['synthesis_complete', 'escalation_required'];
        const terminal = [...events].reverse().find(e => terminalTypes.includes(e.event_type));
        if (terminal) {
          return res.json({ final_response: terminal.content });
        }
      }

      if (!objective) return res.status(400).json({ error: '`objective` is required' });

      const resolvedSessionId = sessionId || crypto.randomUUID();
      const resolvedDomain    = domain || classifyDomain(objective);

      const task: SupervisorTask = {
        domain:    resolvedDomain,
        objective,
        sessionId: resolvedSessionId,
      };

      // Persist the run as 'running' before the async work
      runId = crypto.randomUUID();
      ModelRunRepository.create({
        id:       runId,
        model_id: `supervisor:${resolvedDomain}`,
        prompt:   objective,
        status:   'running',
        // session_id intentionally omitted: supervisor sessions live in the
        // Blackboard and are not rows in research_sessions (FK would fail).
      });

      const result = await supervisorRouter.route(task);

      // Update the run with the result
      ModelRunRepository.update(runId, {
        response:   result.final_response,
        status:     'completed',
        latency_ms: result.total_latency_ms,
        supervisor: result.supervisor,
        domain:     result.domain,
        ...(result.escalation_reason ? { escalation_reason: result.escalation_reason } : {}),
      });

      // Log to system logs
      SystemLogRepository.create(
        'audit',
        'SUPERVISOR',
        `${result.supervisor} completed (${result.domain}) in ${result.total_latency_ms}ms — ROI: ${result.roi_estimate}/10`,
        { run_id: runId, steps: result.steps.length, escalated: result.escalation },
      );

      res.json({ run_id: runId, ...result });
    } catch (e: any) {
      console.error('[POST /api/supervisor/route]', e);
      try {
        if (runId) ModelRunRepository.update(runId, { status: 'failed' });
      } catch { /* best-effort — don't mask the original error */ }
      res.status(500).json({ error: e.message });
    }
  });

  // v2: Supervisor stats
  app.get('/api/supervisor/stats', (_req, res) => {
    res.json(SupervisorStatsRepository.findAll());
  });

  // ── v3: Orchestrate Sessions ────────────────────────────────────────────

  const inFlight = new Set<string>();

  app.post('/api/sessions', (_req, res) => {
    const id = crypto.randomUUID();
    const session = OrchestrateSessionRepository.create(id, 'New Session');
    res.status(201).json({ ...session, status: 'idle' });
  });

  app.get('/api/sessions', (_req, res) => {
    const sessions = OrchestrateSessionRepository.list(50);
    res.json(sessions.map(s => ({
      ...s,
      status: inFlight.has(s.id) ? 'running' : 'idle',
      state: inFlight.has(s.id) ? 'running' : 'idle'
    })));
  });

  app.patch('/api/sessions/:id', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: '`title` is required' });
    // Safe fallback to raw DB query since OrchestrateSessionRepository might lack an update method
    db.prepare('UPDATE orchestrate_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, req.params.id);
    res.sendStatus(204);
  });

  app.get('/api/sessions/:id/events', (req, res) => {
    res.json(BlackboardEventRepository.findBySession(req.params.id));
  });

  app.delete('/api/sessions/:id', (req, res) => {
    BlackboardEventRepository.deleteSession(req.params.id);
    OrchestrateSessionRepository.delete(req.params.id);
    res.sendStatus(204);
  });

  // ── v3: Reactive Blackboard orchestrator ────────────────────────────────

  app.post('/api/orchestrate', async (req, res) => {
    let runId: string | undefined;
    let resolvedSessionId!: string;
    let handleDebugEvent: ((payload: any) => void) | undefined;
    try {
      console.log(`[API] POST /api/orchestrate received for session ${req.body.sessionId || '(new)'}`);
      const { message, sessionId } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: '`message` is required' });
      if (message.length > 10_000) return res.status(400).json({ error: '`message` must be 10,000 characters or fewer' });

      resolvedSessionId = sessionId || crypto.randomUUID();

      if (inFlight.has(resolvedSessionId)) {
        return res.status(409).json({ error: 'Session already in progress', session_id: resolvedSessionId });
      }
      inFlight.add(resolvedSessionId);

      const isStream = req.body.stream === true;
      const sendEvent = (event: string, data: any) => {
        if (isStream) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      handleDebugEvent = (payload: any) => {
        // Assign an ephemeral ID for the frontend to de-duplicate effectively
        const ev = { id: payload.id || crypto.randomUUID(), ...payload };
        sendEvent('agent_event', ev);
      };

      if (isStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders(); // CRITICAL: Prevent Vite from buffering the SSE stream!
        
        // Listen for internal broadcasts to stream live ReAct trace
        debugEmitter.on(`debug:${resolvedSessionId}`, handleDebugEvent);
      }

      // Upsert the session row before executing — title = first 80 chars of message.
      const existingSession = OrchestrateSessionRepository.findById(resolvedSessionId);
      if (!existingSession) {
        const title = message.trim().slice(0, 80);
        OrchestrateSessionRepository.create(resolvedSessionId, title);
      } else {
        OrchestrateSessionRepository.touch(resolvedSessionId);
      }

      BlackboardEventRepository.append(resolvedSessionId, 'user_message', 'user', message);
      broadcastEvent(resolvedSessionId, { event_type: 'user_message', author: 'user', content: message });

      runId = crypto.randomUUID();
      ModelRunRepository.create({
        id:       runId,
        model_id: 'orchestrator:reactive',
        prompt:   message,
        status:   'running',
      });

      const startTime = Date.now();
      const threadConfig = { configurable: { thread_id: resolvedSessionId } };

      // Fetch past events to build robust chat history for LangGraph (protects against server restart amnesia)
      const pastEvents = BlackboardEventRepository.findBySession(resolvedSessionId);
      const chatHistory: BaseMessage[] = [];
      for (const e of pastEvents) {
        if (e.event_type === 'user_message') {
          chatHistory.push(new HumanMessage(e.content));
        } else if (e.event_type === 'synthesis_complete') {
          chatHistory.push(new AIMessage(e.content));
        } else if (['agent_output', 'code_written'].includes(e.event_type)) {
          // Promote specialist agent outputs to the persistent chat history
          // so they survive server restarts and provide context for the next turn.
          chatHistory.push(new AIMessage(`[${e.author}]: ${e.content}`));
        } else if (e.event_type === 'execution_error') {
          // Errors are treated as system feedback (HumanMessage) so the agent can self-correct
          chatHistory.push(new HumanMessage(`[system — execution error from ${e.author}]: ${e.content}`));
        }
      }

      // Get user-selected model and energy mode from request body
      const preferredModel = req.body.preferredModel || '';
      const energyMode = req.body.energyMode || 'high';
      const modelConfig = req.body.modelConfig || {};
      const agentModelOverrides = req.body.agentModelOverrides || {};

      // Provide a fully formed initial state to prevent reducer initialization hangs
      const initialState = {
        chatHistory,
        taskWorkspace: [],
        errorCount: 0,
        activeAgent: 'orchestrator',
        preferredModel,
        modelConfig,
        agentModelOverrides,
        energyMode,
        sessionId: resolvedSessionId, // Pass sessionId for debug broadcasting
      };

      let finalState: any = {};
      console.log(`[API] Invoking LangGraph for thread: ${resolvedSessionId}`);

      try {
        if (isStream) {
          // Drop streamMode: "values" which can silently deadlock generators in some Node versions.
          // Use the default stream mode, which yields safe node updates.
          const stream = await compiledGraph.stream(initialState, threadConfig);
          for await (const chunk of stream) {
          const chunkRecord = chunk as Record<string, any>;
          const nodeName = Object.keys(chunkRecord)[0];
          const stateChunk = chunkRecord[nodeName];
            sendEvent('progress', {
              agent: stateChunk?.activeAgent || nodeName,
              workspaceLength: stateChunk?.taskWorkspace?.length || 0
            });
          }
          // Fetch the true final state from the checkpointer once the stream finishes
          finalState = (await compiledGraph.getState(threadConfig)).values;
        } else {
          finalState = await compiledGraph.invoke(initialState, threadConfig);
        }
        console.log(`[API] LangGraph execution completed.`);
      } catch (graphErr: any) {
        console.error(`[API] LangGraph threw an error:`, graphErr);
        throw graphErr;
      }

      let finalResponse = "Workflow ended without generating a response.";
      let finalEventType: 'synthesis_complete' | 'escalation_required' = 'synthesis_complete';
      let modelId = 'unknown';
      let tokensIn = 0;
      let tokensOut = 0;

      if (finalState?.chatHistory?.length > 0) {
        const lastMessage = finalState.chatHistory[finalState.chatHistory.length - 1];
        // Only consider the response final if it's from the AI.
        if (lastMessage._getType() === 'ai') {
          finalResponse = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
          if (finalResponse.startsWith('[execution_error]: ')) {
            finalEventType = 'escalation_required';
            finalResponse = finalResponse.replace('[execution_error]: ', '');
          }
          const meta = (lastMessage as any).response_metadata || {};
          modelId = meta.model_name || meta.model || 'unknown';
          tokensIn = meta.tokenUsage?.promptTokens || 0;
          tokensOut = meta.tokenUsage?.completionTokens || 0;
        }
      }

      BlackboardEventRepository.append(resolvedSessionId, finalEventType, 'synthesis_agent', finalResponse, { graph_mode: true });
      broadcastEvent(resolvedSessionId, { event_type: finalEventType, author: 'synthesis_agent', content: finalResponse, metadata: { graph_mode: true } });

      const result = {
        sessionId: resolvedSessionId,
        finalResponse: finalResponse,
        terminationReason: 'completed', // If the execution reaches this point without throwing, it completed successfully
        totalLoops: finalState?.taskWorkspace?.length || 1,
        totalLatencyMs: Date.now() - startTime,
        events: BlackboardEventRepository.findBySession(resolvedSessionId)
      };

      ModelRunRepository.update(runId, {
        response:   result.finalResponse,
        status:     'completed',
        latency_ms: result.totalLatencyMs,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
      });

      SystemLogRepository.create(
        'audit',
        'ORCHESTRATOR',
        `Session ${resolvedSessionId} — ${result.terminationReason} after ${result.totalLoops} loop(s) in ${result.totalLatencyMs}ms`,
        { run_id: runId, events: result.events.length },
      );

      const payload: Record<string, any> = {
        run_id: runId,
        session_id: resolvedSessionId,
        sessionId: result.sessionId,
        finalResponse: result.finalResponse,
        text: result.finalResponse,
        metadata: {
          agent: 'synthesis_agent',
          model: modelId,
          latencyMs: result.totalLatencyMs,
          tokensIn,
          tokensOut,
          eventType: finalEventType,
        },
        terminationReason: result.terminationReason,
        totalLoops: result.totalLoops,
        totalLatencyMs: result.totalLatencyMs,
      };

      if (req.body.debug === true) {
        payload.events = result.events;
      }

      if (isStream) {
        sendEvent('done', payload);
        res.end();
      } else {
        res.json(payload);
      }
    } catch (e: any) {
      console.error('[POST /api/orchestrate]', e);
      try { if (runId) ModelRunRepository.update(runId, { status: 'failed' }); } catch { /* best-effort */ }
      
      if (res.headersSent) {
        if (req.body?.stream === true) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
        }
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    } finally {
      if (resolvedSessionId) {
        inFlight.delete(resolvedSessionId);
        if (handleDebugEvent) {
          debugEmitter.off(`debug:${resolvedSessionId}`, handleDebugEvent);
        }
      }
    }
  });

  // ── ROI Events ──────────────────────────────────────────────────────────

  app.get('/api/roi-events', (_req, res) => {
    res.json(db.prepare('SELECT * FROM roi_events ORDER BY occurred_at DESC').all());
  });

  // ── ROI Aggregation (Top Consumers) ──────────────────────────────────────

  app.get('/api/roi-events/aggregate', (_req, res) => {
    const rows = db.prepare(`
      SELECT source, SUM(amount) as total_amount
      FROM roi_events
      WHERE type = 'expense'
      GROUP BY source
      ORDER BY total_amount DESC
      LIMIT 10
    `).all() as { source: string; total_amount: number }[];
    res.json(rows.map(r => ({ name: r.source, cost: Math.abs(r.total_amount) })));
  });

  app.post('/api/roi-events', (req, res) => {
    const { type, amount, currency, source, description, occurred_at } = req.body;
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO roi_events (id, type, amount, currency, source, description, verification_state, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'unverified', ?, CURRENT_TIMESTAMP)
    `).run(id, type, amount, currency, source, description, occurred_at || new Date().toISOString());
    res.status(201).json({ id });
  });

  app.patch('/api/roi-events/:id', (req, res) => {
    const updates = Object.entries(req.body).filter(([k]) => k !== 'id');
    if (updates.length === 0) return res.sendStatus(204);
    const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE roi_events SET ${setClause} WHERE id = ?`).run(...updates.map(([, v]) => v), req.params.id);
    res.sendStatus(204);
  });

  app.delete('/api/roi-events/:id', (req, res) => {
    db.prepare('DELETE FROM roi_events WHERE id = ?').run(req.params.id);
    res.sendStatus(204);
  });

  // ── Stats V2 (live aggregation) ───────────────────────────────────────

  app.get('/api/stats-v2', (_req, res) => {
    // Get basic stats
    const routes = db.prepare('SELECT COUNT(*) as count FROM model_runs').get() as { count: number };
    const latency = db.prepare('SELECT AVG(latency_ms) as avg FROM model_runs WHERE latency_ms > 0').get() as { avg: number };
    const success = db.prepare(`
      SELECT 
        CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as rate
      FROM model_runs
    `).get() as { rate: number };
    const tokenCost = db.prepare(`
      SELECT SUM(amount) as total
      FROM roi_events
      WHERE type = 'expense'
    `).get() as { total: number };

    const hourlyBuckets = Array(24).fill(0);
    const routeCountSeries = Array(24).fill(0);
    const successRateSeries = Array(24).fill(0);

    const routeSeriesRows = db.prepare(`
      SELECT
        CAST((strftime('%s', 'now') - strftime('%s', created_at)) / 3600 AS INTEGER) as hours_ago,
        COUNT(*) as run_count,
        AVG(CASE WHEN latency_ms > 0 THEN latency_ms END) as avg_ms,
        CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as success_rate
      FROM model_runs
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY hours_ago
    `).all() as Array<{
      hours_ago: number;
      run_count: number;
      avg_ms: number | null;
      success_rate: number | null;
    }>;

    routeSeriesRows.forEach((row) => {
      if (row.hours_ago < 0 || row.hours_ago > 23) return;
      const bucketIndex = 23 - row.hours_ago;
      routeCountSeries[bucketIndex] = row.run_count || 0;
      hourlyBuckets[bucketIndex] = row.avg_ms || 0;
      successRateSeries[bucketIndex] = row.success_rate || 0;
    });

    const spendSeriesUsd = Array(7).fill(0);
    const spendSeriesRows = db.prepare(`
      SELECT
        CAST(julianday('now') - julianday(occurred_at) AS INTEGER) as days_ago,
        SUM(ABS(amount)) as total_amount
      FROM roi_events
      WHERE type = 'expense'
        AND occurred_at >= datetime('now', '-7 days')
      GROUP BY days_ago
    `).all() as Array<{ days_ago: number; total_amount: number | null }>;

    spendSeriesRows.forEach((row) => {
      if (row.days_ago < 0 || row.days_ago > 6) return;
      const bucketIndex = 6 - row.days_ago;
      spendSeriesUsd[bucketIndex] = row.total_amount || 0;
    });

    // Get top consumers
    const topConsumers = db.prepare(`
      SELECT source, SUM(amount) as total_amount
      FROM roi_events
      WHERE type = 'expense'
      GROUP BY source
      ORDER BY total_amount DESC
      LIMIT 5
    `).all() as { source: string; total_amount: number }[];
    
    res.json({
      total_routes: routes?.count || 0,
      avg_latency_ms: latency?.avg || 0,
      success_rate: success?.rate || 0,
      est_token_cost_usd: Math.abs(tokenCost?.total || 0),
      route_count_series: routeCountSeries,
      hourly_latency_ms: hourlyBuckets,
      success_rate_series: successRateSeries,
      spend_series_usd: spendSeriesUsd,
      top_consumers: topConsumers.map(r => ({ name: r.source, cost: Math.abs(r.total_amount) })),
    });
  });

  // ── Admin ────────────────────────────────────────────────────────────────
  app.post('/api/admin/reload-memory', (_req, res) => {
    try {
      reloadAuraMemory();
      console.log('[AURA MEMORY] Hot-reload triggered via /api/admin/reload-memory');
      res.json({
        success: true,
        reloadedAt: new Date().toISOString(),
        files: ['SOUL.md', 'USER.md', 'AGENTS.md'],
      });
    } catch (err: any) {
      console.error('[AURA MEMORY] Hot-reload failed:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Memory file read/write ────────────────────────────────────────────────

  app.get('/api/aura-roadmap', (_req, res) => {
    try {
      const roadmapPath = path.resolve(process.cwd(), 'AURA.md');
      const content = fs.existsSync(roadmapPath)
        ? fs.readFileSync(roadmapPath, 'utf-8')
        : '# AURA.md not found\n\nCreate AURA.md in the project root.';
      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const MEMORY_FILE_ALLOWLIST = ['SOUL', 'USER', 'AGENTS'] as const;
  type MemoryFileKey = typeof MEMORY_FILE_ALLOWLIST[number];

  app.get('/api/memory/:file', (req, res) => {
    const file = req.params.file?.toUpperCase() as MemoryFileKey;
    if (!(MEMORY_FILE_ALLOWLIST as readonly string[]).includes(file)) {
      return res.status(400).json({ error: `Invalid memory file. Allowed: ${MEMORY_FILE_ALLOWLIST.join(', ')}` });
    }
    try {
      const mem = getAuraMemory();
      const content = file === 'SOUL' ? mem.soul : file === 'USER' ? mem.user : mem.agents;
      res.json({ file, content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/memory/:file', async (req, res) => {
    const file = req.params.file?.toUpperCase() as MemoryFileKey;
    if (!(MEMORY_FILE_ALLOWLIST as readonly string[]).includes(file)) {
      return res.status(400).json({ error: `Invalid memory file. Allowed: ${MEMORY_FILE_ALLOWLIST.join(', ')}` });
    }
    const { content } = req.body as { content?: string };
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required and must be a non-empty string.' });
    }
    if (content.length > 50_000) {
      return res.status(400).json({ error: 'content exceeds maximum length of 50,000 characters.' });
    }
    try {
      await writeMemoryFn({ file, content });
      res.json({ success: true, file, updatedAt: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Settings Persistence ───────────────────────────────────────────
  // Save settings to backend (synced from Zustand persist on save)
  app.put('/api/settings', async (req, res) => {
    const { selectedModel, modelConfig, agentModelOverrides, energyMode, brainDumpMode } = req.body;
    try {
      // For now, we log the settings to system_logs as the "database"
      // In production, this would write to a `settings` table
      SystemLogRepository.create('audit', 'SETTINGS', 'Settings updated', {
        selectedModel: selectedModel || 'auto',
        modelConfig: modelConfig || {},
        agentModelOverrides: agentModelOverrides || {},
        energyMode: energyMode || 'high',
        brainDumpMode: !!brainDumpMode,
      });
      res.sendStatus(204);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Load settings from backend
  app.get('/api/settings', async (_req, res) => {
    try {
      // In production, this would read from a `settings` table
      // For now, return defaults (Zustand persist handles the real loading)
      res.json({
        selectedModel: 'auto',
        modelConfig: {},
        agentModelOverrides: {},
        energyMode: 'high',
        brainDumpMode: false,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Veto Layer ───────────────────────────────────────────────────────
  // Get pending approval actions for a session
  app.get('/api/veto/pending', (req, res) => {
    const sessionId = req.query.sessionId as string || '';
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    
    try {
      const vetoManager = getVetoManager(sessionId);
      const pendingActions = vetoManager.getPendingActions();
      res.json({ pendingActions, sessionId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Approve a pending action
  app.post('/api/veto/:actionId/approve', async (req, res) => {
    const { actionId } = req.params;
    const { sessionId } = req.body;
    
    if (!actionId) return res.status(400).json({ error: 'actionId is required' });
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    
    try {
      const vetoManager = getVetoManager(sessionId);
      const action = vetoManager.approveAction(actionId);
      
      if (!action) {
        return res.status(404).json({ error: 'Action not found or already processed' });
      }
      
      SystemLogRepository.create('audit', 'VETO', `Action ${actionId} approved`, {
        actionId,
        sessionId,
        decision: 'approved',
        toolName: action.toolName,
      });
      
      // Resume the workflow with the approved action
      // Note: LangGraph interrupt() pauses the workflow and returns the interrupt value
      // The client needs to resume by calling the workflow again with the approved args
      // For now, we'll log that approval was given and the workflow should be resumed
      console.log('[Veto] Action approved. Workflow resume needs to be triggered from client side.');
      console.log('[Veto] Approved action:', action.toolName, action.toolArgs);
      
      // In a full implementation, you would:
      // 1. Store the approved action in a way the workflow can access it
      // 2. Trigger the workflow to resume (possibly via WebSocket message to client)
      // 3. The client would then re-invoke the workflow with the resume value
      
      res.json({ success: true, actionId, decision: 'approved', action });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reject a pending action
  app.post('/api/veto/:actionId/reject', (req, res) => {
    const { actionId } = req.params;
    const { sessionId, notes } = req.body;
    
    if (!actionId) return res.status(400).json({ error: 'actionId is required' });
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    
    try {
      const vetoManager = getVetoManager(sessionId);
      const action = vetoManager.rejectAction(actionId, notes);
      
      if (!action) {
        return res.status(404).json({ error: 'Action not found or already processed' });
      }
      
      SystemLogRepository.create('audit', 'VETO', `Action ${actionId} rejected`, {
        actionId,
        sessionId,
        decision: 'rejected',
        notes,
        toolName: action.toolName,
      });
      
      res.json({ success: true, actionId, decision: 'rejected', action });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Modify and approve a pending action
  app.post('/api/veto/:actionId/modify', (req, res) => {
    const { actionId } = req.params;
    const { sessionId, modifiedArgs, notes } = req.body;
    
    if (!actionId) return res.status(400).json({ error: 'actionId is required' });
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!modifiedArgs) return res.status(400).json({ error: 'modifiedArgs is required' });
    
    try {
      const vetoManager = getVetoManager(sessionId);
      const action = vetoManager.modifyAction(actionId, modifiedArgs, notes);
      
      if (!action) {
        return res.status(404).json({ error: 'Action not found or already processed' });
      }
      
      SystemLogRepository.create('audit', 'VETO', `Action ${actionId} modified and approved`, {
        actionId,
        sessionId,
        decision: 'modified',
        modifiedArgs,
        notes,
        toolName: action.toolName,
      });
      
      res.json({ success: true, actionId, decision: 'modified', action });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get veto configuration
  app.get('/api/veto/config', (req, res) => {
    const sessionId = req.query.sessionId as string || '';
    try {
      if (sessionId) {
        const vetoManager = getVetoManager(sessionId);
        // Return session-specific config (would need getConfig method)
        res.json(DEFAULT_VETO_CONFIG);
      } else {
        res.json(DEFAULT_VETO_CONFIG);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update veto configuration
  app.put('/api/veto/config', (req, res) => {
    const { sessionId, defaultBehavior, tierOverrides, alwaysRequireFor, neverRequireFor } = req.body;
    
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    
    try {
      const vetoManager = getVetoManager(sessionId);
      vetoManager.updateConfig({
        ...(defaultBehavior !== undefined ? { defaultBehavior } : {}),
        ...(tierOverrides ? { tierOverrides } : {}),
        ...(alwaysRequireFor ? { alwaysRequireFor } : {}),
        ...(neverRequireFor ? { neverRequireFor } : {}),
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return app;
}
