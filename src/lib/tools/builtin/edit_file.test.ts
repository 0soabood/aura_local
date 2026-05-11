import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { editFileFn } from './edit_file';

// PROJECT_ROOT in the tool is process.cwd() at module load time (the worktree root).
// Tests operate on files inside a temp subdirectory within the actual project root.
const TMP_SUBDIR = 'test-edit-tmp';
const TMP_PATH = path.join(process.cwd(), TMP_SUBDIR);

beforeEach(() => {
  fs.mkdirSync(TMP_PATH, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_PATH, { recursive: true, force: true });
});

function writeTemp(name: string, content: string) {
  fs.writeFileSync(path.join(TMP_PATH, name), content, 'utf-8');
}

function readTemp(name: string) {
  return fs.readFileSync(path.join(TMP_PATH, name), 'utf-8');
}

describe('edit_file', () => {
  it('replaces a unique string', async () => {
    writeTemp('code.ts', 'const x = 1;\nconst y = 2;');
    const result = await editFileFn({
      path: `${TMP_SUBDIR}/code.ts`,
      old_string: 'const x = 1;',
      new_string: 'const x = 42;',
    });
    expect(result).toMatch(/Edited/);
    expect(readTemp('code.ts')).toBe('const x = 42;\nconst y = 2;');
  });

  it('errors when old_string not found', async () => {
    writeTemp('code.ts', 'const x = 1;');
    const result = await editFileFn({
      path: `${TMP_SUBDIR}/code.ts`,
      old_string: 'missing text',
      new_string: 'anything',
    });
    expect(result).toMatch(/not found/);
  });

  it('errors when old_string matches multiple times', async () => {
    writeTemp('code.ts', 'foo\nfoo\nbar');
    const result = await editFileFn({
      path: `${TMP_SUBDIR}/code.ts`,
      old_string: 'foo',
      new_string: 'baz',
    });
    expect(result).toMatch(/matches 2 locations/);
  });

  it('errors when file does not exist', async () => {
    const result = await editFileFn({
      path: `${TMP_SUBDIR}/nonexistent.ts`,
      old_string: 'x',
      new_string: 'y',
    });
    expect(result).toMatch(/File not found/);
  });

  it('rejects path traversal', async () => {
    const result = await editFileFn({ path: '../outside.ts', old_string: 'x', new_string: 'y' });
    expect(result).toMatch(/escapes the project root/);
  });

  it('rejects empty path', async () => {
    const result = await editFileFn({ path: '', old_string: 'x', new_string: 'y' });
    expect(result).toMatch(/path must be a non-empty string/);
  });

  it('rejects empty old_string', async () => {
    writeTemp('code.ts', 'content');
    const result = await editFileFn({ path: `${TMP_SUBDIR}/code.ts`, old_string: '', new_string: 'y' });
    expect(result).toMatch(/old_string must be a non-empty string/);
  });

  it('reports char counts in success message', async () => {
    writeTemp('f.ts', 'hello world');
    const result = await editFileFn({
      path: `${TMP_SUBDIR}/f.ts`,
      old_string: 'hello',
      new_string: 'hi',
    });
    expect(result).toContain('replaced 5 chars with 2 chars');
  });
});
