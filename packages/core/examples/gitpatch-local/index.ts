import { jules } from '@google/jules-sdk';
import { execSync, execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Gitpatch Local Example
 *
 * Demonstrates how to use Jules' session GitPatch data to download
 * and patch the code locally in a new branch on the user's machine.
 */
async function main() {
  if (!process.env.JULES_API_KEY) {
    console.error('Error: JULES_API_KEY environment variable is not set.');
    console.error('Please set it using: export JULES_API_KEY="your-api-key"');
    process.exit(1);
  }

  // Set up a simple target file to be modified by the agent
  const testFileName = 'test_patch_target.txt';
  const testFilePath = join(process.cwd(), testFileName);
  writeFileSync(testFilePath, 'This is a test file.\nIt will be modified by Jules.\n');

  // Let's create a local branch to apply changes to
  const branchName = `jules-patch-test-${Date.now()}`;
  try {
    console.log(`Creating a new local branch: ${branchName}`);
    execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`Failed to create branch. Are you in a git repository?`);
    // Fallback for execution outside git repos, but ideally this runs in one.
  }

  console.log('Creating a new Jules session...');
  try {
    // 1. Create a session asking for a specific code change
    const session = await jules.session({
      prompt: `Modify the file named ${testFileName}. Change the second line to say "It has been modified by Jules!"`,
    });

    console.log(`Session created! ID: ${session.id}`);
    console.log('Waiting for the agent to complete the task...');

    // 2. Await the result of the session
    const outcome = await session.result();
    console.log(`\nSession completed with state: ${outcome.state}`);

    if (outcome.state === 'completed') {
      console.log('\nSearching for changeSet artifacts...');

      // 3. Retrieve the activities to find the changeSet artifact
      // In this example we query activities, but we could also use outcome.generatedFiles()
      // or session.stream() depending on the workflow.
      const activities = await jules.select({
        from: 'activities',
        where: { 'session.id': session.id },
      });

      let patchApplied = false;

      for (const activity of activities) {
        if (!activity.artifacts) continue;

        for (const artifact of activity.artifacts) {
          if (artifact.type === 'changeSet') {
            console.log('Found a changeSet artifact!');

            const gitPatch = artifact.gitPatch;
            if (gitPatch && gitPatch.unidiffPatch) {
              const patchPath = join(process.cwd(), 'jules_changes.patch');

              // 4. Save the unidiff patch locally
              console.log(`Writing patch to ${patchPath}...`);
              writeFileSync(patchPath, gitPatch.unidiffPatch);

              // 5. Apply the patch using git
              console.log('Applying the patch locally...');
              try {
                // Using git apply to apply the patch
                execFileSync('git', ['apply', patchPath], { stdio: 'inherit' });
                console.log('Patch applied successfully!');

                // Commit the changes
                // Using execFileSync to avoid shell command injection vulnerabilities
                execFileSync('git', ['add', testFileName], { stdio: 'inherit' });
                const commitMsg = gitPatch.suggestedCommitMessage || 'Applied changes from Jules';
                execFileSync('git', ['commit', '-m', commitMsg], { stdio: 'inherit' });
                console.log(`Changes committed to branch ${branchName}!`);
                patchApplied = true;
              } catch (applyError) {
                console.error('Failed to apply or commit the patch:', applyError);
              } finally {
                // Clean up the patch file
                try {
                  unlinkSync(patchPath);
                } catch (e) {}
              }
            }
          }
        }
      }

      if (!patchApplied) {
        console.log('No patch was generated or applied.');
      }

    } else {
      console.error('The session did not complete successfully.');
    }
  } catch (error) {
    console.error('An error occurred during the session:', error);
  } finally {
    // Clean up test target file
    try {
      unlinkSync(testFilePath);
      console.log(`\nThe branch '${branchName}' has been left locally for you to inspect!`);
      console.log(`When you are done, you can delete it with: git checkout - && git branch -D ${branchName}`);
    } catch (e) {}
  }
}

// Run the example
main();
