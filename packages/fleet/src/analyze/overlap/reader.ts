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

/**
 * Parses Fleet Analysis Event comments to extract target file lists.
 *
 * These comments are written by fleet's analyze handler and follow
 * the same immutable event-sourced pattern as dispatch events.
 */

const ANALYSIS_MARKER = '📋 **Fleet Analysis Event**';
const FILE_PATTERN = /^- `([^`]+)`$/gm;

/** Comment data needed for parsing */
export interface IssueComment {
  body: string | null;
}

/**
 * Extract target files from Fleet Analysis Event comments on an issue.
 *
 * Returns the file list from the most recent analysis event, or null
 * if no analysis event comment is found.
 *
 * @param comments - Issue comments to search (newest first preferred)
 */
export function readAnalysisEvent(
  comments: IssueComment[],
): string[] | null {
  // Search from end (most recent) to find the latest analysis event
  for (let i = comments.length - 1; i >= 0; i--) {
    const body = comments[i].body;
    if (!body || !body.includes(ANALYSIS_MARKER)) {
      continue;
    }

    // Extract file paths after the marker
    const markerIndex = body.indexOf(ANALYSIS_MARKER);
    const afterMarker = body.slice(markerIndex + ANALYSIS_MARKER.length);

    const files: string[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    FILE_PATTERN.lastIndex = 0;
    while ((match = FILE_PATTERN.exec(afterMarker)) !== null) {
      files.push(match[1]);
    }

    if (files.length > 0) {
      return files;
    }
  }

  return null;
}

/**
 * Build the markdown body for a Fleet Analysis Event comment.
 *
 * This is the writer counterpart to readAnalysisEvent.
 */
export function buildAnalysisEventBody(files: string[]): string {
  return [
    `${ANALYSIS_MARKER}`,
    'Target Files:',
    ...files.map((f) => `- \`${f}\``),
    `Timestamp: ${new Date().toISOString()}`,
  ].join('\n');
}
