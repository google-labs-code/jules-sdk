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

/**
 * Tests for Query Validator
 */

import { describe, it, expect } from 'vitest';
import {
  validateQuery,
  formatValidationResult,
} from '../../src/query/validate.js';

describe('Query Validator', () => {
  describe('Structure Validation', () => {
    it('rejects non-object queries', () => {
      const result = validateQuery('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_STRUCTURE');
    });

    it('rejects null queries', () => {
      const result = validateQuery(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_STRUCTURE');
    });

    it('rejects array queries', () => {
      const result = validateQuery([{ from: 'sessions' }]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_STRUCTURE');
    });
  });

  describe('Domain Validation', () => {
    it('requires from field', () => {
      const result = validateQuery({});
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].path).toBe('from');
    });

    it('accepts sessions domain', () => {
      const result = validateQuery({ from: 'sessions' });
      expect(result.valid).toBe(true);
    });

    it('accepts activities domain', () => {
      const result = validateQuery({ from: 'activities' });
      expect(result.valid).toBe(true);
    });

    it('rejects invalid domain', () => {
      const result = validateQuery({ from: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_DOMAIN');
    });
  });

  describe('Select Validation', () => {
    it('accepts array of strings', () => {
      const result = validateQuery({
        from: 'sessions',
        select: ['id', 'title'],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects non-array select', () => {
      const result = validateQuery({
        from: 'sessions',
        select: 'id',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_STRUCTURE');
    });

    it('accepts wildcard', () => {
      const result = validateQuery({
        from: 'sessions',
        select: ['*'],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts exclusion prefix', () => {
      const result = validateQuery({
        from: 'activities',
        select: ['*', '-artifacts'],
      });
      expect(result.valid).toBe(true);
    });

    it('warns about unknown fields', () => {
      const result = validateQuery({
        from: 'sessions',
        select: ['nonexistent'],
      });
      expect(result.valid).toBe(true); // Warnings don't invalidate
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe('UNKNOWN_FIELD');
    });
  });

  describe('Where Validation', () => {
    it('accepts valid field filters', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { state: 'completed' },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts search field', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { search: 'authentication' },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects computed field filters', () => {
      const result = validateQuery({
        from: 'activities',
        where: { artifactCount: { gt: 0 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('COMPUTED_FIELD_FILTER');
    });

    it('accepts operator objects', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { state: { in: ['running', 'waiting'] } },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Operator Validation', () => {
    it('accepts eq operator', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { state: { eq: 'completed' } },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts neq operator', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { state: { neq: 'failed' } },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts contains operator with string', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { title: { contains: 'auth' } },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects contains with non-string', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { title: { contains: 123 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_OPERATOR_VALUE');
    });

    it('accepts in operator with array', () => {
      const result = validateQuery({
        from: 'activities',
        where: { type: { in: ['agentMessaged', 'userMessaged'] } },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects in with non-array', () => {
      const result = validateQuery({
        from: 'activities',
        where: { type: { in: 'agentMessaged' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_OPERATOR_VALUE');
    });

    it('accepts exists operator with boolean', () => {
      const result = validateQuery({
        from: 'activities',
        where: { message: { exists: true } },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects exists with non-boolean', () => {
      const result = validateQuery({
        from: 'activities',
        where: { message: { exists: 'yes' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_OPERATOR_VALUE');
    });

    it('rejects unknown operators', () => {
      const result = validateQuery({
        from: 'sessions',
        where: { state: { like: '%test%' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_OPERATOR');
    });
  });

  describe('Order Validation', () => {
    it('accepts asc order', () => {
      const result = validateQuery({
        from: 'sessions',
        order: 'asc',
      });
      expect(result.valid).toBe(true);
    });

    it('accepts desc order', () => {
      const result = validateQuery({
        from: 'sessions',
        order: 'desc',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects invalid order', () => {
      const result = validateQuery({
        from: 'sessions',
        order: 'ascending',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_ORDER');
    });
  });

  describe('Limit Validation', () => {
    it('accepts positive integer limit', () => {
      const result = validateQuery({
        from: 'sessions',
        limit: 10,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects negative limit', () => {
      const result = validateQuery({
        from: 'sessions',
        limit: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_LIMIT');
    });

    it('rejects non-integer limit', () => {
      const result = validateQuery({
        from: 'sessions',
        limit: 10.5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_LIMIT');
    });

    it('warns about high limits', () => {
      const result = validateQuery({
        from: 'sessions',
        limit: 5000,
      });
      expect(result.valid).toBe(true); // High limit is a warning, not error
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe('LIMIT_TOO_HIGH');
    });
  });

  describe('Cursor Validation', () => {
    it('accepts string startAfter', () => {
      const result = validateQuery({
        from: 'sessions',
        startAfter: 'session-123',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects non-string startAfter', () => {
      const result = validateQuery({
        from: 'sessions',
        startAfter: 123,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_STRUCTURE');
    });
  });

  describe('Unknown Fields', () => {
    it('warns about unknown top-level fields', () => {
      const result = validateQuery({
        from: 'sessions',
        unknownField: true,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe('UNKNOWN_QUERY_FIELD');
    });
  });

  describe('Format Validation Result', () => {
    it('formats valid result', () => {
      const result = validateQuery({ from: 'sessions' });
      const formatted = formatValidationResult(result);
      expect(formatted).toContain('Query is valid');
    });

    it('formats errors with suggestions', () => {
      const result = validateQuery({ from: 'invalid' });
      const formatted = formatValidationResult(result);
      expect(formatted).toContain('validation failed');
      expect(formatted).toContain('INVALID_DOMAIN');
      expect(formatted).toContain('Suggestion');
    });

    it('formats warnings', () => {
      const result = validateQuery({
        from: 'sessions',
        limit: 5000,
      });
      const formatted = formatValidationResult(result);
      expect(formatted).toContain('Warnings');
      expect(formatted).toContain('LIMIT_TOO_HIGH');
    });
  });
});
