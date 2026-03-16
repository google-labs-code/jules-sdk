import { google } from 'googleapis';
import { RunSessionSpec, RunSessionInput, RunSessionResult } from './spec.js';
import { runRepolessSession, SessionOutcome } from '../_shared/run-session.js';

type ErrorCode = 'MISSING_CREDENTIALS' | 'DOCUMENT_NOT_FOUND_OR_EMPTY' | 'API_ERROR' | 'JULES_ERROR' | 'UNKNOWN_ERROR';

export class GoogleDocsSessionHandler implements RunSessionSpec {
  async execute(input: RunSessionInput): Promise<RunSessionResult> {
    try {
      this.validateCredentials();

      const docText = await this.fetchDocumentText(input.documentId);

      if (!docText) {
        return this.fail('DOCUMENT_NOT_FOUND_OR_EMPTY', 'No text in document.', true);
      }

      const outcome = await runRepolessSession(
        `${input.prompt}\n\n## Source Document Content\n${docText}`,
      );

      return this.success(outcome);
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  // --- Data Source ---

  /** Fetches and extracts plain text from a Google Doc. */
  private async fetchDocumentText(documentId: string): Promise<string | null> {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });
    const docs = google.docs({ version: 'v1', auth });
    const response = await docs.documents.get({ documentId });

    const elements = response.data?.body?.content;
    if (!elements) return null;

    const text = elements
      .map(extractParagraphText)
      .join('');

    return text.trim() || null;
  }

  // --- Result Builders ---

  private validateCredentials(): void {
    if (!process.env.JULES_API_KEY) throw Object.assign(new Error('JULES_API_KEY is not set.'), { code: 'MISSING_CREDENTIALS' as const, recoverable: true });
  }

  private success(outcome: SessionOutcome): RunSessionResult {
    return {
      success: true,
      data: {
        sessionId: '',
        state: 'completed',
        agentMessage: outcome.agentMessage,
        files: outcome.files,
      },
    };
  }

  private fail(code: ErrorCode, message: string, recoverable = false): RunSessionResult {
    return { success: false as const, error: { code, message, recoverable } };
  }

  private handleError(error: any): RunSessionResult {
    if (error.code === 'MISSING_CREDENTIALS') {
      return this.fail('MISSING_CREDENTIALS', error.message, true);
    }
    if (error.message?.includes('Could not load the default credentials')) {
      return this.fail('MISSING_CREDENTIALS', 'Set GOOGLE_APPLICATION_CREDENTIALS.', true);
    }
    return this.fail('UNKNOWN_ERROR', error.message ?? String(error));
  }
}

/** Extracts plain text from a Google Doc structural element (paragraph). */
function extractParagraphText(element: any): string {
  const textRuns = element.paragraph?.elements ?? [];
  return textRuns
    .map((run: any) => run.textRun?.content ?? '')
    .join('');
}
