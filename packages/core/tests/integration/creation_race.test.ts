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

// tests/integration/creation_race.test.ts
import { jules as defaultJules } from '../../src/index.js';
import { describe, it, expect, vi } from 'vitest';

describe.skipIf(!process.env.JULES_API_KEY || !process.env.TEST_GITHUB_REPO)(
  'Session Creation Race Condition',
  () => {
    it('should not throw a 404 when streaming activities immediately after session creation', async () => {
      const jules = defaultJules.with({
        apiKey: process.env.JULES_API_KEY,
      });

      const session = await jules.session({
        prompt: 'A test prompt to reproduce the creation race condition.',
        source: {
          github: process.env.TEST_GITHUB_REPO!,
          baseBranch: 'main', // Assuming the test repo has a 'main' branch.
        },
      });

      // The stream() method returns an AsyncIterable. To get the first item,
      // we can use a `for await...of` loop and break after the first iteration.
      let firstActivity;
      for await (const activity of session.stream()) {
        firstActivity = activity;
        break; // We only need the first one for this test.
      }

      expect(firstActivity).toBeDefined();
    }, 90000); // 90-second timeout to accommodate retries
  },
);
