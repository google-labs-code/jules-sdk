import { jules } from '@google/jules-sdk';
import { google } from 'googleapis';
import { RunSessionSpec, RunSessionInput, RunSessionResult } from './spec.js';

export class GoogleDocsSessionHandler implements RunSessionSpec {
  async execute(input: RunSessionInput): Promise<RunSessionResult> {
    try {
      if (!process.env.JULES_API_KEY) {
        return {
          success: false,
          error: {
            code: 'MISSING_CREDENTIALS',
            message: 'JULES_API_KEY environment variable is not set.',
            recoverable: true,
          },
        };
      }

      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/documents.readonly'],
      });

      const docs = google.docs({ version: 'v1', auth });

      let response;
      try {
        response = await docs.documents.get({
          documentId: input.documentId,
        });
      } catch (authErr: any) {
        if (authErr.message && authErr.message.includes('Could not load the default credentials')) {
          return {
            success: false,
            error: {
              code: 'MISSING_CREDENTIALS',
              message: 'Google Application Default Credentials not found. Please set GOOGLE_APPLICATION_CREDENTIALS.',
              recoverable: true,
            },
          };
        }
        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message: `Google Docs API Error: ${authErr.message || String(authErr)}`,
            recoverable: false,
          },
        };
      }

      const document = response.data;
      if (!document || !document.body || !document.body.content) {
        return {
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND_OR_EMPTY',
            message: 'No content found in the specified document.',
            recoverable: true,
          },
        };
      }

      const extractText = (content: any[]): string => {
        let text = '';
        for (const element of content) {
          if (element.paragraph && element.paragraph.elements) {
            for (const pElement of element.paragraph.elements) {
              if (pElement.textRun && pElement.textRun.content) {
                text += pElement.textRun.content;
              }
            }
          }
        }
        return text;
      };

      const docContext = extractText(document.body.content);
      if (!docContext.trim()) {
        return {
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND_OR_EMPTY',
            message: 'No text content found in the specified document.',
            recoverable: true,
          },
        };
      }

      const finalPrompt = `${input.prompt}\n\n## Source Document Content\n${docContext}`;

      let session;
      try {
        session = await jules.session({ prompt: finalPrompt });
      } catch (julesErr: any) {
         return {
          success: false,
          error: {
            code: 'JULES_ERROR',
            message: `Jules Session Creation Error: ${julesErr.message || String(julesErr)}`,
            recoverable: false,
          },
        };
      }

      const outcome = await session.result();

      let agentMessage = undefined;
      let generatedFiles: Record<string, string> = {};

      if (outcome.state === 'completed') {
        try {
           const activities = await jules.select({
            from: 'activities',
            where: { type: 'agentMessaged', 'session.id': session.id },
            order: 'desc',
            limit: 1,
          });

          if (activities.length > 0) {
            agentMessage = activities[0].message;
          } else {
             const files = outcome.generatedFiles();
             if (files.size > 0) {
                 for (const [filename, content] of files.entries()) {
                     generatedFiles[filename] = content.content;
                 }
             }
          }
        } catch (queryErr) {
             console.error('Failed to query local cache for agent messages:', queryErr);
        }
      }

      return {
        success: true,
        data: {
          sessionId: session.id,
          state: outcome.state,
          agentMessage,
          files: Object.keys(generatedFiles).length > 0 ? generatedFiles : undefined,
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
