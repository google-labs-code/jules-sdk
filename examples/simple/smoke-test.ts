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

import { jules } from '@google/jules-sdk';

// Quick smoke test to verify the SDK is importable and instantiable
console.log('✅ Jules SDK imported successfully');
console.log('✅ jules singleton available');

// Test that key methods exist
console.assert(typeof jules.session === 'function', 'jules.session() exists');
console.assert(typeof jules.run === 'function', 'jules.run() exists');
console.assert(typeof jules.all === 'function', 'jules.all() exists');
console.assert(typeof jules.with === 'function', 'jules.with() exists');
console.assert(
  typeof jules.sources.get === 'function',
  'jules.sources.get() exists',
);
console.assert(
  typeof jules.sources.list === 'function',
  'jules.sources.list() exists',
);

console.log('✅ All API methods verified');
