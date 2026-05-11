import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { writeFileFn } from './write_file';

// PROJECT_ROOT in the tool is process.cwd() at module load time (the worktree root).
// Tests write into a temp subdirectory inside the actual project root.
const TMP_SUBDIR = 'test-write-tmp';
const TMP_PATH = path.join(process.cwd(), TMP_SUBDIR);

beforeEach(() => {
  fs.mkdirSync(TMP_PATH, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_PATH, { recursive: true, force: true });
});

describe('write_file', () => {
  it('writes a new file', async () => {
    const result = await writeFileFn({ path: `${TMP_SUBDIR}/hello.txt`, content: 'world' });
    expect(result).toMatch(/Written/);
    expect(fs.readFileSync(path.join(TMP_PATH, 'hello.txt'), 'utf-8')).toBe('world');
  });

  it('overwrites an existing file', async () => {
    const filePath = path.join(TMP_PATH, 'existing.txt');
    fs.writeFileSync(filePath, 'old content');
    await writeFileFn({ path: `${TMP_SUBDIR}/existing.txt`, content: 'new content' });
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });

  it('creates nested parent directories', async () => {
    const result = await writeFileFn({ path: `${TMP_SUBDIR}/nested/deep/file.ts`, content: 'code' });
    expect(result).toMatch(/Written/);
    expect(fs.existsSync(path.join(TMP_PATH, 'nested', 'deep', 'file.ts'))).toBe(true);
  });

  it('reports byte count', async () => {
    const result = await writeFileFn({ path: `${TMP_SUBDIR}/bytes.txt`, content: 'abc' });
    expect(result).toContain('3 bytes');
  });

  it('rejects path traversal', async () => {
    const result = await writeFileFn({ path: '../outside.txt', content: 'bad' });
    expect(result).toMatch(/escapes the project root/);
  });

  it('rejects empty path', async () => {
    const result = await writeFileFn({ path: '', content: 'x' });
    expect(result).toMatch(/path must be a non-empty string/);
  });
});
