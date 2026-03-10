import { jules, Session, Activity } from '@google/jules-sdk';
import { ReviewSpec, ReviewInput, ReviewResult } from './spec.js';

export class ReviewHandler implements ReviewSpec {
  async execute(input: ReviewInput): Promise<ReviewResult> {
    try {
      if (!process.env.JULES_API_KEY) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'JULES_API_KEY environment variable is not set.',
            suggestion: 'Export JULES_API_KEY="your-api-key" before running the CLI.',
            recoverable: true,
          },
        };
      }

      this.log(`Starting code generation session for ${input.repository}...`, input.json);

      const source = { github: input.repository, baseBranch: input.baseBranch };

      // 1. Generate bad code
      const codeGenSession = await jules.session({
        prompt: input.prompt,
        source,
      });

      this.log(`Code Generation Session ID: ${codeGenSession.id}`, input.json);

      // If the session isn't immediately finished, stream it until it is
      const genInfo = await codeGenSession.info();
      if (genInfo.state !== 'completed' && genInfo.state !== 'failed') {
         try {
             await this.streamSessionActivities(codeGenSession, 'Code Gen', input.json);
         } catch(e) {
             // Occasionally activities return 404 momentarily immediately after session creation
             // in some environments. Ignore and fall through to wait on result().
         }
      }

      const genOutcome = await codeGenSession.result();

      if (genOutcome.state === 'failed') {
        return {
          success: false,
          error: {
            code: 'SESSION_FAILED',
            message: `Code generation session failed: ${codeGenSession.id}`,
            recoverable: false,
          },
        };
      }

      // 2. Extract GitPatch
      const snapshot = codeGenSession.snapshot();
      let changeSet;

      // Type guarding the `snapshot.changeSet` function because the underlying SDK
      // abstraction may change or omit it.
      if (typeof snapshot.changeSet === 'function') {
         changeSet = snapshot.changeSet();
      }

      let gitPatchStr = '';

      if (changeSet && changeSet.gitPatch && changeSet.gitPatch.unidiffPatch) {
        // Prefer the raw unidiff patch from the GitPatch object if available
        gitPatchStr = changeSet.gitPatch.unidiffPatch;
      } else if (changeSet && typeof changeSet.parsed === 'function') {
         // Fallback to rebuilding it from parsed diff
         const parsed = changeSet.parsed();
         for(const file of parsed.files) {
             gitPatchStr += `--- a/${file.path}\n+++ b/${file.path}\n`;
             for(const chunk of file.chunks) {
                 gitPatchStr += `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@\n`;
                 for(const change of chunk.changes) {
                     if(change.type === 'add') gitPatchStr += `+${change.content}\n`;
                     if(change.type === 'del') gitPatchStr += `-${change.content}\n`;
                     if(change.type === 'normal') gitPatchStr += ` ${change.content}\n`;
                 }
             }
         }
      } else {
        // Fallback to checking generated files if changeset isn't structured nicely
         const files = genOutcome.generatedFiles();
         for (const [filename, content] of files.entries()) {
             gitPatchStr += `File: ${filename}\n${content.content}\n`;
         }
      }

      if (!gitPatchStr || gitPatchStr.trim() === '') {
        return {
          success: false,
          error: {
            code: 'NO_CHANGES_GENERATED',
            message: 'The agent did not generate any code changes.',
            recoverable: false,
          },
        };
      }

      this.log('\n--- Extracted Patch Content ---', input.json);
      this.log(gitPatchStr, input.json);
      this.log('-------------------------------\n', input.json);

      this.log('Starting review session...', input.json);

      // 3. Review the code
      const reviewSession = await jules.session({
        prompt: `Review the following code change patch and determine if it adheres to clean coding standards.
Provide a short summary of the issues found and how they should be fixed.

## Git Patch
\`\`\`diff
${gitPatchStr}
\`\`\`
`,
        source,
      });

      this.log(`Review Session ID: ${reviewSession.id}`, input.json);

      let reviewMessage = '';

      // Stream to get live updates and block until finished
      const revInfo = await reviewSession.info();
      if (revInfo.state !== 'completed' && revInfo.state !== 'failed') {
          try {
              for await (const activity of reviewSession.stream()) {
                 this.logActivity(activity, 'Review', input.json);
                 if (activity.type === 'agentMessaged') {
                      reviewMessage = activity.message;
                 }
              }
          } catch(e) {
              // Ignore stream fetch errors
          }
      }

      const reviewOutcome = await reviewSession.result();

      if (reviewOutcome.state === 'failed') {
        return {
          success: false,
          error: {
            code: 'SESSION_FAILED',
            message: `Review session failed: ${reviewSession.id}`,
            recoverable: false,
          },
        };
      }

      if (!reviewMessage) {
        // Check files if no message
        const files = reviewOutcome.generatedFiles();
        if (files.size > 0) {
           for (const [filename, content] of files.entries()) {
               reviewMessage += `\nFile: ${filename}\n${content.content}\n`;
           }
        } else {
           reviewMessage = "The review completed but the agent provided no feedback.";
        }
      }

      return {
        success: true,
        data: {
          codeGenSessionId: codeGenSession.id,
          reviewSessionId: reviewSession.id,
          gitPatchStr,
          reviewMessage,
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

  private async streamSessionActivities(session: Session, prefix: string, isJson: boolean) {
    for await (const activity of session.stream()) {
        this.logActivity(activity, prefix, isJson);
    }
  }

  private logActivity(activity: Activity, prefix: string, isJson: boolean) {
      if (activity.type === 'progressUpdated') {
         this.log(`[${prefix}] ${activity.title}`, isJson);
      } else if (activity.type === 'agentMessaged') {
         this.log(`[${prefix} Agent]: ${activity.message}`, isJson);
      } else if (activity.type === 'planGenerated') {
         this.log(`[${prefix}] Generated plan with ${activity.plan.steps.length} steps.`, isJson);
      }
  }

  private log(message: string, isJson: boolean) {
    if (isJson) {
      console.error(message);
    } else {
      console.log(message);
    }
  }
}
