"use strict";
/**
 * Express API factory.
 *
 * Extracted from src/main/index.ts so it can be exercised by Supertest
 * without booting the Vite middleware or binding to a port. The bootstrap
 * in index.ts wraps this with the dev-server middleware + listen call.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiApp = createApiApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const SystemLogRepository_1 = require("../db/repositories/SystemLogRepository");
const SnippetRepository_1 = require("../db/repositories/SnippetRepository");
const RoadmapRepository_1 = require("../db/repositories/RoadmapRepository");
const StatsRepository_1 = require("../db/repositories/StatsRepository");
const ModelRunRepository_1 = require("../db/repositories/ModelRunRepository");
const SupervisorStatsRepository_1 = require("../db/repositories/SupervisorStatsRepository");
const OrchestrateSessionRepository_1 = require("../db/repositories/OrchestrateSessionRepository");
const BlackboardEventRepository_1 = require("../db/repositories/BlackboardEventRepository");
const AuraService_1 = require("./services/AuraService");
const SupervisorRouter_1 = require("../lib/SupervisorRouter");
const prompts_1 = require("../lib/supervisors/prompts");
const ReactiveOrchestrator_1 = require("../lib/ReactiveOrchestrator");
const loader_1 = require("../lib/memory/loader");
function createApiApp() {
    const supervisorRouter = new SupervisorRouter_1.SupervisorRouter();
    const reactiveOrchestrator = new ReactiveOrchestrator_1.ReactiveOrchestrator();
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    // ── Model Runs ──────────────────────────────────────────────────────────
    app.get('/api/model-runs', (req, res) => {
        const limit = req.query.limit ? parseInt(req.query.limit) : 100;
        res.json(ModelRunRepository_1.ModelRunRepository.list(limit));
    });
    app.post('/api/model-runs', (req, res) => {
        const run = { ...req.body, id: crypto.randomUUID() };
        ModelRunRepository_1.ModelRunRepository.create(run);
        res.status(201).json({ id: run.id });
    });
    app.patch('/api/model-runs/:id', (req, res) => {
        try {
            ModelRunRepository_1.ModelRunRepository.update(req.params.id, req.body);
            res.sendStatus(204);
        }
        catch (e) {
            // assertVerificationState throws on bad input — surface as 400
            res.status(400).json({ error: e.message });
        }
    });
    // ── Telemetry ───────────────────────────────────────────────────────────
    app.get('/api/stats', (_req, res) => {
        res.json(StatsRepository_1.StatsRepository.getMetrics());
    });
    // ── System Logs ─────────────────────────────────────────────────────────
    app.get('/api/logs', (req, res) => {
        const limit = req.query.limit ? parseInt(req.query.limit) : 100;
        res.json(SystemLogRepository_1.SystemLogRepository.list(limit));
    });
    app.get('/api/logs/:id', (req, res) => {
        const log = SystemLogRepository_1.SystemLogRepository.findById(parseInt(req.params.id));
        if (log)
            res.json(log);
        else
            res.status(404).json({ error: 'Log not found' });
    });
    app.post('/api/logs', (req, res) => {
        const { level, module, message, payload } = req.body;
        SystemLogRepository_1.SystemLogRepository.create(level, module, message, payload);
        res.status(201).json({ status: 'logged' });
    });
    app.delete('/api/logs/:id', (req, res) => {
        SystemLogRepository_1.SystemLogRepository.delete(parseInt(req.params.id));
        res.sendStatus(204);
    });
    // ── Roadmap (via Service for transactions/audit) ────────────────────────
    app.post('/api/roadmap', async (req, res) => {
        const { title, description, priority, roi_score, lane } = req.body;
        const result = await AuraService_1.AuraService.createRoadmapMilestone(title, description, priority, roi_score, lane);
        res.status(201).json(result);
    });
    app.get('/api/roadmap', (_req, res) => {
        res.json(RoadmapRepository_1.RoadmapRepository.list());
    });
    app.patch('/api/roadmap/:id', async (req, res) => {
        try {
            await AuraService_1.AuraService.updateMilestone(req.params.id, req.body);
            res.sendStatus(204);
        }
        catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
    app.delete('/api/roadmap/:id', (req, res) => {
        RoadmapRepository_1.RoadmapRepository.delete(req.params.id);
        res.sendStatus(204);
    });
    // ── Research ────────────────────────────────────────────────────────────
    app.get('/api/snippets', (_req, res) => {
        res.json(SnippetRepository_1.SnippetRepository.findAll());
    });
    app.post('/api/snippets', (req, res) => {
        const { title, content, tags, source_url } = req.body;
        const id = crypto.randomUUID();
        SnippetRepository_1.SnippetRepository.create({ id, title, content, tags, source_url });
        res.status(201).json({ id });
    });
    app.patch('/api/snippets/:id', (req, res) => {
        try {
            SnippetRepository_1.SnippetRepository.update(req.params.id, req.body);
            res.sendStatus(204);
        }
        catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
    app.delete('/api/snippets/:id', (req, res) => {
        SnippetRepository_1.SnippetRepository.delete(req.params.id);
        res.sendStatus(204);
    });
    app.get('/api/health', async (_req, res) => {
        const providers = await supervisorRouter.providerHealth();
        res.json({ status: 'ok', providers });
    });
    // ── v2: Supervisor routing ──────────────────────────────────────────────
    app.post('/api/supervisor/route', async (req, res) => {
        let runId;
        try {
            const { objective, sessionId, domain } = req.body;
            if (sessionId) {
                const events = BlackboardEventRepository_1.BlackboardEventRepository.findBySession(sessionId);
                // 1. Prefer terminal events first
                const terminalTypes = ['synthesis_complete', 'escalation_required'];
                const terminal = [...events].reverse().find(e => terminalTypes.includes(e.event_type));
                if (terminal) {
                    return res.json({ final_response: terminal.content });
                }
                // 2. Prefer structured resolved state if exactly one clear answer exists
                const resolvedUpdates = events.filter(e => e.event_type === 'blackboard_update' && e.metadata?.resolved === true);
                if (resolvedUpdates.length === 1) {
                    return res.json({ final_response: resolvedUpdates[0].content });
                }
            }
            if (!objective)
                return res.status(400).json({ error: '`objective` is required' });
            const resolvedSessionId = sessionId || crypto.randomUUID();
            const resolvedDomain = domain || (0, prompts_1.classifyDomain)(objective);
            const task = {
                domain: resolvedDomain,
                objective,
                sessionId: resolvedSessionId,
            };
            // Persist the run as 'running' before the async work
            runId = crypto.randomUUID();
            ModelRunRepository_1.ModelRunRepository.create({
                id: runId,
                model_id: `supervisor:${resolvedDomain}`,
                prompt: objective,
                status: 'running',
                // session_id intentionally omitted: supervisor sessions live in the
                // Blackboard and are not rows in research_sessions (FK would fail).
            });
            const result = await supervisorRouter.route(task);
            // Update the run with the result
            ModelRunRepository_1.ModelRunRepository.update(runId, {
                response: result.final_response,
                status: 'completed',
                latency_ms: result.total_latency_ms,
                supervisor: result.supervisor,
                domain: result.domain,
                ...(result.escalation_reason ? { escalation_reason: result.escalation_reason } : {}),
            });
            // Log to system logs
            SystemLogRepository_1.SystemLogRepository.create('audit', 'SUPERVISOR', `${result.supervisor} completed (${result.domain}) in ${result.total_latency_ms}ms — ROI: ${result.roi_estimate}/10`, { run_id: runId, steps: result.steps.length, escalated: result.escalation });
            res.json({ run_id: runId, ...result });
        }
        catch (e) {
            console.error('[POST /api/supervisor/route]', e);
            try {
                if (runId)
                    ModelRunRepository_1.ModelRunRepository.update(runId, { status: 'failed' });
            }
            catch { /* best-effort — don't mask the original error */ }
            res.status(500).json({ error: e.message });
        }
    });
    // v2: Supervisor stats
    app.get('/api/supervisor/stats', (_req, res) => {
        res.json(SupervisorStatsRepository_1.SupervisorStatsRepository.findAll());
    });
    // ── v3: Orchestrate Sessions ────────────────────────────────────────────
    app.post('/api/sessions', (_req, res) => {
        const id = crypto.randomUUID();
        const session = OrchestrateSessionRepository_1.OrchestrateSessionRepository.create(id, 'New Session');
        res.status(201).json(session);
    });
    app.get('/api/sessions', (_req, res) => {
        res.json(OrchestrateSessionRepository_1.OrchestrateSessionRepository.list(50));
    });
    app.get('/api/sessions/:id/events', (req, res) => {
        res.json(BlackboardEventRepository_1.BlackboardEventRepository.findBySession(req.params.id));
    });
    app.delete('/api/sessions/:id', (req, res) => {
        BlackboardEventRepository_1.BlackboardEventRepository.deleteSession(req.params.id);
        OrchestrateSessionRepository_1.OrchestrateSessionRepository.delete(req.params.id);
        res.sendStatus(204);
    });
    // ── v3: Reactive Blackboard orchestrator ────────────────────────────────
    const inFlight = new Set();
    app.post('/api/orchestrate', async (req, res) => {
        let runId;
        let resolvedSessionId;
        try {
            const { message, sessionId } = req.body;
            if (!message?.trim())
                return res.status(400).json({ error: '`message` is required' });
            resolvedSessionId = sessionId || crypto.randomUUID();
            if (inFlight.has(resolvedSessionId)) {
                return res.status(409).json({ error: 'Session already in progress', session_id: resolvedSessionId });
            }
            inFlight.add(resolvedSessionId);
            const isStream = req.body.stream === true;
            const sendEvent = (event, data) => {
                if (isStream)
                    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            };
            if (isStream) {
                res.setHeader("Content-Type", "text/event-stream");
                res.setHeader("Cache-Control", "no-cache");
                res.setHeader("Connection", "keep-alive");
            }
            // Upsert the session row before executing — title = first 80 chars of message.
            const existingSession = OrchestrateSessionRepository_1.OrchestrateSessionRepository.findById(resolvedSessionId);
            if (!existingSession) {
                const title = message.trim().slice(0, 80);
                OrchestrateSessionRepository_1.OrchestrateSessionRepository.create(resolvedSessionId, title);
            }
            else {
                OrchestrateSessionRepository_1.OrchestrateSessionRepository.touch(resolvedSessionId);
            }
            runId = crypto.randomUUID();
            ModelRunRepository_1.ModelRunRepository.create({
                id: runId,
                model_id: 'orchestrator:reactive',
                prompt: message,
                status: 'running',
            });
            const result = await reactiveOrchestrator.run({
                sessionId: resolvedSessionId,
                message,
                onProgress: sendEvent
            });
            ModelRunRepository_1.ModelRunRepository.update(runId, {
                response: result.finalResponse,
                status: 'completed',
                latency_ms: result.totalLatencyMs,
            });
            SystemLogRepository_1.SystemLogRepository.create('audit', 'ORCHESTRATOR', `Session ${resolvedSessionId} — ${result.terminationReason} after ${result.totalLoops} loop(s) in ${result.totalLatencyMs}ms`, { run_id: runId, events: result.events.length });
            const payload = {
                run_id: runId,
                session_id: resolvedSessionId,
                sessionId: result.sessionId,
                finalResponse: result.finalResponse,
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
            }
            else {
                res.json(payload);
            }
        }
        catch (e) {
            console.error('[POST /api/orchestrate]', e);
            try {
                if (runId)
                    ModelRunRepository_1.ModelRunRepository.update(runId, { status: 'failed' });
            }
            catch { /* best-effort */ }
            res.status(500).json({ error: e.message });
        }
        finally {
            if (resolvedSessionId)
                inFlight.delete(resolvedSessionId);
        }
    });
    // ── Admin ────────────────────────────────────────────────────────────────
    app.post('/api/admin/reload-memory', (_req, res) => {
        try {
            (0, loader_1.reloadAuraMemory)();
            console.log('[AURA MEMORY] Hot-reload triggered via /api/admin/reload-memory');
            res.json({
                success: true,
                reloadedAt: new Date().toISOString(),
                files: ['SOUL.md', 'USER.md', 'AGENTS.md'],
            });
        }
        catch (err) {
            console.error('[AURA MEMORY] Hot-reload failed:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
    // Error-handling middleware (4-arg) — must be registered after the routes.
    // Catches malformed-JSON SyntaxError thrown by express.json() so the
    // process stays alive and the client gets a clean 400. Acceptance
    // criterion (TESTING.md): "API endpoints handle malformed JSON payloads
    // without crashing the process."
    app.use((err, _req, res, next) => {
        if (err && err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Malformed JSON payload' });
        }
        return next(err);
    });
    return app;
}
