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

      // Create the Jules session
      const session = await jules.session(sessionOptions);
      console.error(`\n  [Jules] Session created: ${session.id}`);

      // Stream activities as they arrive (the SDK handles 404 retry internally)
      for await (const activity of session.stream()) {
        if (activity.type === 'agentMessaged') {
          const preview = activity.message.slice(0, 120);
          console.error(`  [Jules] Agent: ${preview}${activity.message.length > 120 ? '...' : ''}`);
        } else {
          console.error(`  [Jules] ${activity.type}`);
        }
      }

      // Get the final snapshot
      const snapshot = await session.snapshot();

      if (snapshot.state === 'failed') {
        return {
          success: false,
          error: {
            code: 'SESSION_FAILED',
            message: `Jules session failed. Session ID: ${session.id}`,
            recoverable: false,
          },
        };
      }

      const prUrl = snapshot.pr?.url;
      const filesCount = snapshot.generatedFiles.all().length;

      console.error(`  [Jules] Complete: ${filesCount} files generated\n`);

      return {
        success: true,
        data: {
          sessionId: session.id,
          state: snapshot.state,
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
