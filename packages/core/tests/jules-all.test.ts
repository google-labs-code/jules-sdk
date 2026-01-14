/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JulesClientImpl } from '../src/client.js';
import { NodePlatform } from '../src/platform/node.js';
import { AutomatedSession, SessionConfig } from '../src/types.js';
import { pMap } from '../src/utils.js';

// Mock dependencies
const mockRun = vi.fn();

// Mock the client class partially
class MockJulesClient extends JulesClientImpl {
  constructor() {
    // Pass dummy dependencies
    super(
      {},
      { activity: () => ({}) as any, session: () => ({}) as any },
      new NodePlatform(),
    );
  }

  // Override run to mock it
  async run(config: SessionConfig): Promise<AutomatedSession> {
    return mockRun(config);
  }
}

describe('jules.all', () => {
  let client: MockJulesClient;

  beforeEach(() => {
    client = new MockJulesClient();
    mockRun.mockReset();
  });

  it('should process all items and return results in order', async () => {
    const items = [1, 2, 3];
    mockRun.mockImplementation(
      async (config) => ({ id: `session-${config.prompt}` }) as any,
    );

    const results = await client.all(items, (n) => ({
      prompt: String(n),
      source: { github: 'user/repo', baseBranch: 'main' },
    }));

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('session-1');
    expect(results[1].id).toBe('session-2');
    expect(results[2].id).toBe('session-3');
    expect(mockRun).toHaveBeenCalledTimes(3);
  });

  it('should respect concurrency limit', async () => {
    const items = [1, 2, 3, 4];
    let running = 0;
    let maxRunning = 0;

    mockRun.mockImplementation(async (config) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running--;
      return { id: `session-${config.prompt}` } as any;
    });

    await client.all(
      items,
      (n) => ({
        prompt: String(n),
        source: { github: 'user/repo', baseBranch: 'main' },
      }),
      { concurrency: 2 },
    );

    expect(maxRunning).toBe(2);
    expect(mockRun).toHaveBeenCalledTimes(4);
  });

  it('should fail fast if stopOnError is true (default)', async () => {
    const items = [1, 2, 3];
    mockRun.mockImplementation(async (config) => {
      if (config.prompt === '2') throw new Error('Failed');
      return { id: `session-${config.prompt}` } as any;
    });

    await expect(
      client.all(items, (n) => ({
        prompt: String(n),
        source: { github: 'user/repo', baseBranch: 'main' },
      })),
    ).rejects.toThrow('Failed');
  });

  it('should aggregate errors if stopOnError is false', async () => {
    const items = [1, 2, 3];
    mockRun.mockImplementation(async (config) => {
      if (config.prompt === '2') throw new Error('Failed 2');
      if (config.prompt === '3') throw new Error('Failed 3');
      return { id: `session-${config.prompt}` } as any;
    });

    try {
      await client.all(
        items,
        (n) => ({
          prompt: String(n),
          source: { github: 'user/repo', baseBranch: 'main' },
        }),
        { stopOnError: false },
      );
    } catch (err: any) {
      expect(err).toBeInstanceOf(AggregateError);
      expect(err.errors).toHaveLength(2);
      expect(err.errors[0].message).toBe('Failed 2');
      expect(err.errors[1].message).toBe('Failed 3');
    }
  });
});

describe('pMap utility', () => {
  it('should handle delayMs', async () => {
    vi.useFakeTimers();
    const items = [1, 2];
    const mapper = vi.fn().mockResolvedValue('ok');

    const promise = pMap(items, mapper, { delayMs: 1000, concurrency: 1 });

    // Start
    expect(mapper).not.toHaveBeenCalled();

    // Advance time for first item
    await vi.advanceTimersByTimeAsync(1000);
    expect(mapper).toHaveBeenCalledTimes(1); // First item starts after delay?
    // Wait, implementation says: if (delayMs > 0) await sleep.
    // So yes, it sleeps BEFORE processing.

    await vi.advanceTimersByTimeAsync(1000);
    expect(mapper).toHaveBeenCalledTimes(2);

    await promise;
    vi.useRealTimers();
  });

  it('should use a default concurrency of 3', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    let running = 0;
    let maxRunning = 0;

    const mapper = async (item: number) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
      return item;
    };

    await pMap(items, mapper);

    expect(maxRunning).toBe(3);
  });

  it('should process each item exactly once', async () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const processedItems = new Set();
    const mapper = async (item: number) => {
      expect(processedItems.has(item)).toBe(false);
      processedItems.add(item);
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      return item;
    };

    await pMap(items, mapper, { concurrency: 10 });

    expect(processedItems.size).toBe(items.length);
  });
});
