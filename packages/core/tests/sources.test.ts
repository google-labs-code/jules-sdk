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

// tests/sources.test.ts
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { server } from './mocks/server.js';
import { jules as defaultJules, Source } from '../src/index.js';
import { http, HttpResponse } from 'msw';
import { JulesApiError } from '../src/errors.js';

// Set up the mock server before all tests and clean up after
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const API_KEY = 'test-api-key';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';

describe('SourceManager', () => {
  const jules = defaultJules.with({ apiKey: API_KEY });

  describe('get()', () => {
    it('should retrieve an existing source by its GitHub identifier', async () => {
      const source = await jules.sources.get({
        github: 'davideast/dataprompt',
      });

      expect(source).toBeDefined();
      expect(source?.name).toBe('sources/github/davideast/dataprompt');
      expect(source?.id).toBe('davideast/dataprompt');
      expect(source?.type).toBe('githubRepo');
      if (source?.type === 'githubRepo') {
        expect(source.githubRepo.owner).toBe('davideast');
        expect(source.githubRepo.repo).toBe('dataprompt');
      }
    });

    it('should return undefined for a non-existent source (404)', async () => {
      vi.useFakeTimers();
      try {
        const promise = jules.sources.get({ github: 'non/existent' });
        // Advance enough time to exhaust retries
        await vi.advanceTimersByTimeAsync(60000);
        const source = await promise;
        expect(source).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw a JulesApiError for other server errors (e.g., 500)', async () => {
      // Override the default handler for this specific test case
      server.use(
        http.get(`${BASE_URL}/sources/github/server/error`, () => {
          return new HttpResponse('Internal Server Error', { status: 500 });
        }),
      );

      await expect(
        jules.sources.get({ github: 'server/error' }),
      ).rejects.toThrow(JulesApiError);

      const promise = jules.sources.get({ github: 'server/error' });
      await expect(promise).rejects.toMatchObject({
        status: 500,
        url: `${BASE_URL}/sources/github/server/error`,
      });
      await expect(promise).rejects.toSatisfy((e: JulesApiError) => {
        return e.message.includes('Internal Server Error');
      });
    });
  });

  describe('list() / async iterator', () => {
    it('should iterate over a single page of sources', async () => {
      // Mock a response with no nextPageToken
      server.use(
        http.get(`${BASE_URL}/sources`, () => {
          return HttpResponse.json({
            sources: [
              {
                name: 'sources/github/single/page',
                id: 'github/single/page',
                githubRepo: { owner: 'single', repo: 'page', isPrivate: false },
              },
            ],
          });
        }),
      );

      const sources: Source[] = [];
      for await (const source of jules.sources()) {
        sources.push(source);
      }

      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe('github/single/page');
      expect(sources[0].type).toBe('githubRepo');
    });

    it('should handle pagination and iterate over multiple pages of sources', async () => {
      // The default mock handler in handlers.ts already simulates pagination
      const sources: Source[] = [];
      for await (const source of jules.sources()) {
        sources.push(source);
      }

      // We expect 2 sources from the two pages in the mock
      expect(sources).toHaveLength(2);
      expect(sources[0].id).toBe('davideast/dataprompt');
      expect(sources[1].id).toBe('github/another/repo');
    });

    it('should correctly map the source type discriminator', async () => {
      const sources: Source[] = [];
      for await (const source of jules.sources()) {
        sources.push(source);
      }

      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source.type).toBe('githubRepo');
      }
    });

    it('should throw JulesApiError if the /sources endpoint fails', async () => {
      // Mock a 500 error for the /sources endpoint
      server.use(
        http.get(`${BASE_URL}/sources`, () => {
          return new HttpResponse('Server blew up', { status: 500 });
        }),
      );

      async function consumeGenerator() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of jules.sources()) {
          // This loop will throw
        }
      }

      const promise = consumeGenerator();
      await expect(promise).rejects.toThrow(JulesApiError);
      await expect(promise).rejects.toMatchObject({ status: 500 });
    });
  });
});
