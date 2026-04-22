import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoreModelService } from './CoreModelService';

// Mock the GoogleGenAI SDK to avoid real API calls during tests
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: '# OBJECTIVE\nTest successful'
          })
        }
      };
    })
  };
});

describe('CoreModelService', () => {
  it('should construct structured prompts and return typed responses', async () => {
    const service = new CoreModelService();
    const result = await service.execute('Hello AURA', 'test-model');

    expect(result.status).toBe('completed');
    expect(result.response).toContain('# OBJECTIVE');
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });

  it('should handle failures gracefully', async () => {
    const service = new CoreModelService();
    // Simulate error by reaching into the mocked instance or forcing a rejection
    (service as any).ai.models.generateContent.mockRejectedValueOnce(new Error('Quota Exceeded'));

    const result = await service.execute('Fail me', 'test-model');
    expect(result.status).toBe('failed');
    expect(result.response).toContain('Execution Failed');
  });
});
