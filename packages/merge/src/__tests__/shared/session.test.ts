// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionFileInfo } from '../../shared/session.js';

// Mock @google/jules-sdk before any imports touch it
vi.mock('@google/jules-sdk', () => ({
  jules: {},
}));

// Mock the session module to inject our own client behavior
const mockHydrate = vi.fn().mockResolvedValue(undefined);
const mockSnapshot = vi.fn();
const mockSession = vi.fn().mockReturnValue({
  activities: { hydrate: mockHydrate },
  snapshot: mockSnapshot,
});

function makeClient() {
  return { session: mockSession } as any;
}

// Import AFTER mocks are set up
import { getSessionChangedFiles } from '../../shared/session.js';

describe('getSessionChangedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockReturnValue({
      activities: { hydrate: mockHydrate },
      snapshot: mockSnapshot,
    });
  });

  it('aggregates files from activity changeSet artifacts when session is busy', async () => {
    const activities = [
      {
        id: 'act-1',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'changeSet',
            parsed: () => ({
              files: [
                { path: 'src/a.ts', changeType: 'modified', additions: 5, deletions: 2 },
                { path: 'src/b.ts', changeType: 'created', additions: 10, deletions: 0 },
              ],
              summary: { totalFiles: 2, created: 1, modified: 1, deleted: 0 },
            }),
          },
        ],
      },
      {
        id: 'act-2',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'changeSet',
            parsed: () => ({
              files: [
                { path: 'src/c.ts', changeType: 'created', additions: 3, deletions: 0 },
              ],
              summary: { totalFiles: 1, created: 1, modified: 0, deleted: 0 },
            }),
          },
        ],
      },
    ];

    mockSnapshot.mockResolvedValue({
      state: 'inProgress',
      activities,
      changeSet: () => undefined,
    });

    const result = await getSessionChangedFiles(makeClient(), 'session-123');

    expect(result).toEqual([
      { path: 'src/a.ts', changeType: 'modified' },
      { path: 'src/b.ts', changeType: 'created' },
      { path: 'src/c.ts', changeType: 'created' },
    ]);
  });

  it('uses outcome changeSet when session is stable', async () => {
    mockSnapshot.mockResolvedValue({
      state: 'completed',
      activities: [],
      changeSet: () => ({
        type: 'changeSet',
        parsed: () => ({
          files: [
            { path: 'src/x.ts', changeType: 'modified', additions: 3, deletions: 1 },
          ],
          summary: { totalFiles: 1, created: 0, modified: 1, deleted: 0 },
        }),
      }),
    });

    const result = await getSessionChangedFiles(makeClient(), 'session-456');

    expect(result).toEqual([
      { path: 'src/x.ts', changeType: 'modified' },
    ]);
  });

  it('omits files where net change is created→deleted', async () => {
    const activities = [
      {
        id: 'act-1',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'changeSet',
            parsed: () => ({
              files: [
                { path: 'src/temp.ts', changeType: 'created', additions: 5, deletions: 0 },
              ],
              summary: { totalFiles: 1, created: 1, modified: 0, deleted: 0 },
            }),
          },
        ],
      },
      {
        id: 'act-2',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'changeSet',
            parsed: () => ({
              files: [
                { path: 'src/temp.ts', changeType: 'deleted', additions: 0, deletions: 5 },
              ],
              summary: { totalFiles: 1, created: 0, modified: 0, deleted: 1 },
            }),
          },
        ],
      },
    ];

    mockSnapshot.mockResolvedValue({
      state: 'inProgress',
      activities,
      changeSet: () => undefined,
    });

    const result = await getSessionChangedFiles(makeClient(), 'session-789');
    expect(result).toEqual([]);
  });

  it('treats created→modified as created', async () => {
    const activities = [
      {
        id: 'act-1',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'changeSet',
            parsed: () => ({
              files: [
                { path: 'src/new.ts', changeType: 'created', additions: 10, deletions: 0 },
              ],
              summary: { totalFiles: 1, created: 1, modified: 0, deleted: 0 },
            }),
          },
        ],
      },
      {
        id: 'act-2',
        type: 'progressUpdated',
        artifacts: [
          {
            type: 'changeSet',
            parsed: () => ({
              files: [
                { path: 'src/new.ts', changeType: 'modified', additions: 2, deletions: 1 },
              ],
              summary: { totalFiles: 1, created: 0, modified: 1, deleted: 0 },
            }),
          },
        ],
      },
    ];

    mockSnapshot.mockResolvedValue({
      state: 'inProgress',
      activities,
      changeSet: () => undefined,
    });

    const result = await getSessionChangedFiles(makeClient(), 'session-abc');

    expect(result).toEqual([
      { path: 'src/new.ts', changeType: 'created' },
    ]);
  });

  it('returns empty array for empty session', async () => {
    mockSnapshot.mockResolvedValue({
      state: 'completed',
      activities: [],
      changeSet: () => undefined,
    });

    const result = await getSessionChangedFiles(makeClient(), 'session-empty');
    expect(result).toEqual([]);
  });
});
