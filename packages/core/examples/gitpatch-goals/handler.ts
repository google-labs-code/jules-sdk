import { ReviewInput, ReviewResult, ReviewSpec } from './spec.js';
import { generateCode } from './generate.js';
import { extractGitPatch } from './patch.js';
import { reviewCode } from './review.js';

/**
 * Orchestrator Handler that runs the generation and review workflow.
 * Uses Typed Service Contract implementation to encapsulate errors.
 */
export class ReviewHandler implements ReviewSpec {
  async execute(input: ReviewInput): Promise<ReviewResult> {
    try {
      // 1. Generation phase
      const genSession = await generateCode(input.prompt);
      const genOutcome = await genSession.result();

      if (genOutcome.state !== 'completed') {
        return {
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: `Generation session failed with state: ${genOutcome.state}`,
            recoverable: false,
          },
        };
      }

      // 2. Patch extraction phase
      const gitPatch = extractGitPatch(genOutcome);

      if (!gitPatch) {
        return {
          success: false,
          error: {
            code: 'NO_PATCH_FOUND',
            message: 'Failed to extract GitPatch from generation session.',
            recoverable: false,
          },
        };
      }

      // 3. Review phase
      const reviewOutcome = await reviewCode(input.prompt, gitPatch);

      if (reviewOutcome.state !== 'completed') {
        return {
          success: false,
          error: {
            code: 'REVIEW_FAILED',
            message: `Review session failed with state: ${reviewOutcome.state}`,
            recoverable: false,
          },
        };
      }

      // 4. Result Formatting
      let reviewMessage = 'No final message provided by the review agent.';
      const activities = reviewOutcome.activities ?? [];
      const agentMessages = activities.filter((a) => a.type === 'agentMessaged');

      if (agentMessages.length > 0) {
        reviewMessage = agentMessages[agentMessages.length - 1].message;
      } else {
        const files = reviewOutcome.generatedFiles();
        if (files.size > 0) {
          reviewMessage = '';
          for (const [filename, content] of files.entries()) {
            reviewMessage += `\nFile: ${filename}\n${content.content}\n`;
          }
        }
      }

      return {
        success: true,
        data: {
          reviewMessage,
          patchSize: gitPatch.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        },
      };
    }
  }
}
