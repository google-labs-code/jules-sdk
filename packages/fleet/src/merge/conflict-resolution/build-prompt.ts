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

export interface ConflictPromptContext {
  prNumber: number;
  conflictingFiles: string[];
  /** Map of file path → current content on base branch */
  baseContent: Map<string, string>;
  /** Other PRs in the same conflict group */
  peerPRs: Array<{ number: number; files: string[] }>;
}

/**
 * Builds a conflict notification prompt to send to an active Jules session.
 * Uses fenced code blocks (no HTML angle brackets) for Jules prompt safety.
 */
export function buildConflictPrompt(ctx: ConflictPromptContext): string {
  const lines: string[] = [
    '## Merge Conflict Detected',
    '',
    `Your PR #${ctx.prNumber} has merge conflicts on the following files:`,
  ];

  for (const file of ctx.conflictingFiles) {
    lines.push(`- \`${file}\``);
  }

  // Base branch content for conflicting files
  if (ctx.baseContent.size > 0) {
    lines.push('');
    lines.push(
      '### Current state of `main` for each conflicting file:',
    );
    lines.push('');

    for (const [filePath, content] of ctx.baseContent) {
      const ext = filePath.split('.').pop() ?? '';
      lines.push(`\`${filePath}\`:`);
      lines.push('```' + ext);
      lines.push(content);
      lines.push('```');
      lines.push('');
    }
  }

  // Peer PR awareness
  if (ctx.peerPRs.length > 0) {
    lines.push('### Other PRs in this conflict group:');
    for (const peer of ctx.peerPRs) {
      const fileList = peer.files.map((f) => `\`${f}\``).join(', ');
      lines.push(`- PR #${peer.number} modifies: ${fileList}`);
    }
    lines.push('');
  }

  lines.push('### Instructions:');
  lines.push(
    '1. Check if your changes to the conflicting files are still needed',
  );
  lines.push('   (they may already be on main)');
  lines.push(
    '2. If the change already exists on main, remove the file from',
  );
  lines.push('   your changeset');
  lines.push(
    '3. If the change differs, update your version to be compatible',
  );
  lines.push('   with main');
  lines.push('4. Push the updated branch');

  return lines.join('\n');
}
