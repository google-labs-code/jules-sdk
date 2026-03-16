import { google } from 'googleapis';
import { RunSessionSpec, RunSessionInput, RunSessionResult } from './spec.js';
import { runRepolessSession, SessionOutcome } from '../_shared/run-session.js';

type ErrorCode = 'MISSING_CREDENTIALS' | 'SHEET_NOT_FOUND_OR_EMPTY' | 'API_ERROR' | 'JULES_ERROR' | 'UNKNOWN_ERROR';

export class GoogleSheetsSessionHandler implements RunSessionSpec {
  async execute(input: RunSessionInput): Promise<RunSessionResult> {
    try {
      this.validateCredentials();

      const sheetData = await this.fetchSheetData(input.spreadsheetId, input.range);

      if (!sheetData) {
        return this.fail('SHEET_NOT_FOUND_OR_EMPTY', 'No data in range.', true);
      }

      const outcome = await runRepolessSession(
        `${input.prompt}\n\n## Source Data\n${sheetData}`,
      );

      return this.success(outcome);
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  // --- Data Source ---

  /** Fetches spreadsheet data as a formatted string. */
  private async fetchSheetData(spreadsheetId: string, range: string): Promise<string | null> {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    const rows = response.data.values;
    if (!rows?.length) return null;

    return rows.map(row => row.join(', ')).join('\n');
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
