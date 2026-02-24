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

import { describe, it, expect } from 'vitest';
import {
  getSchema,
  getAllSchemas,
  generateTypeDefinition,
  generateMarkdownDocs,
  SESSION_SCHEMA,
  ACTIVITY_SCHEMA,
  FILTER_OP_SCHEMA,
  PROJECTION_SCHEMA,
} from '../../src/query/schema.js';

describe('Query Schema', () => {
  describe('getSchema', () => {
    it('returns SESSION_SCHEMA for "sessions"', () => {
      const schema = getSchema('sessions');
      expect(schema.domain).toBe('sessions');
      expect(schema).toBe(SESSION_SCHEMA);
    });

    it('returns ACTIVITY_SCHEMA for "activities"', () => {
      const schema = getSchema('activities');
      expect(schema.domain).toBe('activities');
      expect(schema).toBe(ACTIVITY_SCHEMA);
    });
  });

  describe('getAllSchemas', () => {
    it('returns all schemas and documentation', () => {
      const all = getAllSchemas();
      expect(all.sessions).toBe(SESSION_SCHEMA);
      expect(all.activities).toBe(ACTIVITY_SCHEMA);
      expect(all.filterOps).toBe(FILTER_OP_SCHEMA);
      expect(all.projection).toBe(PROJECTION_SCHEMA);
    });
  });

  describe('generateTypeDefinition', () => {
    it('generates SessionResource interface for sessions', () => {
      const typedef = generateTypeDefinition('sessions');
      expect(typedef).toContain('interface SessionResource');
      expect(typedef).toContain('id: string;');
      expect(typedef).toContain('title: string;');
    });

    it('generates Activity interface for activities', () => {
      const typedef = generateTypeDefinition('activities');
      expect(typedef).toContain('interface Activity');
      expect(typedef).toContain('id: string;');
      expect(typedef).toContain('type: ActivityType;');
    });
  });

  describe('generateMarkdownDocs', () => {
    it('generates markdown documentation with all sections', () => {
      const docs = generateMarkdownDocs();
      expect(docs).toContain('# Jules Query Language (JQL) Schema Reference');
      expect(docs).toContain('## Sessions Domain');
      expect(docs).toContain('## Activities Domain');
      expect(docs).toContain('## Filter Operators');
      expect(docs).toContain('## Projection (Select)');
      expect(docs).toContain('## Query Examples');
    });
  });

  describe('Schema Integrity', () => {
    describe('SESSION_SCHEMA', () => {
      it('has expected structure', () => {
        expect(SESSION_SCHEMA.domain).toBe('sessions');
        expect(Array.isArray(SESSION_SCHEMA.fields)).toBe(true);
        expect(SESSION_SCHEMA.fields.length).toBeGreaterThan(0);
        expect(Array.isArray(SESSION_SCHEMA.examples)).toBe(true);
        expect(SESSION_SCHEMA.examples.length).toBeGreaterThan(0);
      });

      it('has valid field definitions', () => {
        for (const field of SESSION_SCHEMA.fields) {
          expect(field.name).toBeDefined();
          expect(field.type).toBeDefined();
          expect(field.description).toBeDefined();
        }
      });
    });

    describe('ACTIVITY_SCHEMA', () => {
      it('has expected structure', () => {
        expect(ACTIVITY_SCHEMA.domain).toBe('activities');
        expect(Array.isArray(ACTIVITY_SCHEMA.fields)).toBe(true);
        expect(ACTIVITY_SCHEMA.fields.length).toBeGreaterThan(0);
        expect(Array.isArray(ACTIVITY_SCHEMA.examples)).toBe(true);
        expect(ACTIVITY_SCHEMA.examples.length).toBeGreaterThan(0);
      });

      it('has valid field definitions', () => {
        for (const field of ACTIVITY_SCHEMA.fields) {
          expect(field.name).toBeDefined();
          expect(field.type).toBeDefined();
          expect(field.description).toBeDefined();
        }
      });
    });

    describe('FILTER_OP_SCHEMA', () => {
      it('has expected structure', () => {
        expect(Array.isArray(FILTER_OP_SCHEMA.operators)).toBe(true);
        expect(FILTER_OP_SCHEMA.operators.length).toBeGreaterThan(0);
        for (const op of FILTER_OP_SCHEMA.operators) {
          expect(op.name).toBeDefined();
          expect(op.description).toBeDefined();
          expect(op.example).toBeDefined();
        }
      });
    });

    describe('PROJECTION_SCHEMA', () => {
      it('has expected structure', () => {
        expect(Array.isArray(PROJECTION_SCHEMA.syntax)).toBe(true);
        expect(PROJECTION_SCHEMA.syntax.length).toBeGreaterThan(0);
        expect(PROJECTION_SCHEMA.defaults.sessions).toBeDefined();
        expect(PROJECTION_SCHEMA.defaults.activities).toBeDefined();
      });
    });
  });
});
