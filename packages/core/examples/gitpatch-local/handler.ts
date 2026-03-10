import { jules } from '@google/jules-sdk';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ApplyPatchSpec, ApplyPatchInput, ApplyPatchResult } from './spec.js';

export class ApplyPatchHandler implements ApplyPatchSpec {
  async execute(input: ApplyPatchInput): Promise<ApplyPatchResult> {
    const branchName = input.targetBranch || `jules-patch-test-${Date.now()}`;
    let patchPath: string | null = null;
    let commitMessage: string | undefined;

    try {
      // 1. Fetch Session Snapshot Data directly instead of querying cache
      let snapshot;
      try {
        const session = jules.session(input.sessionId);
        snapshot = await session.snapshot();
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Could not fetch session snapshot: ${input.sessionId}`,
            recoverable: false,
          },
        };
      }

      // 2. Extract the unidiff patch from the changeSet
      const gitPatch = snapshot.changeSet()?.gitPatch;
      if (!gitPatch || !gitPatch.unidiffPatch) {
        return {
          success: false,
          error: {
            code: 'NO_CHANGESET_FOUND',
            message: `No ChangeSet artifact with gitPatch data found in session ${input.sessionId}.`,
            recoverable: false,
          },
        };
      }

      commitMessage = gitPatch.suggestedCommitMessage || 'Applied changes from Jules';

      // 3. Handle Dry Run Safety Rails
      if (input.dryRun) {
        return {
          success: true,
          data: {
            branchName: `[DRY RUN] ${branchName}`,
            commitMessage: `[DRY RUN] ${commitMessage}`,
          },
        };
      }

      // 4. Checkout a new branch to apply the changes
      try {
        execFileSync('git', ['checkout', '-b', branchName], { stdio: 'pipe' });
      } catch (e: any) {
        return {
          success: false,
          error: {
            code: 'UNABLE_TO_CHECKOUT_BRANCH',
            message: `Failed to checkout branch ${branchName}. Ensure you are in a git repository. ${e.message}`,
            recoverable: true,
          },
        };
      }

      // 5. Save the patch to disk
      patchPath = join(process.cwd(), 'jules_changes.patch');
      writeFileSync(patchPath, gitPatch.unidiffPatch);

      // 6. Apply the patch
      try {
        execFileSync('git', ['apply', patchPath], { stdio: 'pipe' });
      } catch (e: any) {
        return {
          success: false,
          error: {
            code: 'UNABLE_TO_APPLY_PATCH',
            message: `Failed to apply patch. It may conflict with your current local state. ${e.message}`,
            recoverable: true,
          },
        };
      }

      // 7. Commit the applied changes
      try {
        execFileSync('git', ['add', '.'], { stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', commitMessage], { stdio: 'pipe' });
      } catch (e: any) {
        return {
          success: false,
          error: {
            code: 'UNABLE_TO_COMMIT',
            message: `Failed to commit the changes. ${e.message}`,
            recoverable: true,
          },
        };
      }

      // 8. Success
      return {
        success: true,
        data: {
          branchName,
          commitMessage,
        },
      };
    } catch (error) {
      // 8. Safety net for unknown exceptions
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        },
      };
    } finally {
      // 9. Clean up the patch file if it exists
      if (patchPath) {
        try {
          unlinkSync(patchPath);
        } catch (e) {
          // Ignore unlink errors
        }
      }
    }
  }
}
