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
import { JulesClientImpl } from '../../src/client.js';
import { NodePlatform } from '../../src/platform/node.js';
import { NodeSessionStorage } from '../../src/storage/node-fs.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ApiClient } from '../../src/api.js';
import { SessionResource } from '../../src/types.js';

// Tests for jules.sync() duplication bug (Double Write & Append-Only Log)
describe('Sync Duplication Regression Tests', () => {
  let tmpDir: string;
  let client: JulesClientImpl;
  let apiClient: ApiClient;

  const createSession = (id: string, createTime: string): SessionResource => ({
    id,
    name: `sessions/${id}`,
    prompt: 'test',
    sourceContext: { source: 'test' },
    source: {
      name: 'sources/github/test/repo',
      id: 'github/test/repo',
      type: 'githubRepo',
      githubRepo: { owner: 'test', repo: 'repo', isPrivate: false },
    },
    title: 'test',
    createTime,
    updateTime: createTime,
    state: 'completed',
    url: 'test',
    outputs: [],
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jules-test-sync-'));

    // Use real NodeSessionStorage to verify actual file writes
    const storageFactory = {
      activity: () => {
        throw new Error('Not implemented');
      },
      session: () => new NodeSessionStorage(tmpDir),
    };

    apiClient = {
      request: vi.fn(),
    } as unknown as ApiClient;

    client = new JulesClientImpl(
      { apiKey: 'test' },
      storageFactory as any,
      new NodePlatform(),
    );
    (client as any).apiClient = apiClient;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should NOT duplicate sessions on initial sync (Write-Through disabled in sync)', async () => {
    const session1 = createSession('1', '2023-01-01T00:00:00Z');
    (apiClient.request as any).mockResolvedValue({
      sessions: [session1],
      nextPageToken: undefined,
    });

    await client.sync({ limit: 100 });

    const indexContent = await fs.readFile(
      path.join(tmpDir, '.jules/cache/sessions.jsonl'),
      'utf8',
    );
    const lines = indexContent.split('\n').filter((l) => l.trim());

    // Expect exactly 1 write, meaning SessionCursor did NOT write, only sync() loop did.
    expect(lines.length).toBe(1);
  });

  it('should NOT increase session count on subsequent runs (High-Water Mark respected)', async () => {
    const session1 = createSession('1', '2023-01-01T00:00:00Z');
    (apiClient.request as any).mockResolvedValue({
      sessions: [session1],
      nextPageToken: undefined,
    });

    // Run 1
    await client.sync({ limit: 100 });

    // Run 2: High-Water Mark should be '2023-01-01'.
    // Session1 <= HWM, so sync loop breaks immediately.
    // SessionCursor (persist: false) fetches but does not write.
    // Result: No new writes.
    await client.sync({ limit: 100 });

    const indexContent = await fs.readFile(
      path.join(tmpDir, '.jules/cache/sessions.jsonl'),
      'utf8',
    );
    const lines = indexContent.split('\n').filter((l) => l.trim());

    expect(lines.length).toBe(1);
  });
});
