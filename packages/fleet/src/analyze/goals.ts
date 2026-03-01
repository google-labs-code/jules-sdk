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

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

/** Parsed frontmatter configuration */
export interface GoalFileConfig {
  /** Milestone number to scope to */
  milestone?: string;
  /** Verification commands extracted from ## Verification section */
  verification?: string[];
}

/** Result of parsing a goal file */
export interface ParsedGoalFile {
  config: GoalFileConfig;
  body: string;
}

/**
 * Parses a goal file's YAML frontmatter and markdown body.
 */
export function parseGoalFile(filePath: string): ParsedGoalFile {
  const raw = readFileSync(filePath, 'utf-8');
  return parseGoalContent(raw);
}

/**
 * Parses goal file content (for testability without filesystem).
 */
export function parseGoalContent(content: string): ParsedGoalFile {
  const trimmed = content.trim();

  if (!trimmed.startsWith('---')) {
    return { config: {}, body: trimmed };
  }

  // Find the closing --- delimiter (skip the opening one)
  const closingIndex = trimmed.indexOf('\n---', 3);
  if (closingIndex === -1) {
    return { config: {}, body: trimmed };
  }

  const frontmatterRaw = trimmed.slice(4, closingIndex).trim();
  const body = trimmed.slice(closingIndex + 4).trim();

  const parsed = frontmatterRaw ? parseYaml(frontmatterRaw) ?? {} : {};

  return {
    config: {
      milestone: parsed.milestone?.toString(),
      verification: extractVerificationCommands(body),
    },
    body,
  };
}

/**
 * Extracts commands from a ## Verification section in the goal body.
 * Commands are expected as markdown list items with backtick-wrapped commands.
 */
function extractVerificationCommands(body: string): string[] | undefined {
  const sectionMatch = body.match(/## Verification\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!sectionMatch) return undefined;

  const section = sectionMatch[1];
  const commands: string[] = [];
  // Match list items containing backtick-wrapped commands: - `command here`
  const linePattern = /^\s*-\s*`([^`]+)`/gm;
  let match;
  while ((match = linePattern.exec(section)) !== null) {
    commands.push(match[1]);
  }
  return commands.length > 0 ? commands : undefined;
}
