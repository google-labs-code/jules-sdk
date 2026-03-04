import { test, expect } from 'vitest';
import { select } from '../../src/query/select';

// Create a mock storage and client
const createMockClient = (numSessions: number) => {
  const index = Array.from({ length: numSessions }).map((_, i) => ({
    id: `session-${i}`,
    state: 'active',
    title: `Session ${i}`,
  }));

  const cache = new Map();
  for (let i = 0; i < numSessions; i++) {
    const entry = index[i];
    cache.set(entry.id, {
      resource: {
        id: entry.id,
        state: entry.state,
        title: entry.title,
        createTime: new Date(Date.now() - i * 1000).toISOString(),
      },
    });
  }

  const storage = {
    async *scanIndex() {
      for (const entry of index) {
        yield entry;
      }
    },
    async get(id: string) {
      // Simulate I/O delay
      await new Promise((resolve) => setTimeout(resolve, 5));
      return cache.get(id);
    },
  };

  return { storage } as any; // Cast as any for JulesClient
};

test('benchmark hydration', async () => {
  const numSessions = 100; // Total sessions to fetch
  const client = createMockClient(numSessions);

  const query = {
    from: 'sessions',
    limit: numSessions,
    // Add a simple where to force fetching but not filtering
  } as any; // Cast as any for JulesQuery

  const start = performance.now();
  await select(client, query);
  const end = performance.now();

  console.log(`Time taken: ${end - start}ms`);

  // We don't have a strict expect here as it's a benchmark
  expect(true).toBe(true);
});
