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

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

/** Parsed fleet configuration from .fleet/config.yml */
export interface FleetConfig {
  analyze?: {
    /** Repo-wide preamble prepended to all goal prompts */
    preamble?: string;
  };
}

/**
 * Read and parse the fleet configuration file.
 * Returns empty config if file doesn't exist or is malformed.
 *
 * This is in shared/ because .fleet/config.yml is repo-wide —
 * dispatch, trace, and other modules may also need config values.
 */
export function readFleetConfig(repoRoot: string): FleetConfig {
  const configPath = join(repoRoot, '.fleet', 'config.yml');

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(raw);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return {
      analyze: parsed.analyze
        ? {
            preamble:
              typeof parsed.analyze.preamble === 'string'
                ? parsed.analyze.preamble
                : undefined,
          }
        : undefined,
    };
  } catch {
    // Malformed YAML — degrade gracefully
    return {};
  }
}

/**
 * Get the preamble for the analyzer prompt.
 * Returns undefined if no config file or no preamble set.
 */
export function getAnalyzePreamble(repoRoot: string): string | undefined {
  const config = readFleetConfig(repoRoot);
  return config.analyze?.preamble;
}
