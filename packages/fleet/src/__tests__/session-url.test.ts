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

import { describe, it, expect, afterEach } from 'vitest';
import { sessionUrl, repoConfigUrl, ansiLink, ansiHighlight } from '../shared/ui/session-url.js';

describe('ansiHighlight', () => {
  const originalEnvCI = process.env.CI;
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.env.CI = originalEnvCI;
    process.stdout.isTTY = originalIsTTY;
  });

  it('highlights backticked text in interactive/TTY environment', () => {
    delete process.env.CI;
    process.stdout.isTTY = true;

    const result = ansiHighlight('Use `jules-fleet configure` now');
    expect(result).toBe('Use `\x1b[33mjules-fleet configure\x1b[39m` now');
  });

  it('leaves text unhighlighted when not in interactive/TTY environment', () => {
    delete process.env.CI;
    process.stdout.isTTY = false;

    const result = ansiHighlight('Use `jules-fleet configure` now');
    expect(result).toBe('Use `jules-fleet configure` now');
  });
});

describe('ansiLink', () => {
  const originalEnvCI = process.env.CI;
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.env.CI = originalEnvCI;
    process.stdout.isTTY = originalIsTTY;
  });

  it('wraps text with OSC 8 escape sequences in interactive/TTY environment', () => {
    delete process.env.CI;
    process.stdout.isTTY = true;

    const link = ansiLink('click here', 'https://jules.google.com');
    expect(link).toBe(
      '\x1b]8;;https://jules.google.com\x07\x1b[36m\x1b[4mclick here\x1b[24m\x1b[39m\x1b]8;;\x07',
    );
  });

  it('falls back to plain format when not in an interactive/TTY environment', () => {
    delete process.env.CI;
    process.stdout.isTTY = false;

    const link = ansiLink('click here', 'https://jules.google.com');
    expect(link).toBe('click here (https://jules.google.com)');

    const sameLink = ansiLink('https://jules.google.com', 'https://jules.google.com');
    expect(sameLink).toBe('https://jules.google.com');
  });

  it('falls back to plain format when process.env.CI is true even if TTY is true', () => {
    process.env.CI = 'true';
    process.stdout.isTTY = true;

    const link = ansiLink('click here', 'https://jules.google.com');
    expect(link).toBe('click here (https://jules.google.com)');
  });
});

describe('sessionUrl', () => {
  it('uses /session/ (singular) in the URL', () => {
    const url = sessionUrl('12345');
    expect(url).toBe('https://jules.google.com/session/12345');
    expect(url).not.toContain('/sessions/');
  });
});

describe('repoConfigUrl', () => {
  it('constructs correct URL for repository configuration', () => {
    const url = repoConfigUrl('google', 'jules');
    expect(url).toBe('https://jules.google.com/repo/github/google/jules/config');
  });
});

describe('dispatch comment session regex', () => {
  // The regex from status.ts: /Session:\s*\[?`([^`]+)`\]?/
  const regex = /Session:\s*\[?`([^`]+)`\]?/;

  it('parses old format: Session: `id`', () => {
    const body =
      '🤖 **Fleet Dispatch Event**\nSession: `abc123`\nTimestamp: 2026-01-01';
    const match = body.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('abc123');
  });

  it('parses new format: Session: [`id`](url)', () => {
    const body =
      '🤖 **Fleet Dispatch Event**\nSession: [`abc123`](https://jules.google.com/session/abc123)\nTimestamp: Mar 3, 2026';
    const match = body.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('abc123');
  });

  it('handles numeric session IDs', () => {
    const body =
      'Session: [`17338656567244366276`](https://jules.google.com/session/17338656567244366276)';
    const match = body.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('17338656567244366276');
  });
});
