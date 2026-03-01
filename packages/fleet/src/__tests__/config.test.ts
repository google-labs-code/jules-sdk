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
import { readFleetConfig, getAnalyzePreamble } from '../shared/config.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeTempRepo(configYaml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-config-test-'));
  if (configYaml !== undefined) {
    mkdirSync(join(dir, '.fleet'), { recursive: true });
    writeFileSync(join(dir, '.fleet', 'config.yml'), configYaml);
  }
  return dir;
}

describe('readFleetConfig', () => {
  it('returns empty config when no .fleet/config.yml exists', () => {
    const dir = makeTempRepo();
    expect(readFleetConfig(dir)).toEqual({});
  });

  it('parses preamble from valid config', () => {
    const dir = makeTempRepo(`
analyze:
  preamble: "This is a Python 3.12 project using FastAPI."
`);
    const config = readFleetConfig(dir);
    expect(config.analyze?.preamble).toBe(
      'This is a Python 3.12 project using FastAPI.',
    );
  });

  it('returns empty config for malformed YAML', () => {
    const dir = makeTempRepo(':::invalid:yaml:::');
    expect(readFleetConfig(dir)).toEqual({});
  });

  it('returns empty config for empty file', () => {
    const dir = makeTempRepo('');
    expect(readFleetConfig(dir)).toEqual({});
  });

  it('ignores non-string preamble values', () => {
    const dir = makeTempRepo(`
analyze:
  preamble: 42
`);
    const config = readFleetConfig(dir);
    expect(config.analyze?.preamble).toBeUndefined();
  });

  it('handles config with analyze but no preamble', () => {
    const dir = makeTempRepo(`
analyze:
  some_other_key: true
`);
    const config = readFleetConfig(dir);
    expect(config.analyze?.preamble).toBeUndefined();
  });
});

describe('getAnalyzePreamble', () => {
  it('returns preamble string when set', () => {
    const dir = makeTempRepo(`
analyze:
  preamble: "Use strict mode."
`);
    expect(getAnalyzePreamble(dir)).toBe('Use strict mode.');
  });

  it('returns undefined when no config exists', () => {
    const dir = makeTempRepo();
    expect(getAnalyzePreamble(dir)).toBeUndefined();
  });
});
