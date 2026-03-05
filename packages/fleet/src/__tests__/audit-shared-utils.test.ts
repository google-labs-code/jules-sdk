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
import { parseNodeId } from '../audit/findings.js';
import { formatSourceLink } from '../shared/source-link.js';

// ── parseNodeId ────────────────────────────────────────────────────

describe('parseNodeId', () => {
  it('parses kind:id format', () => {
    expect(parseNodeId('issue:42')).toEqual({ kind: 'issue', id: '42' });
  });

  it('parses PR node IDs', () => {
    expect(parseNodeId('pr:99')).toEqual({ kind: 'pr', id: '99' });
  });

  it('parses session node IDs with hyphens', () => {
    expect(parseNodeId('session:s-abc123')).toEqual({ kind: 'session', id: 's-abc123' });
  });

  it('handles IDs with colons', () => {
    expect(parseNodeId('session:s-abc:123')).toEqual({ kind: 'session', id: 's-abc:123' });
  });

  it('returns null for empty string', () => {
    expect(parseNodeId('')).toBeNull();
  });

  it('returns null for string with no colon', () => {
    expect(parseNodeId('issue42')).toBeNull();
  });

  it('returns null for string starting with colon', () => {
    expect(parseNodeId(':42')).toBeNull();
  });

  it('returns null for string with colon but no id', () => {
    expect(parseNodeId('issue:')).toBeNull();
  });
});

// ── formatSourceLink ───────────────────────────────────────────────

describe('formatSourceLink', () => {
  it('generates Jules session URL', () => {
    expect(formatSourceLink('jules', 'session', 's-abc123')).toBe(
      'https://jules.google.com/session/s-abc123',
    );
  });

  it('generates GitHub Actions run description', () => {
    expect(formatSourceLink('github', 'run', '12345')).toBe(
      'GitHub Actions run `12345`',
    );
  });

  it('returns null for unknown provider/resource combo', () => {
    expect(formatSourceLink('custom', 'thing', '1')).toBeNull();
  });
});
