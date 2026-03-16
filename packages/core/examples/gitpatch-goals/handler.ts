import { ReviewInput, ReviewResult, ReviewSpec } from './spec.js';
import { generateCode } from './generate.js';
import { reviewCode } from './review.js';

export class ReviewHandler implements ReviewSpec {
  async execute(input: ReviewInput): Promise<ReviewResult> {
    try {
      if (input.dryRun) {
        return {
          success: true,
          data: { reviewMessage: '[DRY RUN] Code met the original goals.', patchSize: 42 },
        };
      }

      // 1. Generate code (streams internally)
      const genSession = await generateCode(input.prompt);

      // Stream the generation session
      let genState = 'unknown';

      genSession.result().then(outcome => {
        genState = outcome.state;
        console.error(`Generation session ${outcome.state}.`);
      });

      for await (const activity of genSession.stream()) {
        if (activity.type === 'agentMessaged') {
          console.error(`[Gen]: ${activity.message.slice(0, 100)}...`);
        }
      }

      // After stream, get snapshot for changeset
      const snapshot = await genSession.snapshot();
      if (snapshot.state === 'failed') {
        return {
          success: false,
          error: { code: 'GENERATION_FAILED', message: 'Generation session failed.', recoverable: false },
        };
      }

      // 2. Extract patch
      const changeSet = snapshot.changeSet();
      const gitPatch = changeSet?.gitPatch?.unidiffPatch;

      if (!gitPatch) {
        return {
          success: false,
          error: { code: 'NO_PATCH_FOUND', message: 'No GitPatch found in generation output.', recoverable: false },
        };
      }

      // 3. Review code (streams internally)
      const { outcome: reviewOutcome, reviewMessage } = await reviewCode(input.prompt, gitPatch);

      if (reviewOutcome.state === 'failed') {
        return {
          success: false,
          error: { code: 'REVIEW_FAILED', message: 'Review session failed.', recoverable: false },
        };
      }

      return {
        success: true,
        data: { reviewMessage, patchSize: gitPatch.length },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : String(error), recoverable: false },
      };
    }
  }
}
