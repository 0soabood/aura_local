import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AuraMemory {
  soul:                  string;
  user:                  string;
  agents:                string;
  combinedSystemContext: string;
}

const MEMORY_DIR = path.join(os.homedir(), '.aura', 'memory');

const DEFAULTS: Record<string, string> = {
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

function readMemoryFile(filePath: string, fileName: string): string {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, DEFAULTS[fileName] ?? '', 'utf-8');
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    console.error(`[AURA MEMORY] Failed to read ${fileName}: ${err.message} — using empty fallback`);
    return '';
  }
}

/**
 * Pure disk read — no side effects on the in-memory cache.
 * Ensures the memory directory and default files exist, then reads all three.
 * Directory-creation failure is fatal (broken home dir / permissions).
 */
export function loadAuraMemoryFromDisk(): AuraMemory {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });

  const soul   = readMemoryFile(path.join(MEMORY_DIR, 'SOUL.md'),   'SOUL.md');
  const user   = readMemoryFile(path.join(MEMORY_DIR, 'USER.md'),   'USER.md');
  const agents = readMemoryFile(path.join(MEMORY_DIR, 'AGENTS.md'), 'AGENTS.md');

  const combinedSystemContext = [
    soul   ? `## AURA Identity (SOUL)\n${soul}`   : '',
    user   ? `## User Context\n${user}`           : '',
    agents ? `## Agent Configuration\n${agents}`  : '',
  ]
    .filter(Boolean)
    .join('\n---\n\n');

  return { soul, user, agents, combinedSystemContext };
}

// ── Layer 2: in-memory cache ──────────────────────────────────────────────────

let _cache: AuraMemory | null = null;

/**
 * Load memory from disk and populate the cache.
 * Call once on server startup.
 */
export function initializeAuraMemory(): void {
  _cache = loadAuraMemoryFromDisk();
  console.log('[AURA MEMORY] Initialized from ~/.aura/memory/');
}

/**
 * Return the cached memory.  Throws if initializeAuraMemory() was never called
 * so misconfigured start-ups fail loudly rather than silently using empty context.
 */
export function getAuraMemory(): AuraMemory {
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
export function reloadAuraMemory(): AuraMemory {
  const fresh = loadAuraMemoryFromDisk(); // throws on directory failure
  _cache = fresh;
  console.log('[AURA MEMORY] Reloaded from ~/.aura/memory/');
  return fresh;
}

// ── Layer 3: optional file-watch auto-reload ──────────────────────────────────

import { createMemoryWatcher, WatcherHandle } from './watcher';

/**
 * Start watching ~/.aura/memory/ for changes and auto-reloading the cache.
 * Only activates when AURA_MEMORY_WATCH=true is set in the environment.
 * Returns a WatcherHandle so callers can stop the watcher on shutdown.
 * Returns null when the env flag is absent/false.
 */
export function startMemoryWatcher(): WatcherHandle | null {
  if (process.env.AURA_MEMORY_WATCH !== 'true') return null;

  const handle = createMemoryWatcher(() => {
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
export const loadAuraMemory = loadAuraMemoryFromDisk;
