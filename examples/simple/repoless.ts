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

/**
 * Repoless Session Example
 *
 * This example demonstrates creating Jules sessions without attaching them
 * to a GitHub repository. These "repoless" sessions are useful for:
 * - General coding questions and discussions
 * - Code review assistance without repo context
 * - Learning and exploration tasks
 *
 * Usage:
 *   bun run main.ts          # Creates a repoless automated run (default)
 *   bun run main.ts run      # Creates a repoless automated run
 *   bun run main.ts session  # Creates a repoless interactive session
 */

import {
  jules,
  JulesError,
  ChangeSetArtifact,
  SessionOutput,
} from '@google/jules-sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { niftty } from 'niftty';

/**
 * Render a unified diff with syntax highlighting using niftty.
 */
async function renderDiff(patch: string): Promise<void> {
  // Parse the diff to extract individual file diffs
  const fileDiffs = patch.split(/(?=^diff --git )/m).filter(Boolean);

  for (const fileDiff of fileDiffs) {
    // Extract file path from diff header
    const pathMatch = fileDiff.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (!pathMatch) continue;

    const filePath = pathMatch[2]!;
    const ext = extname(filePath).slice(1) || 'text';

    // Map common extensions to shiki language ids
    const langMap: Record<string, string> = {
      ts: 'typescript',
      js: 'javascript',
      tsx: 'tsx',
      jsx: 'jsx',
      md: 'markdown',
      sh: 'bash',
    };
    const lang = langMap[ext] || ext;

    // Extract the new file content (lines starting with +, excluding +++ header)
    const addedLines = fileDiff
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .join('\n');

    if (!addedLines.trim()) continue;

    try {
      // Render with niftty - new files have no diffWith (shows as all additions)
      const rendered = await niftty({
        code: addedLines,
        lang: lang as any,
        theme: 'catppuccin-frappe',
        lineNumbers: true,
        streaming: true,
      });

      console.log(`\n      📄 ${filePath}`);
      process.stdout.write(rendered);
      console.log();
    } catch {
      // Fallback to plain text if language not supported
      console.log(`\n      📄 ${filePath}`);
      console.log(
        addedLines
          .split('\n')
          .map((l) => `         ${l}`)
          .join('\n'),
      );
    }
  }
}

// Output directory for saved code
const OUTPUT_DIR = '.output';

// =============================================================================
// File Saving Utilities
// =============================================================================

/**
 * Parse unified diff to extract file contents.
 * For created files, we can extract the full content from the diff.
 */
function extractFilesFromDiff(unidiff: string): Map<string, string> {
  const files = new Map<string, string>();
  const fileBlocks = unidiff.split(/(?=^diff --git)/m).filter(Boolean);

  for (const block of fileBlocks) {
    // Extract file path from "diff --git a/path b/path" or "+++ b/path"
    const pathMatch = block.match(/^\+\+\+ b\/(.+)$/m);
    if (!pathMatch) continue;

    const filePath = pathMatch[1];

    // Extract added lines (lines starting with + but not +++)
    const lines = block.split('\n');
    const contentLines: string[] = [];

    for (const line of lines) {
      // Skip diff headers and context lines
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('@@')) continue;
      if (line.startsWith('diff --git')) continue;
      if (line.startsWith('index ')) continue;
      if (line.startsWith('new file')) continue;

      // Added lines (remove the leading +)
      if (line.startsWith('+')) {
        contentLines.push(line.slice(1));
      }
      // For modified files, we'd need more complex logic
      // For now, we only extract content from added lines
    }

    if (contentLines.length > 0) {
      files.set(filePath!, contentLines.join('\n'));
    }
  }

  return files;
}

/**
 * Save changeSet artifacts to the output directory.
 */
async function saveChangeSet(
  artifact: ChangeSetArtifact,
  sessionId: string,
): Promise<void> {
  // Guard against missing unidiffPatch
  if (!artifact.gitPatch?.unidiffPatch) {
    console.log(`│  ⚠️  No patch data available to save`);
    return;
  }

  const sessionDir = join(OUTPUT_DIR, sessionId);
  await mkdir(sessionDir, { recursive: true });

  // Save the raw unified diff
  const diffPath = join(sessionDir, 'changes.patch');
  await writeFile(diffPath, artifact.gitPatch.unidiffPatch);
  console.log(`│  💾 Saved patch to: ${diffPath}`);

  // Extract and save individual files
  const files = extractFilesFromDiff(artifact.gitPatch.unidiffPatch);
  for (const [filePath, content] of files) {
    const fullPath = join(sessionDir, 'files', filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
    console.log(`│  💾 Saved file: ${fullPath}`);
  }
}

/**
 * Display and save session outputs (the final changeSet from session.outputs).
 */
async function showSessionOutputs(
  session: Awaited<ReturnType<typeof jules.session>>,
  sessionId: string,
): Promise<void> {
  const info = await session.info();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏁 SESSION OUTPUTS (Final Results)`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Total outputs: ${info.outputs.length}`);

  if (info.outputs.length === 0) {
    console.log(
      `   (no outputs - session may not have completed successfully)`,
    );
    console.log(`${'═'.repeat(60)}`);
    return;
  }

  for (const output of info.outputs) {
    // Check what type of output this is (API may not have explicit 'type' field)
    const outputType =
      output.type ||
      ('changeSet' in output
        ? 'changeSet'
        : 'pullRequest' in output
          ? 'pullRequest'
          : 'unknown');
    console.log(`\n   Output type: "${outputType}"`);

    if (outputType === 'pullRequest' && 'pullRequest' in output) {
      console.log(`   📝 Pull Request: ${output.pullRequest.url}`);
    } else if (outputType === 'changeSet' && 'changeSet' in output) {
      console.log(`   📦 FINAL ChangeSet (from session.outputs)`);
      console.log(
        `      Source: ${output.changeSet.source || '(none - repoless)'}`,
      );

      // Handle multi-line commit messages
      const commitMsg =
        output.changeSet.gitPatch.suggestedCommitMessage || '(none)';
      const firstLine = commitMsg.split('\n')[0];
      console.log(`      Commit Message: ${firstLine}`);
      if (commitMsg.includes('\n')) {
        console.log(`      (${commitMsg.split('\n').length} lines total)`);
      }

      console.log(
        `      Diff Size: ${output.changeSet.gitPatch.unidiffPatch?.length || 0} chars`,
      );

      if (output.changeSet.gitPatch.unidiffPatch) {
        console.log(`      ─────────────────────────────────────────`);
        console.log(`      Preview (first 10 lines):`);
        output.changeSet.gitPatch.unidiffPatch
          .split('\n')
          .slice(0, 10)
          .forEach((line: string) => {
            console.log(`      │ ${line}`);
          });

        // Save the changeSet from session output
        const sessionDir = join(OUTPUT_DIR, sessionId);
        await mkdir(sessionDir, { recursive: true });

        const patchPath = join(sessionDir, 'final-output.patch');
        await writeFile(patchPath, output.changeSet.gitPatch.unidiffPatch);
        console.log(`      💾 Saved to: ${patchPath}`);

        const files = extractFilesFromDiff(
          output.changeSet.gitPatch.unidiffPatch,
        );
        for (const [filePath, content] of files) {
          const fullPath = join(sessionDir, 'output-files', filePath);
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, content);
          console.log(`      💾 Saved: ${fullPath}`);
        }
      }
    } else {
      console.log(
        `   ⚠️  Unknown output type: ${JSON.stringify(output, null, 2)}`,
      );
    }
  }
  console.log(`${'═'.repeat(60)}`);
}

// =============================================================================
// Example Prompts for Repoless Sessions
// =============================================================================
const PROMPTS = {
  codeReview: `You are a senior code reviewer. Please review the following TypeScript code and provide feedback on:
1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
4. Suggestions for improvement

\`\`\`typescript
function fetchUserData(userId: string) {
  return fetch('/api/users/' + userId)
    .then(res => res.json())
    .then(data => {
      console.log('Got data:', data);
      return data;
    });
}

async function processUsers(ids: string[]) {
  const results = [];
  for (const id of ids) {
    const user = await fetchUserData(id);
    results.push(user);
  }
  return results;
}
\`\`\``,

  conceptExplain: `Explain the difference between TypeScript's 'unknown' and 'any' types.
Include:
1. When to use each one
2. Type safety implications
3. A practical code example demonstrating the difference`,

  architectureAdvice: `I'm building a real-time collaborative document editor. 
What architecture patterns would you recommend for handling:
1. Conflict resolution when multiple users edit simultaneously
2. Offline support with sync when reconnecting
3. Undo/redo across collaborative sessions

Please provide high-level recommendations with brief code sketches.`,
};

// =============================================================================
// Main Application Logic
// =============================================================================

async function runRepolessAutomated() {
  console.log('🚀 Creating a repoless automated run...\n');

  try {
    // Create an automated run WITHOUT source context (repoless)
    const run = await jules.run({
      prompt: PROMPTS.codeReview,
      // Note: No 'source' property = repoless session!
    });

    // const run = await jules.session('3082943853976853112');

    console.log(`✅ Repoless run created with ID: ${run.id}`);
    console.log('\n... Streaming activities ...\n');

    // Stream and display progress
    for await (const activity of run.stream()) {
      if (activity.type === 'progressUpdated') {
        const progressText =
          activity.title || activity.description || '(working...)';
        console.log(`\n📌 PROGRESS`);
        console.log(`   ${progressText}`);

        for (const artifact of activity.artifacts) {
          if (artifact.type === 'changeSet') {
            const parsed = artifact.parsed();
            console.log(`\n   📦 Code Changes`);
            console.log(
              `      ${parsed.summary.totalFiles} file(s) · 🟢 ${parsed.summary.created} created · 🟡 ${parsed.summary.modified} modified · 🔴 ${parsed.summary.deleted} deleted`,
            );

            // Render syntax-highlighted diffs using niftty
            if (artifact.gitPatch?.unidiffPatch) {
              await renderDiff(artifact.gitPatch.unidiffPatch);
            }

            // Save the code to .output directory
            await saveChangeSet(artifact, run.id);
          }
        }
      }
      if (activity.type === 'agentMessaged') {
        console.log(`\n🤖 AGENT`);
        activity.message.split('\n').forEach((line) => {
          console.log(`   ${line}`);
        });
      }
    }

    // Get the final result
    const outcome = await run.result();
    console.log('\n... Run finished ...');
    console.log(`Final state: ${outcome.state}`);

    // Inspect session outputs for changeSet (new REST API feature)
    const session = await jules.session(run.id);
    const info = await session.info();

    console.log(`\n📊 SESSION OUTPUTS`);
    console.log(`   Total outputs: ${info.outputs.length}`);

    if (info.outputs.length === 0) {
      console.log(`   (no outputs yet - session may still be in progress)`);
    }

    for (const output of info.outputs) {
      console.log(`\n   Output type: "${output.type}"`);

      if (output.type === 'pullRequest') {
        console.log(`   📝 Pull Request`);
        console.log(`      URL: ${output.pullRequest.url}`);
      } else if (output.type === 'changeSet') {
        console.log(`   📦 ChangeSet Output`);
        console.log(
          `      Source: ${output.changeSet.source || '(none - repoless)'}`,
        );
        console.log(
          `      Base Commit: ${output.changeSet.gitPatch.baseCommitId || '(none)'}`,
        );
        console.log(
          `      Commit Message: ${output.changeSet.gitPatch.suggestedCommitMessage || '(none)'}`,
        );
        console.log(
          `      Diff Size: ${output.changeSet.gitPatch.unidiffPatch?.length || 0} chars`,
        );

        // Show first few lines of the diff
        if (output.changeSet.gitPatch.unidiffPatch) {
          console.log(`      ─────────────────────────────────────────`);
          console.log(`      Preview (first 10 lines):`);
          output.changeSet.gitPatch.unidiffPatch
            .split('\n')
            .slice(0, 10)
            .forEach((line: string) => {
              console.log(`      │ ${line}`);
            });

          // Save the changeSet from session output
          const sessionDir = join(OUTPUT_DIR, run.id);
          await mkdir(sessionDir, { recursive: true });

          // Save the raw patch
          const patchPath = join(sessionDir, 'final-output.patch');
          await writeFile(patchPath, output.changeSet.gitPatch.unidiffPatch);
          console.log(`      💾 Saved to: ${patchPath}`);

          // Extract and save files
          const files = extractFilesFromDiff(
            output.changeSet.gitPatch.unidiffPatch,
          );
          for (const [filePath, content] of files) {
            const fullPath = join(sessionDir, 'output-files', filePath);
            await mkdir(dirname(fullPath), { recursive: true });
            await writeFile(fullPath, content);
            console.log(`      💾 Saved: ${fullPath}`);
          }
        }
      } else {
        // Log unknown output types for debugging
        console.log(
          `   ⚠️  Unknown output type: ${JSON.stringify(output, null, 2)}`,
        );
      }
    }
  } catch (error) {
    handleError(error);
  }
}

async function runRepolessSession() {
  console.log('🚀 Creating a repoless interactive session...\n');

  try {
    // Create an interactive session WITHOUT source context (repoless)
    const session = await jules.session({
      prompt: PROMPTS.conceptExplain,
      // Note: No 'source' property = repoless session!
    });

    console.log(`✅ Repoless session created with ID: ${session.id}`);

    // Get session info to verify it was created correctly
    const info = await session.info();
    console.log(`Session state: ${info.state}`);
    console.log(`Session URL: ${info.url}`);

    console.log('\n... Streaming activities ...\n');

    // Stream activities (will run until session completes or fails)
    for await (const activity of session.stream()) {
      if (activity.type === 'planGenerated') {
        console.log(`\n📝 PLAN`);
        activity.plan.steps.forEach((step, i) => {
          console.log(`   ${i + 1}. ${step.title}`);
        });
      }
      if (activity.type === 'progressUpdated') {
        const progressText =
          activity.title || activity.description || '(working...)';
        console.log(`\n📌 PROGRESS`);
        console.log(`   ${progressText}`);

        for (const artifact of activity.artifacts) {
          if (artifact.type === 'changeSet') {
            const parsed = artifact.parsed();
            console.log(`\n   📦 Code Changes`);
            console.log(
              `      ${parsed.summary.totalFiles} file(s) · 🟢 ${parsed.summary.created} created · 🟡 ${parsed.summary.modified} modified · 🔴 ${parsed.summary.deleted} deleted`,
            );

            // Render syntax-highlighted diffs using niftty
            if (artifact.gitPatch?.unidiffPatch) {
              await renderDiff(artifact.gitPatch.unidiffPatch);
            }
          }
        }
      }
      if (activity.type === 'agentMessaged') {
        console.log(`\n🤖 AGENT`);
        activity.message.split('\n').forEach((line) => {
          console.log(`   ${line}`);
        });
      }
    }

    // Get the final result
    const outcome = await session.result();
    console.log('\n... Session finished ...');
    console.log(`Final state: ${outcome.state}`);
  } catch (error) {
    handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof JulesError) {
    console.error(`\n❌ SDK Error: ${error.constructor.name}`);
    console.error(error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  } else {
    console.error('\n❌ Unexpected error:', error);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

const mode = process.argv[2] || 'run';
const sessionIdArg = process.argv[3]; // Optional session ID for resume mode

console.log('='.repeat(60));
console.log('  Repoless Session Example');
console.log('='.repeat(60));
console.log(`\nMode: ${mode}`);
if (sessionIdArg) {
  console.log(`Session ID: ${sessionIdArg}`);
}
console.log(
  `API Key: ${process.env.JULES_API_KEY ? '✅ Set' : '❌ Not set'}\n`,
);

if (!process.env.JULES_API_KEY) {
  console.error('Please set the JULES_API_KEY environment variable.');
  console.error('  export JULES_API_KEY=your-api-key-here');
  process.exit(1);
}

/**
 * Resume an existing session by ID - stream activities and wait for completion.
 */
async function resumeSession(sessionId: string) {
  console.log(`🔄 Resuming session: ${sessionId}\n`);

  try {
    const session = await jules.session(sessionId);
    const info = await session.info();

    console.log(`Session state: ${info.state}`);
    console.log(`Session URL: ${info.url}`);

    // Check if session is already in a terminal state
    const terminalStates = ['completed', 'failed', 'cancelled'];
    if (terminalStates.includes(info.state)) {
      console.log(
        `\n✅ Session is already ${info.state}. Skipping to outputs...\n`,
      );

      // Show session outputs directly
      await showSessionOutputs(session, sessionId);
      return;
    }

    console.log('\n... Streaming activities ...\n');

    // Stream activities
    for await (const activity of session.stream()) {
      if (activity.type === 'progressUpdated') {
        const progressText =
          activity.title || activity.description || '(working...)';
        console.log(`\n📌 PROGRESS`);
        console.log(`   ${progressText}`);

        for (const artifact of activity.artifacts) {
          if (artifact.type === 'changeSet') {
            const parsed = artifact.parsed();
            console.log(`\n   📦 Code Changes`);
            console.log(
              `      ${parsed.summary.totalFiles} file(s) · 🟢 ${parsed.summary.created} created · 🟡 ${parsed.summary.modified} modified · 🔴 ${parsed.summary.deleted} deleted`,
            );

            // Render syntax-highlighted diffs using niftty
            if (artifact.gitPatch?.unidiffPatch) {
              await renderDiff(artifact.gitPatch.unidiffPatch);
            }

            // Save the code to .output directory
            await saveChangeSet(artifact, sessionId);
          }
        }
      }
      if (activity.type === 'agentMessaged') {
        console.log(`\n🤖 AGENT`);
        activity.message.split('\n').forEach((line: string) => {
          console.log(`   ${line}`);
        });
      }
      // Handle session completion - break out of stream
      if (activity.type === 'sessionCompleted') {
        console.log(`\n✅ Session completed!`);
        break;
      }
      if (activity.type === 'sessionFailed') {
        console.log(`\n❌ Session failed: ${activity.reason}`);
        break;
      }
    }

    // Show session outputs (skipping session.result() since we already broke from stream)
    console.log('\n... Fetching session outputs ...');
    await showSessionOutputs(session, sessionId);
  } catch (error) {
    handleError(error);
  }
}

// Route to the appropriate function
if (mode === 'session') {
  runRepolessSession();
} else if (mode === 'resume' && sessionIdArg) {
  resumeSession(sessionIdArg);
} else if (mode === 'resume' && !sessionIdArg) {
  console.error('❌ resume mode requires a session ID');
  console.error('  Usage: bun run main.ts resume <session-id>');
  process.exit(1);
} else {
  runRepolessAutomated();
}
