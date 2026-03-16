import { jules, ChangeSetArtifact, Activity } from '@google/jules-sdk';
import type { AnalyzeGitPatchSpec, AnalyzeGitPatchInput, AnalyzeGitPatchResult } from './spec.js';
import { logStream } from '../_shared/log-stream.js';

export class AnalyzeGitPatchHandler implements AnalyzeGitPatchSpec {
  async execute(input: AnalyzeGitPatchInput): Promise<AnalyzeGitPatchResult> {
    try {
      // 1. Find a recent GitPatch from the local cache
      const patch = await this.findRecentPatch(input.limit);
      if (!patch) {
        return this.fail(
          'NO_GITPATCH_FOUND',
          'No recent GitPatch data in local cache. Run a code-modifying session first.',
          true,
        );
      }

      console.log(`Found patch from session ${patch.sessionId}. Analyzing...`);

      // 2. Analyze the patch
      const analysis = await this.analyzePatch(patch.diff, input.sourceRepo);
      if (!analysis) {
        return this.fail('SESSION_FAILED', 'Agent did not produce an analysis.', true);
      }

      return {
        success: true,
        data: { analysis, sourceSessionId: patch.sessionId },
      };
    } catch (error) {
      return this.fail('UNKNOWN_ERROR', error instanceof Error ? error.message : String(error));
    }
  }

  /** Searches the local activity cache for a recent changeset with diff data. */
  private async findRecentPatch(limit: number): Promise<{ diff: string; sessionId: string } | null> {
    console.log(`Searching recent ${limit} activities for a GitPatch...`);

    const activities = await jules.select({
      from: 'activities',
      order: 'desc',
      limit,
    });

    for (const activity of activities) {
      const changeSet = this.extractChangeSet(activity);
      if (changeSet) {
        return {
          diff: changeSet,
          sessionId: activity.session?.id || 'unknown',
        };
      }
    }

    return null;
  }

  /** Extracts unidiff data from an activity's changeSet artifact. */
  private extractChangeSet(activity: Activity): string | null {
    for (const artifact of activity.artifacts ?? []) {
      if (artifact.type === 'changeSet') {
        const patch = (artifact as ChangeSetArtifact).gitPatch?.unidiffPatch;
        if (patch) return patch;
      }
    }
    return null;
  }

  /** Creates a Jules session to analyze a diff and produce a review.md file. */
  private async analyzePatch(diff: string, sourceRepo: string): Promise<string | null> {
    const session = await jules.session({
      prompt: `You are an expert code reviewer. Analyze the following diff and write your review to a file called \`review.md\`.

The review should be formatted as a GitHub PR comment in markdown:
- Start with a summary of the changes
- Use \`### Bugs\`, \`### Optimizations\`, \`### Style\` sections
- Reference specific files and line numbers where relevant
- End with a \`### Verdict\` section (approve, request changes, or comment)

\`\`\`diff
${diff}
\`\`\``,
      source: { github: sourceRepo, baseBranch: 'main' },
    });

    console.log(`Analysis session: ${session.id}`);

    // Non-blocking: resolve with the generated review.md content
    const reviewContent = session.result().then(outcome => {
      console.log(`Analysis ${outcome.state}.`);

      const reviewFile = outcome.generatedFiles().get('review.md');

      return reviewFile?.content ?? null;
    });

    // Stream progress while waiting
    await logStream(session, {
      progressUpdated: (a) => console.log(`  [Analysis] ${a.title}`),
    });

    return reviewContent;
  }

  private fail(code: 'NO_GITPATCH_FOUND' | 'SESSION_FAILED' | 'UNKNOWN_ERROR', message: string, recoverable = false): AnalyzeGitPatchResult {
    return { success: false as const, error: { code, message, recoverable } };
  }
}
