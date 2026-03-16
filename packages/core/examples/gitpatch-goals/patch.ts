import { Outcome } from '@google/jules-sdk';

/**
 * Extracts a GitPatch diff from a completed session outcome.
 * Prefers the native changeSet object but falls back to manually creating
 * a diff from generated files if necessary.
 */
export function extractGitPatch(genOutcome: Outcome): string | null {
  console.error('\n--- Step 2: Extracting GitPatch ---');

  let gitPatch = '';

  // Let's first check if changeSet is available on the snapshot
  if (typeof genOutcome.changeSet === 'function') {
    const patch = genOutcome.changeSet();
    if (patch && typeof patch === 'string') {
      gitPatch = patch;
    }
  }

  // If we didn't find one via `changeSet()`, let's check generated files
  if (!gitPatch) {
    console.error(
      'No direct changeSet found. Fallback to getting generated files.'
    );
    const files = genOutcome.generatedFiles();
    const allFiles = files.all();
    if (allFiles.length > 0) {
      for (const file of allFiles) {
        const lineCount = file.content.split('\n').length;
        gitPatch += `--- a/${file.path}\n+++ b/${file.path}\n@@ -0,0 +1,${lineCount} @@\n`;
        gitPatch +=
          file.content
            .split('\n')
            .map((l: string) => '+' + l)
            .join('\n') + '\n';
      }
    }
  }

  if (!gitPatch) {
    console.error('No GitPatch data or generated files found in the generation session.');
    return null;
  }

  console.error(gitPatch.substring(0, 500) + '...\n(truncated for brevity)');
  return gitPatch;
}
