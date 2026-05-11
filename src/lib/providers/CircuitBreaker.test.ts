import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from './CircuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // threshold=3, cooldown=30s
    breaker = new CircuitBreaker('test-provider', 3, 30_000);
  });

  it('starts CLOSED and passes calls through', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.isOpen).toBe(false);
  });

  it('opens after threshold consecutive failures', async () => {
    const fail = () => breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await fail();
    await fail();
    expect(breaker.isOpen).toBe(false);
    await fail(); // 3rd failure trips the breaker
    expect(breaker.isOpen).toBe(true);
  });

  it('rejects calls immediately when OPEN without invoking fn', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    const fn = vi.fn().mockResolvedValue('should not run');
    await expect(breaker.execute(fn)).rejects.toThrow('is OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('resets to CLOSED after manual reset()', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(breaker.isOpen).toBe(true);
    breaker.reset();
    expect(breaker.isOpen).toBe(false);
    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
  });

  it('resets failure count on a successful call', async () => {
    // Two failures, then a success — should not trip
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await breaker.execute(() => Promise.resolve('ok'));
    // One more failure should not open (counter reset)
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(breaker.isOpen).toBe(false);
  });
});
