import { jules, SessionClient, Activity, ParsedFile } from '@google/jules-sdk';
import { ReviewSpec, ReviewInput, ReviewResult } from './spec.js';
import { logStream } from '../../_shared/log-stream.js';

type ErrorCode = 'SESSION_FAILED' | 'NO_CHANGES_GENERATED' | 'UNKNOWN_ERROR' | 'UNAUTHORIZED';

export class ReviewHandler implements ReviewSpec {
  async execute(input: ReviewInput): Promise<ReviewResult> {
    try {
      if (!process.env.JULES_API_KEY) {
        return this.fail('UNAUTHORIZED', 'JULES_API_KEY is not set.', true);
      }

      const source = { github: input.repository, baseBranch: input.baseBranch };

      // 1. Generate code and extract the diff
      const gitPatch = await this.generateCode(input.prompt, source, input.json);
      if (!gitPatch) {
        return this.fail('NO_CHANGES_GENERATED', 'Agent generated no changes.');
      }

      // 2. Review the generated code
      const reviewMessage = await this.reviewPatch(gitPatch, source, input.json);

      return {
        success: true,
        data: {
          codeGenSessionId: '',
          reviewSessionId: '',
          gitPatchStr: gitPatch,
          reviewMessage,
        },
      };
    } catch (error) {
      return this.fail('UNKNOWN_ERROR', error instanceof Error ? error.message : String(error));
    }
  }

  /** Generates code and extracts the git patch from the session snapshot. */
  private async generateCode(
    prompt: string,
    source: { github: string; baseBranch: string },
    json: boolean,
  ): Promise<string | null> {
    this.log('Starting code generation...', json);

    const session = await jules.session({ prompt, source });
    this.log(`Code Gen: ${session.id}`, json);

    session.result().then(o => this.log(`Code Gen: ${o.state}`, json));
    await logStream(session, {
      progressUpdated: (a) => this.log(`[Gen] ${a.title}`, json),
      agentMessaged: (a) => this.log(`[Gen] ${a.message}`, json),
      planGenerated: (a) => this.log(`[Gen] Plan: ${a.plan.steps.length} steps`, json),
    });

    const snapshot = await session.snapshot();
    if (snapshot.state === 'failed') return null;

    // Prefer the raw unidiff patch
    const changeSet = snapshot.changeSet();
    if (changeSet?.gitPatch?.unidiffPatch) {
      return changeSet.gitPatch.unidiffPatch;
    }

    // Fallback: build a summary from parsed file metadata
    if (changeSet && typeof changeSet.parsed === 'function') {
      const files = changeSet.parsed().files;
      return files.map(fileSummary).join('\n');
    }

    return null;
  }

  /** Reviews a git patch and returns the review message. */
  private async reviewPatch(
    gitPatch: string,
    source: { github: string; baseBranch: string },
    json: boolean,
  ): Promise<string> {
    this.log('Starting review...', json);

    const session = await jules.session({
      prompt: `Review this patch for clean coding standards. Summarize issues and fixes.\n\n\`\`\`diff\n${gitPatch}\n\`\`\``,
      source,
    });

    this.log(`Review: ${session.id}`, json);

    let message = '';

    session.result().then(o => this.log(`Review: ${o.state}`, json));
    await logStream(session, {
      progressUpdated: (a) => this.log(`[Review] ${a.title}`, json),
      agentMessaged: (a) => {
        message = a.message;
        this.log(`[Review] ${a.message}`, json);
      },
      planGenerated: (a) => this.log(`[Review] Plan: ${a.plan.steps.length} steps`, json),
    });

    return message || 'No feedback provided.';
  }

  private fail(code: ErrorCode, message: string, recoverable = false): ReviewResult {
    return { success: false as const, error: { code, message, recoverable } };
  }

  private log(msg: string, json: boolean) {
    json ? console.error(msg) : console.log(msg);
  }
}

/** Formats a single file change as a diff-like summary line. */
function fileSummary(file: ParsedFile): string {
  return `--- a/${file.path}\n+++ b/${file.path}\n@@ ${file.changeType}: +${file.additions}/-${file.deletions} @@`;
}
