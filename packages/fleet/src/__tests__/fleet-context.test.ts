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
  serializeFleetContext,
  parseFleetContext,
  buildFleetContext,
  hasFleetContext,
} from '../shared/fleet-context.js';

describe('FleetContext contract', () => {
  describe('round-trip: serialize → parse', () => {
    it('round-trips a jules session source', () => {
      const original = buildFleetContext('jules:session:s-abc123');
      const serialized = serializeFleetContext(original);
      const parsed = parseFleetContext(`Some issue body${serialized}`);

      expect(parsed).not.toBeNull();
      expect(parsed!.source).toBe('jules:session:s-abc123');
      expect(parsed!.link).toBe('https://jules.google.com/session/s-abc123');
    });

    it('round-trips a github run source', () => {
      const original = buildFleetContext('github:run:12345');
      const serialized = serializeFleetContext(original);
      const parsed = parseFleetContext(`Body text\n\nMore text${serialized}`);

      expect(parsed).not.toBeNull();
      expect(parsed!.source).toBe('github:run:12345');
    });

    it('round-trips a source with colons in the ID', () => {
      const original = buildFleetContext('jules:session:s-abc:def:ghi');
      const serialized = serializeFleetContext(original);
      const parsed = parseFleetContext(`Body${serialized}`);

      expect(parsed).not.toBeNull();
      expect(parsed!.source).toBe('jules:session:s-abc:def:ghi');
    });

    it('round-trips a source with no known link', () => {
      const original = buildFleetContext('custom:thing:123');
      const serialized = serializeFleetContext(original);
      const parsed = parseFleetContext(`Body${serialized}`);

      expect(parsed).not.toBeNull();
      expect(parsed!.source).toBe('custom:thing:123');
      expect(parsed!.link).toBeNull();
    });
  });

  describe('parseFleetContext', () => {
    it('returns null for body with no Fleet Context', () => {
      expect(parseFleetContext('Just a regular issue body')).toBeNull();
    });

    it('returns null for body with header but no source', () => {
      const body = 'Issue\n\n---\n**Fleet Context**\n- Other: something';
      expect(parseFleetContext(body)).toBeNull();
    });

    it('parses even with extra whitespace in lines', () => {
      const body = 'Issue\n\n---\n  **Fleet Context**  \n- Source: `jules:session:s-123`';
      const result = parseFleetContext(body);
      expect(result).not.toBeNull();
      expect(result!.source).toBe('jules:session:s-123');
    });
  });

  describe('hasFleetContext', () => {
    it('returns true when Fleet Context section exists', () => {
      expect(hasFleetContext('Body\n**Fleet Context**\n- Source: `x`')).toBe(true);
    });

    it('returns false when no Fleet Context section', () => {
      expect(hasFleetContext('Just a normal body')).toBe(false);
    });

    it('returns false for partial header match', () => {
      expect(hasFleetContext('Something **Fleet Context** inline')).toBe(false);
    });
  });

  describe('serializeFleetContext', () => {
    it('includes horizontal rule separator', () => {
      const result = serializeFleetContext({ source: 'test:src:1' });
      expect(result).toContain('---');
    });

    it('wraps source in backticks', () => {
      const result = serializeFleetContext({ source: 'test:src:1' });
      expect(result).toContain('`test:src:1`');
    });

    it('includes link when provided', () => {
      const result = serializeFleetContext({ source: 'test:src:1', link: 'https://example.com' });
      expect(result).toContain('Link: https://example.com');
    });

    it('omits link line when not provided', () => {
      const result = serializeFleetContext({ source: 'test:src:1' });
      expect(result).not.toContain('Link:');
    });
  });
});
