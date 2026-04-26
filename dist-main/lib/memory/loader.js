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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAuraMemory = void 0;
exports.loadAuraMemoryFromDisk = loadAuraMemoryFromDisk;
exports.initializeAuraMemory = initializeAuraMemory;
exports.getAuraMemory = getAuraMemory;
exports.reloadAuraMemory = reloadAuraMemory;
exports.startMemoryWatcher = startMemoryWatcher;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const MEMORY_DIR = path.join(os.homedir(), '.aura', 'memory');
const DEFAULTS = {
    'SOUL.md': `# AURA Identity

You are AURA — an intelligent local assistant built on AURA_LOCAL_SYNC.
You are direct, precise, and technically capable. You do not pad responses
with filler, caveats, or disclaimers unless they are genuinely necessary.

Your operating principles:
- Accuracy over speed. If uncertain, say so explicitly.
- Brevity over verbosity. Answer the question asked.
- Substance over style. Structure matters when it helps clarity.
- Ownership: when you produce code or analysis, stand behind it.
`,
    'USER.md': `# User Context

No user profile has been configured yet.

To personalise AURA's responses, edit this file at:
~/.aura/memory/USER.md

Example entries:
- Primary language: English
- Preferred code style: TypeScript, functional where idiomatic
- Domain focus: [your domain]
- Communication preference: terse / detailed
`,
    'AGENTS.md': `# Agent Configuration

## Research Agent
- Cite uncertainty explicitly rather than fabricating sources.
- Prefer structured answers (headers + bullets) for multi-part questions.

## Code Agent
- Produce idiomatic TypeScript. Avoid \`any\`.
- Always search before referencing file paths.
- Show only changed code unless the file is small.

## Synthesis Agent
- Never begin with filler phrases ("Certainly!", "Great!").
- Preserve all technical detail from specialist agents.
- Maintain a consistent voice across the final response.
`,
};
// ── Layer 1: disk reads ───────────────────────────────────────────────────────
function readMemoryFile(filePath, fileName) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, DEFAULTS[fileName] ?? '', 'utf-8');
        }
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch (err) {
        console.error(`[AURA MEMORY] Failed to read ${fileName}: ${err.message} — using empty fallback`);
        return '';
    }
}
/**
 * Pure disk read — no side effects on the in-memory cache.
 * Ensures the memory directory and default files exist, then reads all three.
 * Directory-creation failure is fatal (broken home dir / permissions).
 */
function loadAuraMemoryFromDisk() {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const soul = readMemoryFile(path.join(MEMORY_DIR, 'SOUL.md'), 'SOUL.md');
    const user = readMemoryFile(path.join(MEMORY_DIR, 'USER.md'), 'USER.md');
    const agents = readMemoryFile(path.join(MEMORY_DIR, 'AGENTS.md'), 'AGENTS.md');
    const combinedSystemContext = [
        soul ? `## AURA Identity (SOUL)\n${soul}` : '',
        user ? `## User Context\n${user}` : '',
        agents ? `## Agent Configuration\n${agents}` : '',
    ]
        .filter(Boolean)
        .join('\n---\n\n');
    return { soul, user, agents, combinedSystemContext };
}
// ── Layer 2: in-memory cache ──────────────────────────────────────────────────
let _cache = null;
/**
 * Load memory from disk and populate the cache.
 * Call once on server startup.
 */
function initializeAuraMemory() {
    _cache = loadAuraMemoryFromDisk();
    console.log('[AURA MEMORY] Initialized from ~/.aura/memory/');
}
/**
 * Return the cached memory.  Throws if initializeAuraMemory() was never called
 * so misconfigured start-ups fail loudly rather than silently using empty context.
 */
function getAuraMemory() {
    if (!_cache) {
        throw new Error('[AURA MEMORY] Cache not initialized — call initializeAuraMemory() at startup');
    }
    return _cache;
}
/**
 * Re-read all three markdown files from disk and atomically swap the cache.
 * On any error the previous cache is preserved and the error is re-thrown so
 * callers (e.g. the admin endpoint) can surface it to the client.
 */
function reloadAuraMemory() {
    const fresh = loadAuraMemoryFromDisk(); // throws on directory failure
    _cache = fresh;
    console.log('[AURA MEMORY] Reloaded from ~/.aura/memory/');
    return fresh;
}
// ── Layer 3: optional file-watch auto-reload ──────────────────────────────────
const watcher_1 = require("./watcher");
/**
 * Start watching ~/.aura/memory/ for changes and auto-reloading the cache.
 * Only activates when AURA_MEMORY_WATCH=true is set in the environment.
 * Returns a WatcherHandle so callers can stop the watcher on shutdown.
 * Returns null when the env flag is absent/false.
 */
function startMemoryWatcher() {
    if (process.env.AURA_MEMORY_WATCH !== 'true')
        return null;
    const handle = (0, watcher_1.createMemoryWatcher)(() => {
        // reloadAuraMemory already preserves last-known-good cache on error
        // and re-throws; the watcher catches and logs any thrown errors.
        reloadAuraMemory();
        console.log('[AURA MEMORY WATCHER] Cache refreshed');
    });
    console.log('[AURA MEMORY WATCHER] Watching ~/.aura/memory/ for changes');
    return handle;
}
// ── Legacy convenience export (keeps old call-sites compiling) ────────────────
/** @deprecated Use initializeAuraMemory() + getAuraMemory() instead. */
exports.loadAuraMemory = loadAuraMemoryFromDisk;
