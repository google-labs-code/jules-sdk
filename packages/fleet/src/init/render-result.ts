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

import type { InitResult } from './spec.js';
import { renderResult, resolveOutputFormat } from '../shared/cli/output.js';

/**
 * Render an InitResult to the appropriate output.
 *
 * - JSON output: writes to stdout and returns true
 * - Text output: renders to the TUI renderer and returns false
 * - On failure: calls process.exit(1) after rendering
 */
export function renderInitOutput(
  result: InitResult,
  args: Record<string, any>,
  renderer: { end: (msg: string) => void; error: (msg: string) => void; render: (evt: any) => void },
): void {
  const format = resolveOutputFormat(args);
  const json = renderResult(result, format, args.fields as string | undefined);

  if (!result.success) {
    if (json !== null) {
      console.log(json);
      process.exit(1);
    }
    renderer.error(result.error.message);
    if (result.error.suggestion) {
      renderer.render({
        type: 'error',
        code: result.error.code,
        message: result.error.suggestion,
      });
    }
    process.exit(1);
  }

  if (json !== null) {
    console.log(json);
    return;
  }

  renderer.end('Fleet initialized! Merge the PR to activate Fleet.');
}
