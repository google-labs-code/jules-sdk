import { jules } from '@google/jules-sdk';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

/**
 * AI SDK Integration Example
 *
 * This example demonstrates how to integrate the Vercel AI SDK
 * with the Jules SDK by creating an AI-powered application that
 * can delegate coding tasks to Jules using an AI tool.
 */
async function main() {
  console.log('Starting AI SDK Integration Example...');

  // The task we want the general AI model to handle, which involves coding
  const userRequest =
    'Please fix the visibility issues in the repository "your-org/your-repo" on branch "main". The backgrounds are too light and there is low contrast on button hovers.';

  console.log(`User Request: "${userRequest}"`);

  // We use Vercel AI SDK to generate a response, providing it with
  // a tool that can execute coding tasks via Jules.
  const { text, toolCalls, toolResults } = await generateText({
    model: openai('gpt-4o'), // Or your preferred OpenAI model
    prompt: userRequest,
    tools: {
      executeCodingTask: tool({
        description:
          'Executes a complex coding task in an ephemeral cloud environment and returns the result (like a PR URL).',
        parameters: z.object({
          prompt: z
            .string()
            .describe(
              'Detailed instructions for the coding task, including what needs to be changed.',
            ),
          githubRepo: z
            .string()
            .describe(
              'The GitHub repository in the format "owner/repo".',
            ),
          baseBranch: z
            .string()
            .describe('The base branch to make the changes against.'),
        }),
        execute: async ({ prompt, githubRepo, baseBranch }) => {
          console.log(`\nTool 'executeCodingTask' invoked!`);
          console.log(`  Repo: ${githubRepo} (${baseBranch})`);
          console.log(`  Prompt: ${prompt}\n`);

          try {
            // Note: In a real scenario, you'd use a real repository you have access to.
            // For this example, if the githubRepo is "your-org/your-repo", we'll run a repoless session
            // to simulate the behavior, or use a known public repo.
            const useRepoless = githubRepo === 'your-org/your-repo';

            const sessionOptions: any = {
              prompt,
            };

            if (!useRepoless) {
              sessionOptions.source = {
                github: githubRepo,
                baseBranch: baseBranch,
              };
              sessionOptions.autoPr = true;
            } else {
              // Simulate a basic repoless task if dummy repo provided
              sessionOptions.prompt = `Simulate a fix for: ${prompt}`;
            }

            // Create and start the Jules session
            const session = await jules.session(sessionOptions);
            console.log(`  Jules session created: ${session.id}`);
            console.log(`  Waiting for session to complete...`);

            // Wait for the session to complete
            const outcome = await session.result();
            console.log(`  Session finished with state: ${outcome.state}`);

            if (outcome.pullRequest) {
              return `Successfully completed the task. A Pull Request has been created: ${outcome.pullRequest.url}`;
            } else if (outcome.state === 'succeeded') {
              const files = outcome.generatedFiles();
              return `Successfully completed the task. Generated ${files.size} files in a repoless environment.`;
            } else {
              return `Failed to complete the task. Session state: ${outcome.state}`;
            }
          } catch (error: any) {
            console.error('  Error during Jules session:', error);
            return `Failed to execute coding task due to an error: ${error.message}`;
          }
        },
      }),
    },
    maxSteps: 2, // Allow the model to call the tool and then respond to the user
  });

  console.log('\n--- Final Response from AI ---');
  console.log(text);
  console.log('------------------------------');

  if (toolCalls && toolCalls.length > 0) {
    console.log('\nTool Calls Made:');
    for (const call of toolCalls) {
      console.log(`- ${call.toolName} with args:`, call.args);
    }
  }
}

// Ensure required environment variables are set
if (!process.env.JULES_API_KEY) {
  console.error('Error: JULES_API_KEY environment variable is missing.');
  console.log('Please set it using: export JULES_API_KEY=<your-key>');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is missing.');
  console.log('Please set it using: export OPENAI_API_KEY=<your-key>');
  process.exit(1);
}

main().catch(console.error);
