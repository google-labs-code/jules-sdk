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
import { resolveSourceRef } from '../signal/resolve-source.js';

describe('resolveSourceRef', () => {
  it('--source flag wins over all env vars', () => {
    const result = resolveSourceRef({
      flag: 'github:run:42',
      fleetSourceRef: 'fleet:ref:99',
      julesSessionId: 's-123',
    });
    expect(result).toBe('github:run:42');
  });

  it('FLEET_SOURCE_REF used when no flag', () => {
    const result = resolveSourceRef({
      fleetSourceRef: 'fleet:ref:99',
      julesSessionId: 's-123',
    });
    expect(result).toBe('fleet:ref:99');
  });

  it('JULES_SESSION_ID auto-formats as jules:session:{id}', () => {
    const result = resolveSourceRef({
      julesSessionId: 's-123',
    });
    expect(result).toBe('jules:session:s-123');
  });

  it('returns undefined when nothing is set', () => {
    const result = resolveSourceRef({});
    expect(result).toBeUndefined();
  });
});
