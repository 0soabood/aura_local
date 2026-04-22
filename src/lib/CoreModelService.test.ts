import { describe, it, expect, vi } from 'vitest';
import { CoreModelService } from './CoreModelService';

// vi.mock() is hoisted to the top of the file, ABOVE these declarations.
// Use vi.hoisted() to keep the mocks and the factory's closure variables
// in the same hoisted scope — otherwise the factory references uninitialized
// bindings at module-evaluation time.
const { generateContentMock, constructorMock } = vi.hoisted(() => {
  const generateContentMock = vi.fn().mockResolvedValue({
    text: '# OBJECTIVE\nTest successful',
  });
  // vitest 4 requires constructible mocks to use a real `function` (or class),
  // not an arrow — arrows can't be invoked with `new`.
  const constructorMock = vi.fn(function (this: any) {
    this.models = { generateContent: generateContentMock };
  });
  return { generateContentMock, constructorMock };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: constructorMock,
}));

describe('CoreModelService', () => {
  it('should construct structured prompts and return typed responses', async () => {
    const service = new CoreModelService();
    const result = await service.execute('Hello AURA', 'test-model');

    expect(result.status).toBe('completed');
    expect(result.response).toContain('# OBJECTIVE');
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });

  it('should handle SDK failures gracefully', async () => {
    const service = new CoreModelService();
    (service as any).ai.models.generateContent.mockRejectedValueOnce(
      new Error('Quota Exceeded')
    );

    const result = await service.execute('Fail me', 'test-model');
    expect(result.status).toBe('failed');
    expect(result.response).toContain('Execution Failed');
    expect(result.response).toContain('Quota Exceeded');
  });

  // Integration-style boundary test: verify the exact shape we hand to the
  // GoogleGenAI SDK. If the SDK ever renames `model`/`contents`/`config`,
  // this catches the drift instead of silently returning empty responses.
  it('passes the rendered prompt + model id + temperature to the SDK', async () => {
    generateContentMock.mockClear();

    const service = new CoreModelService();
    await service.execute('Scan local tech trends', 'gemini-3-flash-preview');

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const callArg = generateContentMock.mock.calls[0][0];

    expect(callArg.model).toBe('gemini-3-flash-preview');
    expect(typeof callArg.contents).toBe('string');
    // Template substitution actually happened:
    expect(callArg.contents).toContain('Scan local tech trends');
    expect(callArg.contents).toContain('gemini-3-flash-preview');
    // Required Markdown skeleton is preserved:
    expect(callArg.contents).toContain('# OBJECTIVE');
    expect(callArg.contents).toContain('# NEXT ACTIONS');
    // Determinism contract:
    expect(callArg.config).toEqual({ temperature: 0.2 });
  });

  it('constructs the SDK with the GEMINI_API_KEY from the environment', () => {
    constructorMock.mockClear();
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key-123';

    new CoreModelService();
    expect(constructorMock).toHaveBeenCalledWith({ apiKey: 'test-key-123' });

    process.env.GEMINI_API_KEY = prev;
  });
});
