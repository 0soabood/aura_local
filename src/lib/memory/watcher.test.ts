import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryWatcher } from './watcher';

// fs.watch is patched so the test never touches the real filesystem.
vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>();
  return {
    ...real,
    watch: vi.fn(),
  };
});

import * as fs from 'fs';

function makeFakeWatcher() {
  let listener: (() => void) | null = null;
  const watcher = {
    close: vi.fn(),
    trigger() { listener?.(); },
  };
  (fs.watch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(watcher);
  // Capture the listener passed to fs.watch
  (fs.watch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_path: string, cb: () => void) => { listener = cb; return watcher; }
  );
  return watcher;
}

describe('createMemoryWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (fs.watch as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onReload after the debounce window', () => {
    const fakeWatcher = makeFakeWatcher();
    const onReload = vi.fn();

    createMemoryWatcher(onReload, 300);

    fakeWatcher.trigger();
    expect(onReload).not.toHaveBeenCalled(); // still debouncing

    vi.advanceTimersByTime(300);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid saves into a single reload', () => {
    const fakeWatcher = makeFakeWatcher();
    const onReload = vi.fn();

    createMemoryWatcher(onReload, 300);

    fakeWatcher.trigger();
    vi.advanceTimersByTime(100);
    fakeWatcher.trigger();
    vi.advanceTimersByTime(100);
    fakeWatcher.trigger();
    vi.advanceTimersByTime(300);

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('does not call onReload again after stop()', () => {
    const fakeWatcher = makeFakeWatcher();
    const onReload = vi.fn();

    const handle = createMemoryWatcher(onReload, 300);
    fakeWatcher.trigger();
    handle.stop();

    vi.advanceTimersByTime(300);
    expect(onReload).not.toHaveBeenCalled();
    expect(fakeWatcher.close).toHaveBeenCalled();
  });

  it('catches onReload errors and does not propagate them', () => {
    const fakeWatcher = makeFakeWatcher();
    const onReload = vi.fn().mockImplementation(() => { throw new Error('disk error'); });

    createMemoryWatcher(onReload, 300);
    fakeWatcher.trigger();

    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
