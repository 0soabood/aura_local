"use strict";
/**
 * AURA_LOCAL_SYNC Main Process
 *
 * In a true Electron environment, this handles app lifecycle and window creation.
 * In this preview environment, it serves the Vite app + provides the API.
 *
 * Routes are defined in ./app.ts so they can be exercised in isolation by
 * Supertest without booting Vite or binding a port.
 */
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
// dotenv MUST be the first import so process.env is populated before any
// provider module captures it at class-instantiation time.
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env' });
console.log('[ENV] GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);
const vite_1 = require("vite");
const path_1 = __importDefault(require("path"));
const index_1 = require("../db/index");
const app_1 = require("./app");
const loader_1 = require("../lib/memory/loader");
async function bootstrap() {
    const PORT = 3000;
    // 1. Database Migrations
    index_1.schema.up();
    console.log('AURA DB initialized');
    // 2. Memory — load into cache at boot; getAuraMemory() is called per-request by orchestrators.
    (0, loader_1.initializeAuraMemory)();
    (0, loader_1.startMemoryWatcher)(); // no-op unless AURA_MEMORY_WATCH=true
    // 3. API routes (factored out so tests can mount this without Vite)
    const app = (0, app_1.createApiApp)();
    // 4. Renderer Integration
    if (process.env.NODE_ENV !== 'production') {
        const vite = await (0, vite_1.createServer)({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    }
    else {
        // Production serving
        const express = (await Promise.resolve().then(() => __importStar(require('express')))).default;
        const distPath = path_1.default.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(path_1.default.join(distPath, 'index.html'));
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
