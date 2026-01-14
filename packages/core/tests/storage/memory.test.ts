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

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage } from '../../src/storage/memory.js';
import { Activity } from '../../src/types.js';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.init();
  });

  it('should be initially empty', async () => {
    expect(await storage.latest()).toBeUndefined();
    expect(await storage.get('any-id')).toBeUndefined();
    let count = 0;
    for await (const _ of storage.scan()) {
      count++;
    }
    expect(count).toBe(0);
  });

  it('should append and retrieve activities', async () => {
    const act1: Activity = {
      id: '1',
      type: 'message',
      createTime: '2023-01-01T00:00:00Z',
    } as any;
    await storage.append(act1);

    expect(await storage.get('1')).toEqual(act1);
    expect(await storage.latest()).toEqual(act1);

    const act2: Activity = {
      id: '2',
      type: 'tool_call',
      createTime: '2023-01-01T00:00:01Z',
    } as any;
    await storage.append(act2);

    expect(await storage.get('2')).toEqual(act2);
    expect(await storage.latest()).toEqual(act2);
  });

  it('should handle upserts by updating in place', async () => {
    const act1: Activity = {
      id: '1',
      type: 'message',
      createTime: '2023-01-01T00:00:00Z',
      content: 'original',
    } as any;
    const act2: Activity = {
      id: '2',
      type: 'message',
      createTime: '2023-01-01T00:00:01Z',
    } as any;
    await storage.append(act1);
    await storage.append(act2);

    const act1Updated: Activity = { ...act1, content: 'updated' } as any;
    await storage.append(act1Updated);

    // Check it was updated
    expect(await storage.get('1')).toEqual(act1Updated);

    // Check order preserved in scan
    const scanned: Activity[] = [];
    for await (const act of storage.scan()) {
      scanned.push(act);
    }
    expect(scanned).toEqual([act1Updated, act2]);
  });

  it('should clear data on close', async () => {
    await storage.append({ id: '1' } as any);
    await storage.close();
    expect(await storage.latest()).toBeUndefined();
  });
});
