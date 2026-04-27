import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from './registry';
import type { ToolDefinition, ToolFn } from './types';

function makeDef(name: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `Test tool: ${name}`,
      parameters: {
        type: 'object',
        properties: { input: { type: 'string', description: 'Test input' } },
        required: ['input'],
      },
    },
  };
}

describe('ToolRegistry', () => {
  it('registers a tool and describes it', () => {
    const reg = new ToolRegistry();
    const fn: ToolFn = async () => 'result';
    reg.register(makeDef('echo'), fn);

    expect(reg.size).toBe(1);
    expect(reg.has('echo')).toBe(true);
    expect(reg.describe()).toHaveLength(1);
    expect(reg.describe()[0].function.name).toBe('echo');
  });

  it('executes a registered tool with correct args', async () => {
    const reg = new ToolRegistry();
    const fn = vi.fn(async (args: Record<string, unknown>) => `hello ${args.input}`);
    reg.register(makeDef('greet'), fn);

    const result = await reg.execute({ id: 'call_1', name: 'greet', arguments: { input: 'world' } });

    expect(result.isError).toBe(false);
    expect(result.content).toBe('hello world');
    expect(result.tool_call_id).toBe('call_1');
    expect(fn).toHaveBeenCalledWith({ input: 'world' });
  });

  it('returns an error result for an unknown tool', async () => {
    const reg = new ToolRegistry();
    const result = await reg.execute({ id: 'call_x', name: 'nonexistent', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/Unknown tool "nonexistent"/);
    expect(result.tool_call_id).toBe('call_x');
  });

  it('catches tool execution errors and returns them as error results', async () => {
    const reg = new ToolRegistry();
    const fn: ToolFn = async () => { throw new Error('boom'); };
    reg.register(makeDef('kaboom'), fn);

    const result = await reg.execute({ id: 'call_2', name: 'kaboom', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/boom/);
  });

  it('supports chaining register calls', () => {
    const fn: ToolFn = async () => '';
    const reg = new ToolRegistry()
      .register(makeDef('a'), fn)
      .register(makeDef('b'), fn)
      .register(makeDef('c'), fn);

    expect(reg.size).toBe(3);
    expect(reg.has('a')).toBe(true);
    expect(reg.has('b')).toBe(true);
    expect(reg.has('c')).toBe(true);
  });

  it('describe() returns all registered definitions', () => {
    const fn: ToolFn = async () => '';
    const reg = new ToolRegistry()
      .register(makeDef('x'), fn)
      .register(makeDef('y'), fn);

    const defs = reg.describe();
    expect(defs.map(d => d.function.name).sort()).toEqual(['x', 'y']);
  });
});

describe('read_file tool', () => {
  it('rejects path traversal attempts', async () => {
    const { readFileFn } = await import('./builtin/read_file');
    const result = await readFileFn({ path: '../../.env' });
    expect(result).toMatch(/escapes the project root/);
  });

  it('returns error for non-existent file', async () => {
    const { readFileFn } = await import('./builtin/read_file');
    const result = await readFileFn({ path: 'src/__nonexistent_test_file__.ts' });
    expect(result).toMatch(/File not found/);
  });
});

describe('list_directory tool', () => {
  it('rejects path traversal attempts', async () => {
    const { listDirectoryFn } = await import('./builtin/list_directory');
    const result = await listDirectoryFn({ path: '../../../etc' });
    expect(result).toMatch(/escapes the project root/);
  });

  it('lists project root directory', async () => {
    const { listDirectoryFn } = await import('./builtin/list_directory');
    const result = await listDirectoryFn({ path: '.' });
    expect(result).toMatch(/Contents of \./);
    expect(result).toMatch(/\[dir\]|\[file\]/);
  });
});
