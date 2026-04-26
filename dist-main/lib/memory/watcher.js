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
exports.createMemoryWatcher = createMemoryWatcher;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const MEMORY_DIR = path.join(os.homedir(), '.aura', 'memory');
const WATCHED_FILES = ['SOUL.md', 'USER.md', 'AGENTS.md'];
/**
 * Watch the three AURA memory files and call `onReload` after `debounceMs` of
 * silence.  Returns a handle with a `stop()` method for clean teardown.
 *
 * Error handling: if `onReload` throws, the error is caught, logged, and the
 * previous in-memory state is preserved (enforced by the caller).
 */
function createMemoryWatcher(onReload, debounceMs = 300) {
    let timer = null;
    const watchers = [];
    function scheduleReload() {
        if (timer !== null)
            clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            try {
                onReload();
            }
            catch (err) {
                console.error('[AURA MEMORY WATCHER] Reload failed — last-known-good cache preserved:', err.message);
            }
        }, debounceMs);
    }
    for (const file of WATCHED_FILES) {
        const filePath = path.join(MEMORY_DIR, file);
        try {
            const watcher = fs.watch(filePath, () => scheduleReload());
            watchers.push(watcher);
        }
        catch (err) {
            // File may not exist yet — skip silently; it will be created on first read.
            console.warn(`[AURA MEMORY WATCHER] Could not watch ${file}: ${err.message}`);
        }
    }
    return {
        stop() {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            for (const w of watchers)
                w.close();
            watchers.length = 0;
        },
    };
}
