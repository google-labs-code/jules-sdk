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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { NodeFileStorage } from '../../src/storage/node-fs.js';
import { Activity } from '../../src/types.js';

// Mock fs/promises to spy on readFile
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
  };
});

const TEST_DIR = path.resolve(__dirname, '.test-activity-cache');

describe('NodeFileStorage Activities', () => {
  let storage: NodeFileStorage;
  const sessionId = 'session_activities_test';

  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    storage = new NodeFileStorage(sessionId, TEST_DIR);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await storage.close();
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should initialize and append a single activity correctly', async () => {
    const activity: Activity = {
      id: 'act_1',
      type: 'userMessaged',
      createTime: new Date().toISOString(),
      message: 'Hello World',
    } as any;

    await storage.append(activity);

    const latest = await storage.latest();
    expect(latest?.id).toBe('act_1');
    expect((latest as any)?.message).toBe('Hello World');

    const activityFromGet = await storage.get('act_1');
    expect(activityFromGet?.id).toBe('act_1');
    expect((activityFromGet as any)?.message).toBe('Hello World');
  });

  it('should append multiple activities in a single batch (appendMany)', async () => {
    const activities: Activity[] = [
      { id: 'act_10', type: 'userMessaged', createTime: new Date().toISOString(), message: 'Message 1' } as any,
      { id: 'act_11', type: 'userMessaged', createTime: new Date().toISOString(), message: 'Message 2' } as any,
      { id: 'act_12', type: 'userMessaged', createTime: new Date().toISOString(), message: 'Message 3' } as any,
    ];

    await storage.appendMany(activities);

    const latest = await storage.latest();
    expect(latest?.id).toBe('act_12');
    expect((latest as any)?.message).toBe('Message 3');

    const act10 = await storage.get('act_10');
    expect((act10 as any)?.message).toBe('Message 1');

    const act11 = await storage.get('act_11');
    expect((act11 as any)?.message).toBe('Message 2');

    const act12 = await storage.get('act_12');
    expect((act12 as any)?.message).toBe('Message 3');

    // Check count in metadata
    const metadataPath = path.join(TEST_DIR, '.jules/cache', sessionId, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataContent);
    expect(metadata.activityCount).toBe(3);
  });

  it('should read metadata once on multiple appends due to in-memory caching', async () => {
    const activities: Activity[] = [
      { id: 'act_20', type: 'userMessaged', createTime: new Date().toISOString(), message: 'M 1' } as any,
      { id: 'act_21', type: 'userMessaged', createTime: new Date().toISOString(), message: 'M 2' } as any,
    ];

    // Trigger metadata read on the first append
    await storage.append(activities[0]);
    // The second append should hit the cache, not fs.readFile
    await storage.append(activities[1]);

    const readCallsForMetadata = vi.mocked(fs.readFile).mock.calls.filter(call =>
      typeof call[0] === 'string' && call[0].endsWith('metadata.json')
    );

    // Should read exactly once (first append). Second append uses cache.
    expect(readCallsForMetadata.length).toBe(1);
  });
});
