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

import { formatSourceLink } from './source-link.js';

// ── CONTRACT ───────────────────────────────────────────────────────

/**
 * Structured representation of the Fleet Context footer.
 * This module owns the format — serialization and parsing live here
 * so format changes are always in sync.
 */
export interface FleetContext {
  /** Source ref in provider:resource:id format */
  source: string;
  /** Human-readable link (auto-generated from source) */
  link?: string | null;
}

// ── KEY CONSTANTS ──────────────────────────────────────────────────

/** The section header that marks the start of Fleet Context. */
const SECTION_HEADER = '**Fleet Context**';
/** Key used for the source field in the footer. */
const SOURCE_KEY = 'Source';
/** Key used for the link field in the footer. */
const LINK_KEY = 'Link';

// ── SERIALIZE ──────────────────────────────────────────────────────

/**
 * Serialize a FleetContext into a markdown footer block.
 * Used by signal/handler.ts when creating issues.
 *
 * Output:
 * ```
 * ---
 * **Fleet Context**
 * - Source: `jules:session:s-12345`
 * - Link: https://jules.google.com/session/s-12345
 * ```
 */
export function serializeFleetContext(ctx: FleetContext): string {
  const lines: string[] = [
    '',
    '---',
    SECTION_HEADER,
    `- ${SOURCE_KEY}: \`${ctx.source}\``,
  ];

  if (ctx.link) {
    lines.push(`- ${LINK_KEY}: ${ctx.link}`);
  }

  return lines.join('\n');
}

/**
 * Build a FleetContext from a source ref string.
 * Convenience wrapper that auto-generates the link.
 */
export function buildFleetContext(sourceRef: string): FleetContext {
  const [provider, resource, ...idParts] = sourceRef.split(':');
  const id = idParts.join(':');
  const link = formatSourceLink(provider, resource, id);
  return { source: sourceRef, link };
}

// ── PARSE ──────────────────────────────────────────────────────────

/**
 * Parse a FleetContext from an issue body.
 * Uses line-by-line parsing — the format is a simple key-value list
 * under a known section header.
 *
 * Returns null if no Fleet Context section is found.
 */
export function parseFleetContext(body: string): FleetContext | null {
  const lines = body.split('\n');

  // Find the section header
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === SECTION_HEADER) {
      sectionStart = i;
      break;
    }
  }
  if (sectionStart === -1) return null;

  // Parse key-value pairs from list items after the header
  const fields = new Map<string, string>();
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Stop at empty line or next section (another header or rule)
    if (line === '' || line.startsWith('#') || line === '---') break;

    // Parse "- Key: value" format
    if (!line.startsWith('- ')) continue;

    const colonIndex = line.indexOf(':', 2);
    if (colonIndex === -1) continue;

    const key = line.slice(2, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    fields.set(key, value);
  }

  // Extract source (strip backticks)
  const rawSource = fields.get(SOURCE_KEY);
  if (!rawSource) return null;

  const source = rawSource.startsWith('`') && rawSource.endsWith('`')
    ? rawSource.slice(1, -1)
    : rawSource;

  const link = fields.get(LINK_KEY) ?? null;

  return { source, link };
}

/**
 * Check whether a body contains a Fleet Context section.
 * Cheaper than full parsing when you only need a boolean check.
 */
export function hasFleetContext(body: string): boolean {
  return body.split('\n').some((line) => line.trim() === SECTION_HEADER);
}
