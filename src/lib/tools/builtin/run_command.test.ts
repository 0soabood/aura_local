import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCommandFn, isAllowed, ALLOWED_PREFIXES, _internals } from './run_command';

// Replace the thin exec shim — no child_process mocking needed.
// _internals.exec is a plain object property, so mutation is visible
// to runCommandFn's closure at call time.
const mockExec = vi.fn();

beforeEach(() => {
  mockExec.mockReset();
  _internals.exec = mockExec;
  // Safety net: default throws rather than running a real command.
  mockExec.mockImplementation(() => {
    throw Object.assign(new Error('exec not mocked for this test'), {
      status: 1, stdout: '', stderr: '',
    });
  });
});

// ── Whitelist logic (pure — no exec) ────────────────────────────────────────

describe('isAllowed', () => {
  it('allows exact whitelisted commands', () => {
    expect(isAllowed('npm test')).toBe(true);
    expect(isAllowed('git diff')).toBe(true);
    expect(isAllowed('tsc --noEmit')).toBe(true);
  });

  it('allows prefix-extended commands', () => {
    expect(isAllowed('git commit -m "fix typo"')).toBe(true);
    expect(isAllowed('git add src/foo.ts')).toBe(true);
    expect(isAllowed('npm run build')).toBe(true);
  });

  it('rejects non-whitelisted commands', () => {
    expect(isAllowed('rm -rf /')).toBe(false);
    expect(isAllowed('cat /etc/passwd')).toBe(false);
    expect(isAllowed('curl http://evil.com')).toBe(false);
    expect(isAllowed('npmtest')).toBe(false);
  });

  it('covers every entry in ALLOWED_PREFIXES', () => {
    for (const prefix of ALLOWED_PREFIXES) {
      expect(isAllowed(prefix)).toBe(true);
    }
  });
});

// ── Input validation (exec never called) ────────────────────────────────────

describe('runCommandFn — input validation', () => {
  it('rejects empty command', async () => {
    const result = await runCommandFn({ command: '' });
    expect(result).toMatch(/command must be a non-empty string/);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('rejects non-whitelisted command', async () => {
    const result = await runCommandFn({ command: 'rm -rf /' });
    expect(result).toMatch(/Command not permitted/);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

// ── Execution path ───────────────────────────────────────────────────────────

describe('runCommandFn — execution', () => {
  it('returns trimmed stdout on success', async () => {
    mockExec.mockReturnValue('3 files changed\n');
    const result = await runCommandFn({ command: 'git diff' });
    expect(result).toBe('3 files changed');
    expect(mockExec).toHaveBeenCalledWith('git diff', expect.objectContaining({ encoding: 'utf-8' }));
  });

  it('returns (no output) when stdout is empty', async () => {
    mockExec.mockReturnValue('');
    const result = await runCommandFn({ command: 'git status' });
    expect(result).toBe('(no output)');
  });

  it('truncates very long output', async () => {
    mockExec.mockReturnValue('x'.repeat(5000));
    const result = await runCommandFn({ command: 'git diff' });
    expect(result.length).toBeLessThan(4000);
    expect(result).toContain('[Truncated');
  });

  it('captures exit code + stdout + stderr on failure', async () => {
    const err: any = new Error('failed');
    err.status = 1;
    err.stdout = 'partial output';
    err.stderr = 'error detail';
    mockExec.mockImplementation(() => { throw err; });
    const result = await runCommandFn({ command: 'git diff' });
    expect(result).toMatch(/Exit code 1/);
    expect(result).toContain('partial output');
    expect(result).toContain('error detail');
  });
});
