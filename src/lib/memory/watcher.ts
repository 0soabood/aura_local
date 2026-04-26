import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface WatcherHandle {
  stop: () => void;
}

const MEMORY_DIR = path.join(os.homedir(), '.aura', 'memory');
const WATCHED_FILES = ['SOUL.md', 'USER.md', 'AGENTS.md'];

/**
 * Watch the three AURA memory files and call `onReload` after `debounceMs` of
 * silence.  Returns a handle with a `stop()` method for clean teardown.
 *
 * Error handling: if `onReload` throws, the error is caught, logged, and the
 * previous in-memory state is preserved (enforced by the caller).
 */
export function createMemoryWatcher(
  onReload: () => void,
  debounceMs = 300,
): WatcherHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watchers: fs.FSWatcher[] = [];

  function scheduleReload() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        onReload();
      } catch (err: any) {
        console.error('[AURA MEMORY WATCHER] Reload failed — last-known-good cache preserved:', err.message);
      }
    }, debounceMs);
  }

  for (const file of WATCHED_FILES) {
    const filePath = path.join(MEMORY_DIR, file);
    try {
      const watcher = fs.watch(filePath, () => scheduleReload());
      watchers.push(watcher);
    } catch (err: any) {
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
      for (const w of watchers) w.close();
      watchers.length = 0;
    },
  };
}
