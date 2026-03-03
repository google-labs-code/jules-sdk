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
import { sessionUrl } from '../shared/ui/session-url.js';

describe('sessionUrl', () => {
  it('uses /session/ (singular) in the URL', () => {
    const url = sessionUrl('12345');
    expect(url).toBe('https://jules.google.com/session/12345');
    expect(url).not.toContain('/sessions/');
  });
});

describe('dispatch comment session regex', () => {
  // The regex from status.ts: /Session:\s*\[?`([^`]+)`\]?/
  const regex = /Session:\s*\[?`([^`]+)`\]?/;

  it('parses old format: Session: `id`', () => {
    const body = '🤖 **Fleet Dispatch Event**\nSession: `abc123`\nTimestamp: 2026-01-01';
    const match = body.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('abc123');
  });

  it('parses new format: Session: [`id`](url)', () => {
    const body = '🤖 **Fleet Dispatch Event**\nSession: [`abc123`](https://jules.google.com/session/abc123)\nTimestamp: Mar 3, 2026';
    const match = body.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('abc123');
  });

  it('handles numeric session IDs', () => {
    const body = 'Session: [`17338656567244366276`](https://jules.google.com/session/17338656567244366276)';
    const match = body.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('17338656567244366276');
  });
});
