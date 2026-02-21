import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../src/api.js';

describe('ApiClient Concurrency Control', () => {
  const baseUrl = 'https://api.jules.com';

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should limit concurrent requests to the configured maximum', async () => {
    const maxConcurrent = 10;
    const apiClient = new ApiClient({
      apiKey: 'test-key',
      baseUrl,
      requestTimeoutMs: 1000,
      maxConcurrentRequests: maxConcurrent,
    });

    let activeRequests = 0;
    let maxActiveRequests = 0;
    let completedRequests = 0;

    const fetchMock = global.fetch as any;
    fetchMock.mockImplementation(async () => {
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      // Simulate a slow request
      await new Promise((resolve) => setTimeout(resolve, 100));
      activeRequests--;
      completedRequests++;
      return new Response('{"success": true}', { status: 200 });
    });

    const numRequests = 50;
    const promises = Array.from({ length: numRequests }, () =>
      apiClient.request('test'),
    );

    // Advance time to process requests
    // Each batch of 10 takes 100ms. Total 50 requests => 5 batches => 500ms total.

    // Check initially (time 0), only 10 should be active
    // But acquire is async, so we might need a tick.
    await vi.advanceTimersByTimeAsync(1);
    expect(activeRequests).toBeLessThan(maxConcurrent + 1);
    expect(maxActiveRequests).toBeLessThan(maxConcurrent + 1);

    // Advance 200ms (2 batches done)
    await vi.advanceTimersByTimeAsync(200);
    expect(maxActiveRequests).toBeLessThan(maxConcurrent + 1);

    // Finish all
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(promises);

    expect(completedRequests).toBe(numRequests);
    expect(maxActiveRequests).toBe(maxConcurrent);
  });

  it('should default to 50 concurrent requests if not configured', async () => {
    const apiClient = new ApiClient({
      apiKey: 'test-key',
      baseUrl,
      requestTimeoutMs: 1000,
      // Default should be 50
    });

    let activeRequests = 0;
    let maxActiveRequests = 0;

    const fetchMock = global.fetch as any;
    fetchMock.mockImplementation(async () => {
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 100));
      activeRequests--;
      return new Response('{"success": true}', { status: 200 });
    });

    const numRequests = 100;
    const promises = Array.from({ length: numRequests }, () =>
      apiClient.request('test'),
    );

    // Allow things to start
    await vi.advanceTimersByTimeAsync(50);

    expect(maxActiveRequests).toBe(50);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(promises);
  });
});
