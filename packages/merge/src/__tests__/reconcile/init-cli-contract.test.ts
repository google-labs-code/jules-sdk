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
import { schemaHandler } from '../../reconcile/schema-handler.js';

describe('init CLI contract', () => {
  // ── Schema Introspection (Agent CLI Skill §1) ──────────────────

  it('schema --all includes init for command discovery', () => {
    const all = schemaHandler(undefined, { all: true });
    expect(all).toHaveProperty('init');
    expect(all.init.input).toBeDefined();
    expect(all.init.output).toBeDefined();
  });

  it('schema command description lists init as available', async () => {
    const mod = await import('../../cli/schema.command.js');
    const args = mod.default.args as any;
    const desc = args?.command?.description as string;
    expect(desc).toContain('init');
  });

  it('schema init returns input and output schemas', () => {
    const schema = schemaHandler('init');
    expect(schema.input).toBeDefined();
    expect(schema.output).toBeDefined();
  });

  it('input schema declares base, dryRun, force fields', () => {
    const schema = schemaHandler('init');
    const props = schema.input.definitions?.initInput?.properties;
    expect(props).toHaveProperty('base');
    expect(props).toHaveProperty('dryRun');
    expect(props).toHaveProperty('force');
  });

  it('output schema declares status as enum with created and dry-run', () => {
    const schema = schemaHandler('init');
    const props = schema.output.definitions?.initOutput?.properties;
    expect(props.status.enum).toEqual(['created', 'dry-run']);
  });

  // ── Raw JSON Payloads (Agent CLI Skill §2) ─────────────────────

  it('initHandler parses raw JSON matching the schema', async () => {
    const { initHandler } = await import('../../reconcile/init-handler.js');
    const result = initHandler(
      JSON.parse('{"base":"develop","dryRun":true}'),
    );
    expect(result.status).toBe('dry-run');
    expect(result.base).toBe('develop');
    expect(result.yaml).toContain('branches: [develop]');
  });

  // ── Safety Rails (Agent CLI Skill §4) ──────────────────────────

  it('dryRun defaults to true (safe by default)', async () => {
    const { initHandler } = await import('../../reconcile/init-handler.js');
    const result = initHandler({});
    expect(result.status).toBe('dry-run');
  });
});
