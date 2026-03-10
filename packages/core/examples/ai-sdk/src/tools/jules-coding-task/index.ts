import { tool } from 'ai';
import { JulesCodingTaskInputSchema } from './spec.js';
import { JulesCodingTaskHandler } from './handler.js';

export const executeCodingTask = tool({
  description: 'Executes a complex coding task in an ephemeral cloud environment and returns the result (like a PR URL).',
  parameters: JulesCodingTaskInputSchema,
  execute: async (input) => {
    const handler = new JulesCodingTaskHandler();
    const result = await handler.execute(input);

    // Provide output formatting tailored to the AI context to easily parse the final success/failure
    if (!result.success) {
      return `Failed: ${result.error.code} - ${result.error.message}`;
    }

    if (result.data.pullRequestUrl) {
      return `Success: Task completed. PR Created at ${result.data.pullRequestUrl}`;
    }

    return `Success: Task completed. ${result.data.generatedFilesCount} files generated in repoless session. Session ID: ${result.data.sessionId}`;
  },
});
