import { SessionAnalysisSpec, SessionAnalysisInput, SessionAnalysisResult } from './spec.js';
import { jules, JulesApiError } from '@google/jules-sdk';

export class SessionAnalysisHandler implements SessionAnalysisSpec {
  async execute(input: SessionAnalysisInput): Promise<SessionAnalysisResult> {
    try {
      const session = jules.session(input.sessionId);

      // Load session and activities to avoid cache-only selection issues
      const outcome = await session.info();

      let lastAgentMessage: string | undefined = undefined;
      const history = await session.history().toArray();
      const agentMessages = history.filter(a => a.type === 'agentMessaged');
      if (agentMessages.length > 0) {
        lastAgentMessage = agentMessages[agentMessages.length - 1].message;
      }

      // We rely on full session snapshot rather than partial cache queries
      const snapshot = session.snapshot();
      const files = snapshot?.generatedFiles;
      let generatedFilesCount = 0;
      if (files) {
         generatedFilesCount = typeof files.entries === 'function' ? [...files.entries()].length : Object.keys(files).length;
      }

      let summary = `Session ${outcome.id} is ${outcome.state}.`;
      if (history.length) {
         summary += ` It consists of ${history.length} activities.`;
      }

      return {
        success: true,
        data: {
          id: outcome.id,
          state: outcome.state,
          summary,
          totalActivities: history.length,
          generatedFilesCount,
          lastAgentMessage,
        },
      };

    } catch (error) {
      if (error instanceof JulesApiError) {
         return {
           success: false,
           error: {
             code: 'API_ERROR',
             message: error.message,
             recoverable: false,
           }
         };
      }
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
