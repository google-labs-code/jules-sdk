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

import { describe, it, expect } from 'vitest';
import {
  readAnalysisEvent,
  buildAnalysisEventBody,
} from '../analyze/overlap/reader.js';

describe('buildAnalysisEventBody', () => {
  it('builds a well-formed analysis event comment', () => {
    const body = buildAnalysisEventBody(['src/client.py', 'src/models.py']);
    expect(body).toContain('📋 **Fleet Analysis Event**');
    expect(body).toContain('- `src/client.py`');
    expect(body).toContain('- `src/models.py`');
    expect(body).toContain('Timestamp:');
  });
});

describe('readAnalysisEvent', () => {
  it('parses files from a valid analysis event comment', () => {
    const body = buildAnalysisEventBody(['src/client.py', 'src/models.py']);
    const files = readAnalysisEvent([{ body }]);
    expect(files).toEqual(['src/client.py', 'src/models.py']);
  });

  it('returns null when no analysis event found', () => {
    const files = readAnalysisEvent([
      { body: 'Regular comment' },
      { body: 'Another comment' },
    ]);
    expect(files).toBeNull();
  });

  it('returns null for empty comments array', () => {
    const files = readAnalysisEvent([]);
    expect(files).toBeNull();
  });

  it('returns null for null body comments', () => {
    const files = readAnalysisEvent([{ body: null }]);
    expect(files).toBeNull();
  });

  it('reads the most recent analysis event when multiple exist', () => {
    const older = buildAnalysisEventBody(['src/old.py']);
    const newer = buildAnalysisEventBody(['src/new.py', 'src/newer.py']);
    const files = readAnalysisEvent([{ body: older }, { body: newer }]);
    expect(files).toEqual(['src/new.py', 'src/newer.py']);
  });

  it('skips non-analysis comments to find the event', () => {
    const body = buildAnalysisEventBody(['src/client.py']);
    const files = readAnalysisEvent([
      { body: 'Random comment' },
      { body: '🤖 **Fleet Dispatch Event**\nSession: `abc123`' },
      { body },
    ]);
    expect(files).toEqual(['src/client.py']);
  });

  it('returns null when analysis event has no parseable files', () => {
    const body = '📋 **Fleet Analysis Event**\nTarget Files:\nNo files found.';
    const files = readAnalysisEvent([{ body }]);
    expect(files).toBeNull();
  });

  it('handles files with special characters in paths', () => {
    const body = buildAnalysisEventBody([
      'src/my-module/sub_dir/file.py',
      'tests/test_my-module.py',
    ]);
    const files = readAnalysisEvent([{ body }]);
    expect(files).toEqual([
      'src/my-module/sub_dir/file.py',
      'tests/test_my-module.py',
    ]);
  });
});
