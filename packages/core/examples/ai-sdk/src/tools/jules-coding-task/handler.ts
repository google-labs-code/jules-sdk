import { jules } from '@google/jules-sdk';
import { JulesCodingTaskSpec, JulesCodingTaskInput, JulesCodingTaskResult } from './spec.js';

export class JulesCodingTaskHandler implements JulesCodingTaskSpec {
  async execute(input: JulesCodingTaskInput): Promise<JulesCodingTaskResult> {
    try {
      if (!process.env.JULES_API_KEY) {
        return {
          success: false,
          error: {
            code: 'MISSING_CREDENTIALS',
            message: 'JULES_API_KEY environment variable is missing.',
            recoverable: false,
          },
        };
      }

      const sessionOptions: any = {
        prompt: input.prompt,
      };

      if (input.githubRepo) {
        sessionOptions.source = {
          github: input.githubRepo,
          baseBranch: input.baseBranch || 'main',
        };
        sessionOptions.autoPr = true;
      }

      // Agent DX: Dry run validation intercept
      if (input.dryRun) {
        return {
          success: true,
          data: {
            sessionId: "dry-run-session",
            state: "succeeded",
            pullRequestUrl: "https://github.com/dry-run/mock-pr",
            generatedFilesCount: 0,
          }
        };
      }

      // Create and start the Jules session
      const session = await jules.session(sessionOptions);

      // Await final result (do not use cache/select for the current running task)
      const outcome = await session.result();

      if (outcome.state === 'failed') {
        return {
          success: false,
          error: {
            code: 'SESSION_FAILED',
            message: `Jules session failed. Session ID: ${session.id}`,
            recoverable: false,
          },
        };
      }

      const prUrl = outcome.pullRequest?.url;
      const filesCount = outcome.generatedFiles().size;

      return {
        success: true,
        data: {
          sessionId: session.id,
          state: outcome.state,
          pullRequestUrl: prUrl,
          generatedFilesCount: filesCount,
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
