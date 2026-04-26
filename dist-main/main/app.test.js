"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("./app");
const connection_1 = __importDefault(require("../db/connection"));
const loader = __importStar(require("../lib/memory/loader"));
// Schema migration + per-test table wipe come from tests/setup.ts.
let app;
(0, vitest_1.beforeAll)(() => {
    // Seed the cache so getAuraMemory() doesn't throw during tests.
    vitest_1.vi.spyOn(loader, 'getAuraMemory').mockReturnValue({
        soul: 'test soul',
        user: 'test user',
        agents: 'test agents',
        combinedSystemContext: 'test context',
    });
    app = (0, app_1.createApiApp)();
});
(0, vitest_1.describe)('GET /api/health', () => {
    (0, vitest_1.it)('returns ok', async () => {
        const res = await (0, supertest_1.default)(app).get('/api/health');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.status).toBe('ok');
        (0, vitest_1.expect)(res.body).toHaveProperty('providers');
    });
});
(0, vitest_1.describe)('System Logs API', () => {
    (0, vitest_1.it)('POST -> GET round-trips a log entry with payload serialization', async () => {
        const post = await (0, supertest_1.default)(app)
            .post('/api/logs')
            .send({ level: 'audit', module: 'TEST', message: 'hello', payload: { k: 'v' } });
        (0, vitest_1.expect)(post.status).toBe(201);
        (0, vitest_1.expect)(post.body).toEqual({ status: 'logged' });
        const list = await (0, supertest_1.default)(app).get('/api/logs');
        (0, vitest_1.expect)(list.status).toBe(200);
        (0, vitest_1.expect)(list.body).toHaveLength(1);
        (0, vitest_1.expect)(list.body[0]).toMatchObject({
            level: 'audit', module: 'TEST', message: 'hello',
        });
        // Payload is JSON-stringified server-side
        (0, vitest_1.expect)(JSON.parse(list.body[0].payload)).toEqual({ k: 'v' });
    });
    (0, vitest_1.it)('GET /api/logs/:id returns 404 for an unknown id', async () => {
        const res = await (0, supertest_1.default)(app).get('/api/logs/999999');
        (0, vitest_1.expect)(res.status).toBe(404);
        (0, vitest_1.expect)(res.body).toEqual({ error: 'Log not found' });
    });
    (0, vitest_1.it)('GET /api/logs/:id returns the single log when it exists', async () => {
        await (0, supertest_1.default)(app)
            .post('/api/logs')
            .send({ level: 'info', module: 'M', message: 'one' });
        const inserted = connection_1.default.prepare('SELECT id FROM system_logs LIMIT 1').get().id;
        const res = await (0, supertest_1.default)(app).get(`/api/logs/${inserted}`);
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.message).toBe('one');
    });
    (0, vitest_1.it)('respects ?limit on the list endpoint', async () => {
        for (let i = 0; i < 5; i++) {
            await (0, supertest_1.default)(app).post('/api/logs').send({
                level: 'info', module: 'BULK', message: `m${i}`,
            });
        }
        const res = await (0, supertest_1.default)(app).get('/api/logs?limit=2');
        (0, vitest_1.expect)(res.body).toHaveLength(2);
    });
    (0, vitest_1.it)('DELETE removes the row', async () => {
        await (0, supertest_1.default)(app).post('/api/logs').send({
            level: 'info', module: 'DEL', message: 'gone',
        });
        const id = connection_1.default.prepare('SELECT id FROM system_logs WHERE module = ?').get('DEL').id;
        const del = await (0, supertest_1.default)(app).delete(`/api/logs/${id}`);
        (0, vitest_1.expect)(del.status).toBe(204);
        const after = await (0, supertest_1.default)(app).get(`/api/logs/${id}`);
        (0, vitest_1.expect)(after.status).toBe(404);
    });
});
(0, vitest_1.describe)('Roadmap API', () => {
    (0, vitest_1.it)('POST creates a milestone AND emits an audit log atomically', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/roadmap').send({
            title: 'Ship v1', description: 'cut release branch',
            priority: 5, roi_score: 750, lane: 'release',
        });
        (0, vitest_1.expect)(res.status).toBe(201);
        (0, vitest_1.expect)(typeof res.body.id).toBe('string');
        const list = await (0, supertest_1.default)(app).get('/api/roadmap');
        (0, vitest_1.expect)(list.body).toHaveLength(1);
        (0, vitest_1.expect)(list.body[0]).toMatchObject({
            title: 'Ship v1', priority: 5, roi_score: 750, lane: 'release', status: 'todo',
        });
        // AuraService should have written a corresponding audit row
        const logs = await (0, supertest_1.default)(app).get('/api/logs');
        const audit = logs.body.find((l) => l.module === 'ROADMAP' && l.level === 'audit');
        (0, vitest_1.expect)(audit).toBeDefined();
        (0, vitest_1.expect)(audit.message).toContain('Ship v1');
    });
    (0, vitest_1.it)('PATCH updates a milestone and writes an info log', async () => {
        const created = await (0, supertest_1.default)(app).post('/api/roadmap').send({
            title: 'Refactor auth', priority: 1, roi_score: 100,
        });
        const id = created.body.id;
        const patch = await (0, supertest_1.default)(app).patch(`/api/roadmap/${id}`).send({ status: 'done' });
        (0, vitest_1.expect)(patch.status).toBe(204);
        const after = await (0, supertest_1.default)(app).get('/api/roadmap');
        (0, vitest_1.expect)(after.body[0].status).toBe('done');
        const logs = await (0, supertest_1.default)(app).get('/api/logs');
        (0, vitest_1.expect)(logs.body.some((l) => l.module === 'ROADMAP' && l.level === 'info')).toBe(true);
    });
    (0, vitest_1.it)('PATCH rejects an invalid verification_state with 400 (contract guard)', async () => {
        const created = await (0, supertest_1.default)(app).post('/api/roadmap').send({
            title: 'X', priority: 0, roi_score: 0,
        });
        const id = created.body.id;
        const bad = await (0, supertest_1.default)(app).patch(`/api/roadmap/${id}`).send({
            verification_state: 'totally-made-up',
        });
        (0, vitest_1.expect)(bad.status).toBe(400);
        (0, vitest_1.expect)(bad.body.error).toMatch(/verification_state/i);
    });
    (0, vitest_1.it)('DELETE removes the row', async () => {
        const created = await (0, supertest_1.default)(app).post('/api/roadmap').send({
            title: 'Doomed', priority: 0, roi_score: 0,
        });
        const id = created.body.id;
        const del = await (0, supertest_1.default)(app).delete(`/api/roadmap/${id}`);
        (0, vitest_1.expect)(del.status).toBe(204);
        const after = await (0, supertest_1.default)(app).get('/api/roadmap');
        (0, vitest_1.expect)(after.body).toHaveLength(0);
    });
});
(0, vitest_1.describe)('Snippets API', () => {
    (0, vitest_1.it)('POST creates a snippet (default verification_state = unverified)', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/snippets').send({
            title: 'Note 1', content: 'body', tags: ['a', 'b'], source_url: 'https://x',
        });
        (0, vitest_1.expect)(res.status).toBe(201);
        const list = await (0, supertest_1.default)(app).get('/api/snippets');
        (0, vitest_1.expect)(list.body).toHaveLength(1);
        (0, vitest_1.expect)(list.body[0].verification_state).toBe('unverified');
        (0, vitest_1.expect)(JSON.parse(list.body[0].tags)).toEqual(['a', 'b']);
    });
    (0, vitest_1.it)('PATCH promotes verification_state to a valid value', async () => {
        const created = await (0, supertest_1.default)(app).post('/api/snippets').send({
            title: 'N', content: '', tags: [],
        });
        const id = created.body.id;
        const patch = await (0, supertest_1.default)(app).patch(`/api/snippets/${id}`).send({
            verification_state: 'accepted',
            verification_reasoning: 'Cross-checked with source',
        });
        (0, vitest_1.expect)(patch.status).toBe(204);
        const list = await (0, supertest_1.default)(app).get('/api/snippets');
        (0, vitest_1.expect)(list.body[0].verification_state).toBe('accepted');
        (0, vitest_1.expect)(list.body[0].verification_reasoning).toBe('Cross-checked with source');
    });
    (0, vitest_1.it)('PATCH rejects garbage verification_state with 400', async () => {
        const created = await (0, supertest_1.default)(app).post('/api/snippets').send({
            title: 'N', content: '', tags: [],
        });
        const res = await (0, supertest_1.default)(app).patch(`/api/snippets/${created.body.id}`).send({
            verification_state: 'half_verified',
        });
        (0, vitest_1.expect)(res.status).toBe(400);
    });
});
(0, vitest_1.describe)('Model Runs API', () => {
    (0, vitest_1.it)('POST -> GET round-trips a queued run', async () => {
        const post = await (0, supertest_1.default)(app).post('/api/model-runs').send({
            model_id: 'gemini-3-flash-preview',
            prompt: 'scan the repo',
            status: 'queued',
        });
        (0, vitest_1.expect)(post.status).toBe(201);
        (0, vitest_1.expect)(typeof post.body.id).toBe('string');
        const list = await (0, supertest_1.default)(app).get('/api/model-runs');
        (0, vitest_1.expect)(list.body).toHaveLength(1);
        (0, vitest_1.expect)(list.body[0]).toMatchObject({
            model_id: 'gemini-3-flash-preview',
            prompt: 'scan the repo',
            status: 'queued',
        });
    });
    (0, vitest_1.it)('PATCH updates lifecycle fields', async () => {
        const created = await (0, supertest_1.default)(app).post('/api/model-runs').send({
            model_id: 'm', prompt: 'p', status: 'running',
        });
        const id = created.body.id;
        const patch = await (0, supertest_1.default)(app).patch(`/api/model-runs/${id}`).send({
            status: 'completed', latency_ms: 123, response: 'done',
        });
        (0, vitest_1.expect)(patch.status).toBe(204);
        const list = await (0, supertest_1.default)(app).get('/api/model-runs');
        (0, vitest_1.expect)(list.body[0]).toMatchObject({
            status: 'completed', latency_ms: 123, response: 'done',
        });
    });
    (0, vitest_1.it)('PATCH rejects invalid verification_state with 400', async () => {
        const created = await (0, supertest_1.default)(app).post('/api/model-runs').send({
            model_id: 'm', prompt: 'p',
        });
        const res = await (0, supertest_1.default)(app).patch(`/api/model-runs/${created.body.id}`).send({
            verification_state: 'bogus',
        });
        (0, vitest_1.expect)(res.status).toBe(400);
    });
});
(0, vitest_1.describe)('Telemetry API', () => {
    (0, vitest_1.it)('GET /api/stats reflects roadmap + snippet state', async () => {
        await (0, supertest_1.default)(app).post('/api/roadmap').send({
            title: 'Done thing', priority: 1, roi_score: 200,
        });
        // Promote it to done so the value signal counts it
        const items = (await (0, supertest_1.default)(app).get('/api/roadmap')).body;
        await (0, supertest_1.default)(app).patch(`/api/roadmap/${items[0].id}`).send({ status: 'done' });
        await (0, supertest_1.default)(app).post('/api/snippets').send({ title: 'S', content: '', tags: [] });
        const res = await (0, supertest_1.default)(app).get('/api/stats');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body).toMatchObject({
            totalValueSignal: 200,
            tasksCompleted: 1,
            activeProposals: 0,
            researchDensity: 1,
        });
        (0, vitest_1.expect)(typeof res.body.systemHealth).toBe('number');
        (0, vitest_1.expect)(Array.isArray(res.body.recentActivity)).toBe(true);
    });
});
(0, vitest_1.describe)('Process resilience', () => {
    (0, vitest_1.it)('returns 400 (not 500/crash) on malformed JSON', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/api/logs')
            .set('Content-Type', 'application/json')
            .send('{not valid json');
        (0, vitest_1.expect)(res.status).toBe(400);
        (0, vitest_1.expect)(res.body).toEqual({ error: 'Malformed JSON payload' });
    });
    (0, vitest_1.it)('survives the malformed request and continues serving', async () => {
        // After a bad request, normal routes still work.
        const res = await (0, supertest_1.default)(app).get('/api/health');
        (0, vitest_1.expect)(res.status).toBe(200);
    });
});
(0, vitest_1.describe)('POST /api/admin/reload-memory', () => {
    (0, vitest_1.it)('returns success shape on a clean reload', async () => {
        vitest_1.vi.spyOn(loader, 'reloadAuraMemory').mockReturnValue({
            soul: 'new soul',
            user: 'new user',
            agents: 'new agents',
            combinedSystemContext: 'new context',
        });
        const res = await (0, supertest_1.default)(app).post('/api/admin/reload-memory');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.success).toBe(true);
        (0, vitest_1.expect)(typeof res.body.reloadedAt).toBe('string');
        (0, vitest_1.expect)(res.body.files).toEqual(['SOUL.md', 'USER.md', 'AGENTS.md']);
    });
    (0, vitest_1.it)('returns 500 and preserves old cache when reload throws', async () => {
        vitest_1.vi.spyOn(loader, 'reloadAuraMemory').mockImplementation(() => {
            throw new Error('disk read failed');
        });
        // getAuraMemory should still return the previously seeded value.
        vitest_1.vi.spyOn(loader, 'getAuraMemory').mockReturnValue({
            soul: 'old soul',
            user: 'old user',
            agents: 'old agents',
            combinedSystemContext: 'old context',
        });
        const res = await (0, supertest_1.default)(app).post('/api/admin/reload-memory');
        (0, vitest_1.expect)(res.status).toBe(500);
        (0, vitest_1.expect)(res.body.success).toBe(false);
        (0, vitest_1.expect)(res.body.error).toMatch(/disk read failed/);
        // Cache still returns the pre-failure value.
        (0, vitest_1.expect)(loader.getAuraMemory().combinedSystemContext).toBe('old context');
    });
});
